/**
 * Objetivos do cliente: as perguntas de entrada antes de disputar (perfil,
 * risco, capital, lucro, prazo). A IA usa para dizer se uma licitação serve
 * para ESTE cliente, e a calculadora de preço já vem com o lucro mínimo dele.
 * Áreas de atuação ficam no texto "O que a empresa faz" e nos perfis de busca.
 */
export interface Objetivos {
  /** Sniper: poucas licitações, grandes e certeiras. Força bruta: muitas ao mesmo tempo. */
  estrategia?: "sniper" | "forca_bruta" | null;
  risco?: "baixo" | "medio" | "alto" | null;
  /** quanto consegue bancar de entrega antes de o órgão pagar, em R$ */
  capital?: number | null;
  /** lucro mínimo por venda, em % do preço */
  lucro_pct?: number | null;
  /** meta de faturamento com governo, em R$ */
  meta_faturamento?: number | null;
  /** em quantos meses quer chegar na meta */
  prazo_meses?: number | null;
}

export const ROTULO_ESTRATEGIA = {
  sniper: "Sniper: poucas licitações, grandes e bem escolhidas",
  forca_bruta: "Força bruta: muitas licitações ao mesmo tempo",
} as const;

export const ROTULO_RISCO = {
  baixo: "Baixo: só o que tem certeza que entrega",
  medio: "Médio: aceita algum desafio de prazo ou volume",
  alto: "Alto: topa contratos grandes e prazos apertados",
} as const;

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Os objetivos em texto corrido, para o prompt da IA. Vazio se nada foi preenchido. */
export function textoObjetivos(o: Objetivos | null | undefined): string {
  if (!o) return "";
  const linhas = [
    o.estrategia && `- Estratégia: ${ROTULO_ESTRATEGIA[o.estrategia]}`,
    o.risco && `- Risco que aceita: ${ROTULO_RISCO[o.risco]}`,
    o.capital != null &&
      `- Capital para bancar entregas: ${reais(o.capital)} (o órgão paga só depois da entrega, em geral em até 30 dias; contrato que exige comprar mais que isso adiantado é arriscado)`,
    o.lucro_pct != null && `- Lucro mínimo por venda: ${o.lucro_pct}% do preço`,
    o.meta_faturamento != null &&
      `- Meta: faturar ${reais(o.meta_faturamento)} com governo${o.prazo_meses ? ` em ${o.prazo_meses} meses` : ""}`,
  ].filter(Boolean);
  return linhas.join("\n");
}
