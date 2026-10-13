/** Formatação compartilhada entre servidor e telas. Sem dependência de servidor. */

export function formatarCnpj(c: string): string {
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function formatarValor(v: number | null | undefined): string {
  return v && v > 0
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "valor sigiloso";
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** "faltam 3 dias", "faltam 5h", "encerrado". */
export function tempoRestante(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "prazo não informado";
  const horas = Math.round((new Date(iso).getTime() - agora) / 36e5);
  if (horas < 0) return "encerrado";
  if (horas < 1) return "fecha em menos de 1h";
  if (horas < 24) return `faltam ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

/**
 * Tira o prefixo de sistema que alguns portais colam no objeto, como
 * "[Portal de Compras Públicas] - ". É ruído na leitura e empurra o que
 * importa para fora das três linhas visíveis.
 */
export function limparObjeto(objeto: string | null | undefined): string {
  return (objeto ?? "").replace(/^\s*\[[^\]]{2,60}\]\s*[-–—:]?\s*/, "").trim();
}
