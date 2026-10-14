import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, type ClienteRow, type DisputaRow, type LicitacaoRow } from "@/lib/db";
import Portal, { type CartaoPortal, type ExigenciasCliente } from "@/components/Portal";
import { dataDaSessao, type FichaEdital } from "@/lib/ficha";
import { checklistHabilitacao, pendenciasHabilitacao } from "@/lib/documentos";
import { DECLARACAO_APROVACAO } from "@/lib/etapas";
import { limparObjeto } from "@/lib/formato";
import { listar as listarCofre } from "@/lib/cofre";
import Cofre from "@/components/Cofre";
import PreparoPortal from "@/components/PreparoPortal";
import type { Preparo } from "@/lib/preparo";
import { ptLink, ptPedirUpload, ptRegistrar } from "./acoes";

export const dynamic = "force-dynamic";

// O token está na URL: nada de indexar, e nada de mandar a URL como Referer
// quando o cliente clica no link do edital.
export const metadata: Metadata = {
  title: "Suas licitações",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const VISIVEIS = [
  "aguardando_cliente",
  "aprovada",
  "em_preparacao",
  "proposta_enviada",
  "em_disputa",
  "ganhou",
  "perdeu",
];

export default async function PortalCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();

  const supabase = db();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, razao_social, nome_fantasia, contato_nome")
    .eq("token_portal", token)
    .eq("ativo", true)
    .maybeSingle<Pick<ClienteRow, "id" | "razao_social" | "nome_fantasia" | "contato_nome">>();
  if (!cliente) notFound();

  const noventaDias = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data } = await supabase
    .from("disputas")
    .select("*, licitacao:licitacoes(*)")
    .eq("cliente_id", cliente.id)
    .in("status", VISIVEIS)
    .gte("updated_at", noventaDias)
    .order("updated_at", { ascending: false });

  // Resumo em linguagem simples: o da análise rápida ou, se o edital já foi
  // lido, o da ficha (mais completo).
  const idsLicitacao = (data ?? []).map((d) => d.licitacao_id as string);
  const { data: fichasRaw } = idsLicitacao.length
    ? await supabase.from("fichas_edital").select("licitacao_id, ficha").in("licitacao_id", idsLicitacao)
    : { data: [] };
  const fichas = new Map((fichasRaw ?? []).map((f) => [f.licitacao_id as string, f.ficha as FichaEdital]));
  const documentos = await listarCofre(cliente.id);

  // Para as licitações esperando decisão: o que o edital exige, cruzado com o
  // cofre do cliente na data da sessão. É o que ele precisa saber para dizer sim.
  function exigenciasDe(licitacaoId: string, encerramento: string | null): ExigenciasCliente | null {
    const f = fichas.get(licitacaoId);
    if (!f) return null;
    const itens = checklistHabilitacao(f.documentos_exigidos, documentos, dataDaSessao(f.sessao.data_hora) ?? encerramento);
    const p = pendenciasHabilitacao(itens);
    return {
      documentos: [
        ...p.falta.map((i) => ({ rotulo: i.rotulo, situacao: "falta" as const })),
        ...p.vencido.map((i) => ({ rotulo: i.rotulo, situacao: "vencido" as const })),
        ...p.venceAntes.map((i) => ({ rotulo: i.rotulo, situacao: "vence_antes" as const })),
      ],
      documentosProntos: itens.length - p.total,
      tecnicas: f.exigencias_tecnicas ?? [],
      visita: f.visita_tecnica,
      amostra: f.amostra,
      garantia: f.garantia,
      entrega: f.prazos?.entrega_execucao ?? null,
      sessao: f.sessao?.data_hora ?? null,
    };
  }

  // Só o que o cliente precisa ver. Score, termos, notas internas e análise
  // técnica ficam do lado de cá.
  const cartoes: CartaoPortal[] = ((data ?? []) as (DisputaRow & { licitacao: LicitacaoRow })[]).map(
    (d) => ({
      id: d.id,
      status: d.status,
      resumo: fichas.get(d.licitacao_id)?.resumo_cliente || d.analise_ia?.resumo_cliente || null,
      objeto: limparObjeto(d.licitacao.objeto),
      orgao: d.licitacao.orgao_razao_social,
      local: [d.licitacao.municipio, d.licitacao.uf].filter(Boolean).join("/"),
      modalidade: d.licitacao.modalidade_nome,
      valorEstimado: d.licitacao.valor_estimado,
      encerramento: d.licitacao.data_encerramento_proposta,
      link: d.licitacao.link_pncp ?? d.licitacao.link_sistema_origem,
      precoMinimo: d.preco_minimo,
      exigencias:
        d.status === "aguardando_cliente" ? exigenciasDe(d.licitacao_id, d.licitacao.data_encerramento_proposta) : null,
    })
  );

  // Consulta à parte: se a coluna ainda não existir no banco, o portal abre
  // sem a seção de preparação em vez de cair.
  const { data: prep } = await supabase.from("clientes").select("preparo").eq("id", cliente.id).maybeSingle();

  return (
    <Portal
      token={token}
      empresa={cliente.nome_fantasia || cliente.razao_social}
      contato={cliente.contato_nome}
      cartoes={cartoes}
      declaracao={DECLARACAO_APROVACAO}
      preparo={<PreparoPortal token={token} preparo={(prep?.preparo as Preparo | undefined) ?? {}} documentos={documentos} />}
      cofre={
        <Cofre
          documentos={documentos}
          modo="cliente"
          pedirUpload={ptPedirUpload.bind(null, token)}
          registrar={ptRegistrar.bind(null, token)}
          link={ptLink.bind(null, token)}
        />
      }
    />
  );
}
