import { formatarValor } from "./formato";

/**
 * WhatsApp via Evolution API.
 * Sem as variáveis configuradas, tudo aqui vira no-op silencioso: a coleta e
 * as telas continuam funcionando, só ninguém é avisado.
 */

export interface AlertaOperador {
  disputaId: string;
  clienteId: string;
  /** nome de exibição; a coleta preenche a partir do id */
  cliente: string;
  score: number;
  objeto: string;
  municipio: string | null;
  uf: string | null;
  valor: number | null;
  modalidade: string | null;
  encerramento: string | null;
  link: string | null;
  retificado: boolean;
  status: string;
}

/** Envia um texto para um número. Devolve true se a Evolution aceitou. */
export async function enviarWhatsApp(numero: string, texto: string): Promise<boolean> {
  const url = process.env.EVOLUTION_API_URL;
  const instancia = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const destino = numero.replace(/\D/g, "");
  if (!url || !instancia || !apiKey || !destino) return false;

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/message/sendText/${instancia}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: destino, text: texto }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Resumo da coleta para você (operador): o que caiu e para qual cliente. */
export async function alertarOperador(alertas: AlertaOperador[]): Promise<boolean> {
  const numero = process.env.ALERTA_WHATSAPP_NUMERO;
  if (!numero || alertas.length === 0) return false;

  const retificacoes = alertas.filter((a) => a.retificado);
  const novas = alertas.filter((a) => !a.retificado);

  const blocos: string[] = [];
  if (retificacoes.length > 0) {
    blocos.push(
      `⚠️ *${retificacoes.length} edital(is) RETIFICADO(S)* em disputa ativa — confira antes do prazo:\n\n` +
        retificacoes.slice(0, 5).map(linha).join("\n\n———\n\n")
    );
  }
  if (novas.length > 0) {
    blocos.push(
      `🎯 *${novas.length} licitação(ões) nova(s)* casando com clientes:\n\n` +
        novas.slice(0, 8).map(linha).join("\n\n———\n\n") +
        (novas.length > 8 ? `\n\n…e mais ${novas.length - 8}. Veja na mesa de operação.` : "")
    );
  }

  return enviarWhatsApp(numero, blocos.join("\n\n━━━━━━━━\n\n"));
}

function linha(a: AlertaOperador): string {
  return [
    `*${a.score}* · *${a.cliente}*`,
    `${a.modalidade ?? "—"} · ${a.municipio ?? "—"}/${a.uf ?? "—"} · ${formatarValor(a.valor)}`,
    a.objeto.replace(/\s+/g, " ").slice(0, 180),
    `Fecha ${a.encerramento ? formatarPrazo(new Date(a.encerramento)) : "prazo não informado"}`,
    a.link ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Convite ao cliente para decidir uma licitação no portal. */
export async function convidarCliente(opts: {
  whatsapp: string | null;
  contato: string | null;
  objeto: string;
  orgao: string | null;
  valor: number | null;
  encerramento: string | null;
  linkPortal: string;
}): Promise<boolean> {
  if (!opts.whatsapp) return false;
  const saudacao = opts.contato ? `Olá, ${opts.contato.split(" ")[0]}!` : "Olá!";
  const texto = [
    `${saudacao} Encontramos uma licitação que combina com a sua empresa:`,
    "",
    `*${opts.objeto.replace(/\s+/g, " ").slice(0, 220)}*`,
    opts.orgao ? `Órgão: ${opts.orgao}` : "",
    `Valor estimado: ${formatarValor(opts.valor)}`,
    opts.encerramento ? `Prazo para decidir: ${formatarPrazo(new Date(opts.encerramento))}` : "",
    "",
    "Para participarmos, preciso que você confirme e informe o seu *preço mínimo* (o menor valor que ainda dá lucro):",
    opts.linkPortal,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return enviarWhatsApp(opts.whatsapp, texto);
}

/** Várias licitações de uma vez para o mesmo cliente: uma mensagem só. */
export async function convidarClienteVarias(opts: {
  whatsapp: string | null;
  contato: string | null;
  licitacoes: { objeto: string; valor: number | null; encerramento: string | null }[];
  linkPortal: string;
}): Promise<boolean> {
  if (!opts.whatsapp || opts.licitacoes.length === 0) return false;
  const saudacao = opts.contato ? `Olá, ${opts.contato.split(" ")[0]}!` : "Olá!";
  const linhas = opts.licitacoes.slice(0, 10).map((l, i) =>
    [
      `${i + 1}. *${l.objeto.replace(/\s+/g, " ").slice(0, 140)}*`,
      `   ${formatarValor(l.valor)}${l.encerramento ? ` · decidir até ${formatarPrazo(new Date(l.encerramento))}` : ""}`,
    ].join("\n")
  );
  const resto = opts.licitacoes.length - linhas.length;
  const texto = [
    `${saudacao} Encontramos ${opts.licitacoes.length} licitações que combinam com a sua empresa:`,
    "",
    ...linhas,
    resto > 0 ? `…e mais ${resto}.` : "",
    "",
    "Em cada uma, diga se quer participar e o seu *preço mínimo* (o menor valor que ainda dá lucro):",
    opts.linkPortal,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return enviarWhatsApp(opts.whatsapp, texto);
}

function formatarPrazo(d: Date): string {
  const horas = Math.round((d.getTime() - Date.now()) / 36e5);
  const quando = d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  if (horas < 0) return `${quando} (encerrado)`;
  if (horas < 24) return `${quando} — faltam ${horas}h`;
  return `${quando} — faltam ${Math.floor(horas / 24)} dias`;
}
