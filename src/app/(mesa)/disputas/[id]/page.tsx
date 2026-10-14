import { notFound } from "next/navigation";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, SELECT_DISPUTA_COMPLETA, type DisputaCompleta } from "@/lib/db";
import { STATUS_EXCLUSIVOS } from "@/lib/etapas";
import { limparObjeto } from "@/lib/formato";
import type { FichaRow } from "@/lib/ficha";
import type { DocumentoResumo } from "@/lib/documentos";
import type { ResultadoDisputa } from "@/lib/resultado";
import type { ContratoDisputa } from "@/lib/contrato";
import DisputaDetalhe, { type AbaDisputa } from "@/components/DisputaDetalhe";

export const dynamic = "force-dynamic";
// A análise profunda roda como server action desta página e pode levar
// minutos (download do PNCP + IA lendo dezenas de páginas).
export const maxDuration = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await db().from("disputas").select("licitacao:licitacoes(objeto)").eq("id", id).maybeSingle();
  const objeto = (data as { licitacao?: { objeto?: string | null } } | null)?.licitacao?.objeto;
  return { title: `${objeto ? limparObjeto(objeto).slice(0, 60) : "Licitação"} · Licitação Master` };
}

export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  await exigirOperadorPagina();
  const { id } = await params;
  const { aba } = await searchParams;
  const supabase = db();

  const { data } = await supabase.from("disputas").select(SELECT_DISPUTA_COMPLETA).eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as unknown as DisputaCompleta;

  const [{ data: ficha }, { data: docs }, { data: resultado }, { data: contrato }, { data: outras }, { data: cobranca }] = await Promise.all([
    supabase.from("fichas_edital").select("*").eq("licitacao_id", d.licitacao_id).maybeSingle<FichaRow>(),
    supabase
      .from("documentos_cliente")
      .select("id, cliente_id, tipo, descricao, nome_arquivo, validade, emitido_em, enviado_por, created_at")
      .eq("cliente_id", d.cliente_id)
      .order("created_at", { ascending: false }),
    // as duas abaixo podem não existir ainda no banco: sem elas a página abre igual
    supabase.from("resultados_disputa").select("*").eq("disputa_id", id).maybeSingle<ResultadoDisputa>(),
    supabase.from("contratos_disputa").select("*").eq("disputa_id", id).maybeSingle<ContratoDisputa>(),
    // Regra de exclusividade: outro cliente já está com esta licitação?
    supabase
      .from("disputas")
      .select("status, cliente:clientes(razao_social, nome_fantasia)")
      .eq("licitacao_id", d.licitacao_id)
      .neq("id", id)
      .in("status", STATUS_EXCLUSIVOS),
    // taxa de êxito do cliente (a coluna pode não existir em bancos antigos)
    supabase.from("clientes").select("percentual_exito").eq("id", d.cliente_id).maybeSingle<{ percentual_exito: number | null }>(),
  ]);

  const outra = (outras ?? [])[0] as unknown as
    | { cliente: { razao_social: string; nome_fantasia: string | null } | null }
    | undefined;
  const comOutro =
    outra?.cliente && ["sugerida", "recusada", "descartada"].includes(d.status)
      ? outra.cliente.nome_fantasia || outra.cliente.razao_social
      : null;

  return (
    <DisputaDetalhe
      inicial={d}
      fichaInicial={ficha ?? null}
      cofre={(docs ?? []) as DocumentoResumo[]}
      resultadoInicial={resultado ?? null}
      contratoInicial={contrato ?? null}
      comOutro={comOutro}
      abaInicial={aba as AbaDisputa | undefined}
      assessoriaPct={cobranca?.percentual_exito ?? null}
    />
  );
}
