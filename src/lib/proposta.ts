/**
 * Contas da proposta ajustada (readequada ao valor final). Sem dependência de
 * servidor. Tudo em centavos inteiros para não errar arredondamento: o
 * pregoeiro confere se unitário × quantidade bate com o total, item a item.
 */

export interface ItemProposta {
  descricao: string;
  quantidade: number;
  unidade: string;
  /** valor total estimado do item pelo órgão, se a ficha trouxe */
  estimadoTotal: number | null;
  /** valor unitário proposto, em reais */
  unitario: number;
  incluir: boolean;
  marca: string;
  /** colunas a mais que o modelo de proposta do edital pede (ex: "prazo de garantia") */
  extras?: Record<string, string>;
}

const centavos = (v: number) => Math.round(v * 100);

/** "600 horas" → { n: 600, unidade: "horas" } · "12 meses" · "1.200 un" · null → 1 "serviço" */
export function lerQuantidade(texto: string | null | undefined): { n: number; unidade: string } {
  if (!texto) return { n: 1, unidade: "un" };
  const m = texto.trim().match(/^([\d.]+(?:,\d+)?)\s*(.*)$/);
  if (!m) return { n: 1, unidade: texto.trim().slice(0, 20) || "un" };
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return { n: Number.isFinite(n) && n > 0 ? n : 1, unidade: m[2].trim().slice(0, 20) || "un" };
}

export function totalItem(i: Pick<ItemProposta, "quantidade" | "unitario">): number {
  return centavos(i.unitario * i.quantidade) / 100;
}

export function totalProposta(itens: ItemProposta[]): number {
  return itens.filter((i) => i.incluir).reduce((s, i) => s + centavos(totalItem(i)), 0) / 100;
}

/**
 * Distribui o lance global entre os itens incluídos, na proporção do valor
 * estimado de cada um (desconto linear, o que a maioria dos editais aceita).
 * Arredonda os unitários e joga a sobra de centavos num item de quantidade 1,
 * ou no item em que a sobra divide certinho. Devolve o que não deu para
 * encaixar (normalmente zero).
 */
export function distribuir(itens: ItemProposta[], lance: number): { itens: ItemProposta[]; sobra: number } {
  const alvo = centavos(lance);
  const base = itens.map((i) => (i.incluir ? (i.estimadoTotal ?? i.unitario * i.quantidade) : 0));
  const soma = base.reduce((s, v) => s + v, 0);
  if (soma <= 0 || alvo <= 0) return { itens, sobra: 0 };

  const novos = itens.map((i, k) => {
    if (!i.incluir) return i;
    const totalAlvo = (base[k] / soma) * alvo; // em centavos
    const unit = Math.round(totalAlvo / i.quantidade); // centavos
    return { ...i, unitario: unit / 100 };
  });

  let sobra = alvo - centavos(totalProposta(novos));
  if (sobra !== 0) {
    const k =
      novos.findIndex((i) => i.incluir && i.quantidade === 1) >= 0
        ? novos.findIndex((i) => i.incluir && i.quantidade === 1)
        : novos.findIndex((i) => i.incluir && Number.isInteger(i.quantidade) && sobra % i.quantidade === 0);
    if (k >= 0) {
      const i = novos[k];
      novos[k] = { ...i, unitario: (centavos(i.unitario) + sobra / i.quantidade) / 100 };
      sobra = 0;
    }
  }
  return { itens: novos, sobra: sobra / 100 };
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Valor por extenso ───────────────────────────────────────────

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const grupos: { valor: number; sing: string; plur: string }[] = [
    { valor: Math.floor(n / 1e9) % 1000, sing: "bilhão", plur: "bilhões" },
    { valor: Math.floor(n / 1e6) % 1000, sing: "milhão", plur: "milhões" },
    { valor: Math.floor(n / 1e3) % 1000, sing: "mil", plur: "mil" },
    { valor: n % 1000, sing: "", plur: "" },
  ];
  const partes: { texto: string; valor: number }[] = [];
  for (const g of grupos) {
    if (!g.valor) continue;
    if (g.sing === "mil") partes.push({ texto: g.valor === 1 ? "mil" : `${ate999(g.valor)} mil`, valor: g.valor });
    else if (g.sing) partes.push({ texto: `${ate999(g.valor)} ${g.valor === 1 ? g.sing : g.plur}`, valor: g.valor });
    else partes.push({ texto: ate999(g.valor), valor: g.valor });
  }
  // "e" antes do último grupo só quando ele é menor que 100 ou centena redonda:
  // "mil e trezentos", "mil e cinquenta", mas "mil trezentos e vinte".
  return partes
    .map((p, i) => (i > 0 && i === partes.length - 1 && (p.valor < 100 || p.valor % 100 === 0) ? `e ${p.texto}` : p.texto))
    .join(" ");
}

/** 189300.5 → "cento e oitenta e nove mil e trezentos reais e cinquenta centavos" */
export function porExtenso(valor: number): string {
  const c = centavos(valor);
  const reais = Math.floor(c / 100);
  const cents = c % 100;
  const partes: string[] = [];
  if (reais) {
    const t = inteiroPorExtenso(reais);
    const milhaoRedondo = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${t}${milhaoRedondo ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cents) partes.push(`${ate999(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}
