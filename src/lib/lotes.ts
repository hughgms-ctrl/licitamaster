import type { FichaEdital } from "./ficha";

/**
 * Lotes: a parte da licitação que é disputada e adjudicada separada. Quando o
 * edital agrupa itens em lotes, cada lote é uma disputa; quando o julgamento
 * é por item, cada item é. Sem dependência de servidor.
 *
 * O cliente escolhe de quais participa e dá um preço mínimo para cada um. O
 * preço mínimo da disputa passa a ser a soma dos escolhidos.
 */

export interface Lote {
  /** "L1", "I3": estável entre leituras do mesmo edital */
  chave: string;
  /** "Lote 1", "Item 3" */
  rotulo: string;
  descricao: string;
  quantidade: string | null;
  valor_estimado: number | null;
  /** posições em ficha.itens */
  itens: number[];
}

export interface LoteEscolhido {
  chave: string;
  rotulo: string;
  descricao: string;
  valor_estimado: number | null;
  preco_minimo: number;
}

/** Até quantos lotes o portal deixa escolher um a um; acima disso, decide no todo. */
export const MAX_LOTES = 40;

/**
 * Os lotes da licitação, pela ficha do edital. Menos de 2 = não há escolha a
 * fazer (lote único ou julgamento global).
 */
export function lotesDaFicha(f: Pick<FichaEdital, "itens" | "sessao"> | null | undefined): Lote[] {
  const itens = f?.itens ?? [];
  if (itens.length < 2) return [];
  const criterio = (f?.sessao.criterio_julgamento ?? "").toLowerCase();
  const temLote = itens.some((i) => i.lote);
  // "menor preço global" sem lotes: é tudo uma disputa só.
  if (!temLote && criterio.includes("global") && !criterio.includes("item")) return [];

  let lotes: Lote[];
  if (temLote) {
    const porLote = new Map<string, Lote>();
    itens.forEach((it, k) => {
      const n = normalizarLote(it.lote) ?? "único";
      let l = porLote.get(n);
      if (!l) {
        l = { chave: `L${n}`, rotulo: n === "único" ? "Itens sem lote" : `Lote ${n}`, descricao: "", quantidade: null, valor_estimado: 0, itens: [] };
        porLote.set(n, l);
      }
      l.itens.push(k);
      if (l.valor_estimado != null) l.valor_estimado = it.valor_estimado != null ? l.valor_estimado + it.valor_estimado : null;
    });
    lotes = [...porLote.values()].map((l) => {
      const primeiros = l.itens.map((k) => itens[k].descricao);
      return {
        ...l,
        descricao:
          primeiros.length === 1
            ? primeiros[0]
            : `${primeiros[0]}${primeiros.length > 1 ? ` e mais ${primeiros.length - 1} ${primeiros.length === 2 ? "item" : "itens"}` : ""}`,
        quantidade: l.itens.length === 1 ? itens[l.itens[0]].quantidade : `${l.itens.length} itens`,
        valor_estimado: l.valor_estimado || null,
      };
    });
  } else {
    lotes = itens.map((it, k) => {
      const n = it.numero?.trim() || String(k + 1);
      return {
        chave: `I${n}`,
        rotulo: `Item ${n}`,
        descricao: it.descricao,
        quantidade: it.quantidade,
        valor_estimado: it.valor_estimado,
        itens: [k],
      };
    });
  }
  return lotes.length >= 2 ? lotes : [];
}

/** "LOTE 02", "Lote 2", "2" → "2". */
function normalizarLote(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = String(t).trim();
  const num = s.match(/\d+/)?.[0];
  return num ? String(Number(num)) : s.replace(/^lote\s*/i, "") || null;
}

/** Conferência no servidor: só vale chave que existe e preço maior que zero. */
export function validarEscolha(
  lotes: Lote[],
  escolha: { chave: string; preco_minimo: number }[]
): { ok: true; escolhidos: LoteEscolhido[]; total: number } | { ok: false; mensagem: string } {
  const porChave = new Map(lotes.map((l) => [l.chave, l]));
  const escolhidos: LoteEscolhido[] = [];
  const vistas = new Set<string>();
  for (const e of escolha) {
    const l = porChave.get(e.chave);
    if (!l || vistas.has(e.chave)) return { ok: false, mensagem: "Os lotes mudaram. Recarregue a página." };
    vistas.add(e.chave);
    const preco = Math.round(Number(e.preco_minimo) * 100) / 100;
    if (!Number.isFinite(preco) || preco <= 0) return { ok: false, mensagem: `Informe o preço mínimo do ${l.rotulo}.` };
    escolhidos.push({ chave: l.chave, rotulo: l.rotulo, descricao: l.descricao, valor_estimado: l.valor_estimado, preco_minimo: preco });
  }
  if (escolhidos.length === 0) return { ok: false, mensagem: "Escolha pelo menos um lote." };
  const total = Math.round(escolhidos.reduce((s, e) => s + e.preco_minimo, 0) * 100) / 100;
  return { ok: true, escolhidos, total };
}
