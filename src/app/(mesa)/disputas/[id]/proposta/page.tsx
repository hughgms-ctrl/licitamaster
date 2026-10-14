import { notFound } from "next/navigation";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta } from "@/lib/db";
import type { FichaRow } from "@/lib/ficha";
import type { Preparo } from "@/lib/preparo";
import type { ResultadoDisputa } from "@/lib/resultado";
import PropostaAjustada, { type PropostaSalva } from "@/components/PropostaAjustada";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposta ajustada · Licitação Master" };

export default async function Proposta({ params }: { params: Promise<{ id: string }> }) {
  await exigirOperadorPagina();
  const { id } = await params;
  const supabase = db();

  const { data: d } = await supabase.from("disputas").select(SELECT_DISPUTA_COMPLETA).eq("id", id).maybeSingle();
  if (!d) notFound();
  const disputa = d as unknown as DisputaCompleta;

  const [{ data: cliente }, { data: ficha }, { data: resultado }, { data: prep }, { data: salva }] = await Promise.all([
    // select("*"): os campos de endereço e representante podem ainda não existir no banco
    supabase.from("clientes").select("*").eq("id", disputa.cliente_id).single<ClienteRow>(),
    supabase.from("fichas_edital").select("*").eq("licitacao_id", disputa.licitacao_id).maybeSingle<FichaRow>(),
    // as duas abaixo podem não existir ainda no banco: sem elas a página abre igual
    supabase.from("resultados_disputa").select("*").eq("disputa_id", id).maybeSingle<ResultadoDisputa>(),
    supabase.from("clientes").select("preparo").eq("id", disputa.cliente_id).maybeSingle<{ preparo: Preparo }>(),
    supabase.from("propostas_disputa").select("dados, updated_at, salvo_por").eq("disputa_id", id).maybeSingle<PropostaSalva>(),
  ]);
  if (!cliente) notFound();

  return (
    <PropostaAjustada
      d={disputa}
      cliente={cliente}
      ficha={ficha ?? null}
      lanceFinal={resultado?.nosso_lance ?? null}
      dadosBancarios={prep?.preparo?.dados_bancarios?.nota ?? null}
      salva={salva ?? null}
    />
  );
}
