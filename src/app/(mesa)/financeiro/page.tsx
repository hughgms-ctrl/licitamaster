import { exigirOperadorPagina } from "@/lib/auth";
import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta } from "@/lib/db";
import type { ContratoDisputa } from "@/lib/contrato";
import type { ResultadoDisputa } from "@/lib/resultado";
import { asaasConfigurado } from "@/lib/asaas";
import { Cabecalho } from "@/components/Cabecalho";
import Financeiro, { type CobrancaLinha } from "@/components/Financeiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro · Licitação Master" };

export default async function PaginaFinanceiro() {
  await exigirOperadorPagina();
  const supabase = db();
  const [{ data: clientes }, { data: ganhas }, { data: cobrancas }] = await Promise.all([
    supabase.from("clientes").select("*").eq("ativo", true).order("razao_social"),
    supabase.from("disputas").select(SELECT_DISPUTA_COMPLETA).eq("status", "ganhou").order("updated_at", { ascending: false }).limit(300),
    supabase.from("cobrancas").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  const disputas = (ganhas ?? []) as unknown as DisputaCompleta[];
  const ids = disputas.map((d) => d.id);
  const [{ data: contratos }, { data: resultados }] = ids.length
    ? await Promise.all([
        supabase.from("contratos_disputa").select("*").in("disputa_id", ids),
        supabase.from("resultados_disputa").select("disputa_id, nosso_lance").in("disputa_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      <Cabecalho
        titulo="Financeiro"
        sub="Contratos ganhos, o que os órgãos ainda devem aos clientes e o que os clientes devem à assessoria."
      />
      <Financeiro
        asaas={asaasConfigurado()}
        clientes={(clientes ?? []) as (ClienteRow & { mensalidade?: number | null; percentual_exito?: number | null })[]}
        disputas={disputas}
        contratos={Object.fromEntries(((contratos ?? []) as ContratoDisputa[]).map((c) => [c.disputa_id, c]))}
        lances={Object.fromEntries(((resultados ?? []) as Pick<ResultadoDisputa, "disputa_id" | "nosso_lance">[]).map((r) => [r.disputa_id, r.nosso_lance]))}
        cobrancas={(cobrancas ?? []) as CobrancaLinha[]}
      />
    </>
  );
}
