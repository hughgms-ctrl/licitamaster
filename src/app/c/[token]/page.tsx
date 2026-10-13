import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, type ClienteRow, type DisputaRow, type LicitacaoRow } from "@/lib/db";
import Portal, { type CartaoPortal } from "@/components/Portal";
import { DECLARACAO_APROVACAO } from "@/lib/etapas";
import { limparObjeto } from "@/lib/formato";

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

  // Só o que o cliente precisa ver. Score, termos, notas internas e análise
  // técnica ficam do lado de cá.
  const cartoes: CartaoPortal[] = ((data ?? []) as (DisputaRow & { licitacao: LicitacaoRow })[]).map(
    (d) => ({
      id: d.id,
      status: d.status,
      resumo: d.analise_ia?.resumo_cliente || null,
      objeto: limparObjeto(d.licitacao.objeto),
      orgao: d.licitacao.orgao_razao_social,
      local: [d.licitacao.municipio, d.licitacao.uf].filter(Boolean).join("/"),
      modalidade: d.licitacao.modalidade_nome,
      valorEstimado: d.licitacao.valor_estimado,
      encerramento: d.licitacao.data_encerramento_proposta,
      link: d.licitacao.link_pncp ?? d.licitacao.link_sistema_origem,
      precoMinimo: d.preco_minimo,
    })
  );

  return (
    <Portal
      token={token}
      empresa={cliente.nome_fantasia || cliente.razao_social}
      contato={cliente.contato_nome}
      cartoes={cartoes}
      declaracao={DECLARACAO_APROVACAO}
    />
  );
}
