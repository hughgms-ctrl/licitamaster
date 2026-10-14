/**
 * Preço mínimo: o menor valor de venda que ainda paga tudo e deixa o lucro
 * desejado.
 *
 * O imposto, a taxa da assessoria e as outras despesas sobre a venda incidem
 * sobre o PREÇO, não sobre o custo ("por dentro"). Por isso a conta divide:
 *
 *   preço = (custos em R$ + lucro em R$) ÷ (1 − impostos% − assessoria% − despesas% − lucro%)
 *
 * Calcular o imposto sobre o custo, como muita planilha faz, subestima o
 * imposto e come metade do lucro planejado.
 */
export interface EntradaPreco {
  /** custo do produto ou serviço (fornecedor, material, mão de obra), em R$ */
  custo: number;
  /** frete e entrega até o órgão, em R$ */
  frete: number;
  /** outros custos fixos desta venda (amostra, garantia, viagens), em R$ */
  outros: number;
  /** impostos sobre a venda, em % (ex.: Simples 6) */
  impostosPct: number;
  /** taxa da assessoria sobre o valor ganho, em % */
  assessoriaPct: number;
  /** outras despesas sobre a venda, em % (custo financeiro do prazo de pagamento, comissões) */
  despesasPct: number;
  /** lucro desejado: em % do preço de venda, ou em R$ fixos */
  lucro: { tipo: "pct" | "reais"; valor: number };
}

export interface ResultadoPreco {
  preco: number;
  custos: number;
  impostos: number;
  assessoria: number;
  despesas: number;
  lucro: number;
  /** soma dos % sobre a venda; 100% ou mais torna o preço impossível */
  pctSobreVenda: number;
}

const centavos = (x: number) => Math.round(x * 100) / 100;

/** Devolve null quando os percentuais somados chegam a 100% (não há preço que feche a conta). */
export function calcularPrecoMinimo(e: EntradaPreco): ResultadoPreco | null {
  const custos = Math.max(0, e.custo) + Math.max(0, e.frete) + Math.max(0, e.outros);
  const lucroPct = e.lucro.tipo === "pct" ? Math.max(0, e.lucro.valor) : 0;
  const lucroReais = e.lucro.tipo === "reais" ? Math.max(0, e.lucro.valor) : 0;
  const pctSobreVenda = Math.max(0, e.impostosPct) + Math.max(0, e.assessoriaPct) + Math.max(0, e.despesasPct) + lucroPct;
  if (pctSobreVenda >= 100 || custos + lucroReais <= 0) return null;

  // Arredonda o preço para cima no centavo: nunca abaixo do mínimo de verdade.
  const preco = Math.ceil(((custos + lucroReais) / (1 - pctSobreVenda / 100)) * 100) / 100;
  const impostos = centavos((preco * e.impostosPct) / 100);
  const assessoria = centavos((preco * e.assessoriaPct) / 100);
  const despesas = centavos((preco * e.despesasPct) / 100);
  return {
    preco,
    custos: centavos(custos),
    impostos,
    assessoria,
    despesas,
    lucro: centavos(preco - custos - impostos - assessoria - despesas),
    pctSobreVenda,
  };
}
