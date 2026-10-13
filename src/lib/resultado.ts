/** Resultado registrado de uma disputa. Sem dependência de servidor. */

export interface Concorrente {
  nome: string;
  cnpj?: string | null;
  lance: number | null;
}

export interface ResultadoDisputa {
  disputa_id: string;
  licitacao_id: string;
  nosso_lance: number | null;
  posicao: number | null;
  participantes: number | null;
  vencedor_nome: string | null;
  vencedor_lance: number | null;
  concorrentes: Concorrente[];
  observacao: string | null;
  registrado_por?: string | null;
  updated_at?: string;
}

/** Etapas em que faz sentido registrar o resultado. */
export const ETAPAS_COM_RESULTADO = ["em_disputa", "ganhou", "perdeu", "desistiu"] as const;

/** "48.500,00", "48500", "R$ 48.500" → número. Mesma regra do portal. */
export function lerReais(t: string): number | null {
  const s = t.replace(/[^\d.,]/g, "");
  if (!s) return null;
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/\.\d{1,2}$/.test(s)) n = Number(s);
  else n = Number(s.replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function reaisParaTexto(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
