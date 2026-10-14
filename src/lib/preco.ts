/**
 * Inteligência de preço: em licitações parecidas, quanto abaixo do valor
 * estimado o vencedor costuma fechar. Sem dependência de servidor.
 *
 * "Parecida" = objeto com palavras em comum (Jaccard sobre as palavras
 * relevantes), com um bônus pequeno para mesma UF e mesma modalidade.
 */

export interface Referencia {
  fonte: "pncp" | "nossa";
  objeto: string;
  orgao: string | null;
  uf: string | null;
  modalidade: string | null;
  estimado: number;
  vencedor: number;
  /** quem ganhou, quando se sabe */
  fornecedor?: string | null;
  cnpj?: string | null;
}

export interface Semelhante extends Referencia {
  similaridade: number;
  desconto: number;
}

const PARADAS = new Set(
  "para pela pelo com sem dos das nos nas uma umas uns aos que por como entre sobre contratacao contratação empresa especializada servicos serviços servico serviço aquisicao aquisição fornecimento prestacao prestação registro precos preços eventual eventuais futura futuras atender necessidades secretaria municipal estadual municipio município prefeitura conforme termo referencia referência edital anexo objeto demanda demandas destinados destinadas destinado destinada unidades unidade diversos diversas tipo".split(" ")
);

export function palavras(texto: string | null | undefined): Set<string> {
  return new Set(
    (texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !PARADAS.has(p))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let comum = 0;
  for (const p of a) if (b.has(p)) comum++;
  return comum / (a.size + b.size - comum);
}

function quantil(ordenados: number[], q: number): number {
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  return ordenados[base + 1] !== undefined ? ordenados[base] + resto * (ordenados[base + 1] - ordenados[base]) : ordenados[base];
}

export interface AnalisePreco {
  semelhantes: Semelhante[];
  n: number;
  /** descontos sobre o estimado (0,18 = 18% abaixo) */
  mediana: number | null;
  p25: number | null;
  p75: number | null;
  /** quem mais ganha licitações parecidas */
  concorrentes: Concorrente[];
  /** vencedor ÷ estimado de cada parecida: base da chance de ganhar */
  razoes: number[];
}

export interface Concorrente {
  nome: string;
  cnpj: string | null;
  vitorias: number;
  /** desconto médio sobre o estimado nas vitórias */
  descontoMedio: number;
}

export function analisarPreco(
  alvo: { objeto: string | null; uf: string | null; modalidade: string | null },
  referencias: Referencia[],
  minimo = 0.18
): AnalisePreco {
  const pa = palavras(alvo.objeto);
  const semelhantes: Semelhante[] = [];
  for (const r of referencias) {
    if (!(r.estimado > 0) || !(r.vencedor > 0)) continue;
    const desconto = 1 - r.vencedor / r.estimado;
    if (desconto < -0.05 || desconto > 0.9) continue; // fora disso é erro de cadastro
    let sim = jaccard(pa, palavras(r.objeto));
    if (sim < minimo) continue;
    if (alvo.uf && r.uf === alvo.uf) sim += 0.05;
    if (alvo.modalidade && r.modalidade === alvo.modalidade) sim += 0.03;
    semelhantes.push({ ...r, similaridade: Math.min(1, sim), desconto });
  }
  semelhantes.sort((a, b) => b.similaridade - a.similaridade);
  const top = semelhantes.slice(0, 30);
  const ds = top.map((s) => s.desconto).sort((a, b) => a - b);
  return {
    semelhantes: top,
    n: top.length,
    mediana: ds.length ? quantil(ds, 0.5) : null,
    p25: ds.length >= 4 ? quantil(ds, 0.25) : null,
    p75: ds.length >= 4 ? quantil(ds, 0.75) : null,
    concorrentes: agruparConcorrentes(semelhantes.slice(0, 80)),
    razoes: top.map((s) => 1 - s.desconto),
  };
}

/** Nome sem acento, caixa e sufixo societário: "Fogo Zero Ltda" e "FOGO ZERO LTDA - ME" viram a mesma empresa. */
const chaveEmpresa = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|sa|mei|limitada|cia)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");

/** Vitórias por empresa nas licitações parecidas (pelo nome; matriz e filiais juntas). */
export function agruparConcorrentes(semelhantes: Semelhante[], limite = 8): Concorrente[] {
  const mapa = new Map<string, { nome: string; cnpj: string | null; vitorias: number; soma: number }>();
  for (const s of semelhantes) {
    const nome = s.fornecedor?.trim();
    if (!nome) continue;
    const k = chaveEmpresa(nome);
    const c = mapa.get(k) ?? { nome, cnpj: null, vitorias: 0, soma: 0 };
    c.cnpj ||= s.cnpj?.trim() || null;
    c.vitorias++;
    c.soma += s.desconto;
    mapa.set(k, c);
  }
  return [...mapa.values()]
    .sort((a, b) => b.vitorias - a.vitorias || b.soma / b.vitorias - a.soma / a.vitorias)
    .slice(0, limite)
    .map((c) => ({ nome: c.nome, cnpj: c.cnpj, vitorias: c.vitorias, descontoMedio: c.soma / c.vitorias }));
}

export interface Chance {
  nivel: "alta" | "media" | "baixa" | "poucos_dados";
  /** em quantas das parecidas este preço teria empatado ou ficado abaixo do vencedor */
  fracao: number | null;
  n: number;
}

/**
 * Chance de ganhar com um preço: em quantas licitações parecidas esse preço
 * (proporcional ao estimado) ficaria igual ou abaixo do que o vencedor
 * cobrou. É uma régua do mercado, não promessa: documentação e concorrentes
 * do dia decidem o resto.
 */
export function chanceDeGanhar(preco: number | null, estimado: number | null, razoes: number[]): Chance {
  const n = razoes.length;
  if (!preco || !estimado || estimado <= 0 || n < 3) return { nivel: "poucos_dados", fracao: null, n };
  const r = preco / estimado;
  const fracao = razoes.filter((v) => r <= v + 1e-9).length / n;
  return { nivel: fracao >= 0.6 ? "alta" : fracao >= 0.3 ? "media" : "baixa", fracao, n };
}
