import type { SupabaseClient } from "@supabase/supabase-js";
import { analisarPreco, type AnalisePreco, type Referencia } from "./preco";

type L = {
  objeto: string | null;
  orgao_razao_social: string | null;
  uf: string | null;
  modalidade_nome: string | null;
  valor_estimado: number | null;
};
type ItemPncp = { homologado?: number | null; fornecedor?: string | null; cnpj?: string | null };

/**
 * Base de referências de preço: resultados oficiais do PNCP (de qualquer
 * licitação coletada) mais os lances que a equipe registra. Uma referência
 * por licitação; a nossa prevalece sobre a oficial.
 */
export async function carregarReferencias(supabase: SupabaseClient, excetoLicitacao?: string): Promise<Referencia[]> {
  let qOficiais = supabase
    .from("resultados_pncp")
    .select("licitacao_id, valor_estimado, valor_homologado, itens, licitacao:licitacoes(objeto, orgao_razao_social, uf, modalidade_nome, valor_estimado)")
    .eq("tem_resultado", true)
    .order("consultado_em", { ascending: false })
    .limit(3000);
  let qNossos = supabase
    .from("resultados_disputa")
    .select("disputa_id, vencedor_lance, vencedor_nome, licitacao_id, licitacao:licitacoes(objeto, orgao_razao_social, uf, modalidade_nome, valor_estimado)")
    .not("vencedor_lance", "is", null)
    .limit(2000);
  if (excetoLicitacao) {
    qOficiais = qOficiais.neq("licitacao_id", excetoLicitacao);
    qNossos = qNossos.neq("licitacao_id", excetoLicitacao);
  }
  // As duas tabelas podem não existir ainda no banco: sem elas, a base fica vazia.
  const [{ data: oficiais }, { data: nossos }] = await Promise.all([qOficiais, qNossos]);

  const refs: Referencia[] = [];
  const vistas = new Set<string>();
  for (const r of (nossos ?? []) as unknown as { licitacao_id: string; vencedor_lance: number; vencedor_nome: string | null; licitacao: L | null }[]) {
    if (!r.licitacao?.valor_estimado) continue;
    vistas.add(r.licitacao_id);
    refs.push({
      fonte: "nossa",
      objeto: r.licitacao.objeto ?? "",
      orgao: r.licitacao.orgao_razao_social,
      uf: r.licitacao.uf,
      modalidade: r.licitacao.modalidade_nome,
      estimado: r.licitacao.valor_estimado,
      vencedor: Number(r.vencedor_lance),
      fornecedor: r.vencedor_nome,
      cnpj: null,
    });
  }
  for (const r of (oficiais ?? []) as unknown as {
    licitacao_id: string;
    valor_estimado: number | null;
    valor_homologado: number | null;
    itens: ItemPncp[] | null;
    licitacao: L | null;
  }[]) {
    if (vistas.has(r.licitacao_id) || !r.licitacao) continue;
    // Vencedor "da licitação" = quem levou o maior valor homologado entre os itens.
    const principal = (r.itens ?? [])
      .filter((i) => i.fornecedor)
      .sort((a, b) => Number(b.homologado ?? 0) - Number(a.homologado ?? 0))[0];
    refs.push({
      fonte: "pncp",
      objeto: r.licitacao.objeto ?? "",
      orgao: r.licitacao.orgao_razao_social,
      uf: r.licitacao.uf,
      modalidade: r.licitacao.modalidade_nome,
      estimado: Number(r.valor_estimado ?? r.licitacao.valor_estimado ?? 0),
      vencedor: Number(r.valor_homologado ?? 0),
      fornecedor: principal?.fornecedor ?? null,
      cnpj: principal?.cnpj ?? null,
    });
  }
  return refs;
}

export function analisarMercado(
  alvo: { objeto: string | null; uf: string | null; modalidade_nome: string | null },
  refs: Referencia[]
): AnalisePreco {
  return analisarPreco({ objeto: alvo.objeto, uf: alvo.uf, modalidade: alvo.modalidade_nome }, refs);
}
