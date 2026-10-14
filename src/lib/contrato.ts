/** Contrato depois de ganhar. Sem dependência de servidor. */

export type TipoEvento = "empenho" | "entrega" | "nota" | "pagamento";

export interface EventoContrato {
  id: string;
  tipo: TipoEvento;
  data: string;
  valor: number | null;
  descricao: string | null;
}

export interface ContratoDisputa {
  disputa_id: string;
  numero: string | null;
  valor_contratado: number | null;
  assinado_em: string | null;
  vigencia_fim: string | null;
  eventos: EventoContrato[];
  observacao: string | null;
  updated_at?: string;
}

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  empenho: "Empenho",
  entrega: "Entrega",
  nota: "Nota fiscal",
  pagamento: "Pagamento recebido",
};

/** Somas por tipo e o que falta receber do que já foi faturado. */
export function resumoContrato(c: Pick<ContratoDisputa, "valor_contratado" | "eventos">) {
  const soma = (t: TipoEvento) => c.eventos.filter((e) => e.tipo === t).reduce((s, e) => s + (e.valor ?? 0), 0);
  const empenhado = soma("empenho");
  const entregue = soma("entrega");
  const faturado = soma("nota");
  const recebido = soma("pagamento");
  return {
    empenhado,
    entregue,
    faturado,
    recebido,
    aReceber: Math.max(0, faturado - recebido),
    saldoContrato: c.valor_contratado != null ? Math.max(0, c.valor_contratado - faturado) : null,
  };
}
