import { headers } from "next/headers";
import { db, type StatusDisputa } from "./db";
import { operadorAtual } from "./auth";

export { TRANSICOES_OPERADOR, ROTULO_STATUS, STATUS_EXCLUSIVOS } from "./etapas";

/**
 * Traduz a violação do índice único de exclusividade (ver supabase/migrations) numa
 * frase que explica o porquê. Qualquer outro erro passa como veio.
 */
export function mensagemErroBanco(e: { code?: string; message: string }): string {
  if (e.code === "23505" && e.message.includes("uniq_disputa_cliente_unico")) {
    return (
      "Outro cliente já está com esta licitação. Um único cliente por licitação: " +
      "representar dois concorrentes na mesma disputa caracteriza conluio (Lei 14.133). " +
      "Cancele ou encerre a do outro cliente antes."
    );
  }
  if (e.code === "23514" && e.message.includes("disputas_aprovada_tem_piso")) {
    return "Uma disputa só avança com o preço mínimo informado pelo cliente.";
  }
  return e.message;
}

/** IP e navegador de quem está fazendo a requisição, para a auditoria. */
export async function origemRequisicao(): Promise<{ ip: string | null; user_agent: string | null }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ip, user_agent: h.get("user-agent") };
}

/** Grava um evento de auditoria. Falha de auditoria derruba a operação. */
export async function registrarEvento(ev: {
  disputa_id?: string | null;
  cliente_id?: string | null;
  ator: "operador" | "cliente" | "sistema";
  tipo: string;
  dados?: Record<string, unknown>;
}) {
  const origem = await origemRequisicao();
  // quem da equipe fez: a auditoria guarda a pessoa, não só "operador"
  const operador = ev.ator === "operador" ? (await operadorAtual())?.email : undefined;
  const { error } = await db()
    .from("eventos")
    .insert({ ...ev, dados: { ...(ev.dados ?? {}), ...(operador ? { operador } : {}) }, ...origem });
  if (error) throw new Error(`Não deu para registrar a auditoria: ${error.message}`);
}

/**
 * Muda a etapa e grava a auditoria numa transação só (função `mover_disputa`
 * no schema). Devolve mensagem de erro legível, ou null se deu certo.
 */
export async function moverDisputa(opts: {
  disputaId: string;
  de: StatusDisputa[];
  para: StatusDisputa;
  ator: "operador" | "cliente";
  tipo: string;
  dados?: Record<string, unknown>;
  clienteId?: string;
  precoMinimo?: number;
  motivo?: string;
  notasCliente?: string;
}): Promise<string | null> {
  const origem = await origemRequisicao();
  const { error } = await db().rpc("mover_disputa", {
    p_disputa: opts.disputaId,
    p_de: opts.de,
    p_para: opts.para,
    p_ator: opts.ator,
    p_tipo: opts.tipo,
    p_dados: {
      ...(opts.dados ?? {}),
      ...(opts.ator === "operador" ? { operador: (await operadorAtual())?.email ?? null } : {}),
    },
    p_ip: origem.ip,
    p_user_agent: origem.user_agent,
    p_cliente: opts.clienteId ?? null,
    p_preco_minimo: opts.precoMinimo ?? null,
    p_motivo: opts.motivo ?? null,
    p_notas_cliente: opts.notasCliente ?? null,
  });
  if (!error) return null;
  if (error.message.includes("transicao_invalida")) {
    return "Esta disputa mudou de etapa enquanto você olhava. Recarregue a página.";
  }
  return mensagemErroBanco(error);
}

export function urlPortal(token: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/c/${token}`;
}
