/** Rótulos das situações de cobrança. Sem dependência de servidor. */

export const SITUACAO: Record<string, string> = {
  emitida: "Registrada (fora do Asaas)",
  PENDING: "Aguardando pagamento",
  RECEIVED: "Paga",
  CONFIRMED: "Paga",
  RECEIVED_IN_CASH: "Paga em dinheiro",
  OVERDUE: "Vencida",
  REFUNDED: "Estornada",
  DELETED: "Cancelada",
};
