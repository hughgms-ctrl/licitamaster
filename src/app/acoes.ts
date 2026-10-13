"use server";

import { revalidatePath } from "next/cache";
import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta, type StatusDisputa } from "@/lib/db";
import { exigirOperador } from "@/lib/sessao";
import { analisarLicitacao, lerEdital } from "@/lib/ai";
import { reunirPDFs } from "@/lib/edital";
import { lerConfigIA } from "@/lib/config-ia";
import type { FichaRow } from "@/lib/ficha";
import { convidarCliente } from "@/lib/notify";
import { moverDisputa, registrarEvento, TRANSICOES_OPERADOR, urlPortal } from "@/lib/disputas";

export interface Saida {
  ok: boolean;
  mensagem: string;
  /** link do portal, para copiar quando o WhatsApp não saiu */
  link?: string;
}

async function carregar(disputaId: string): Promise<DisputaCompleta | null> {
  const { data } = await db()
    .from("disputas")
    .select(SELECT_DISPUTA_COMPLETA)
    .eq("id", disputaId)
    .maybeSingle();
  return (data as DisputaCompleta | null) ?? null;
}

/** Move a disputa para outra etapa, se a transição for permitida ao operador. */
export async function mudarStatus(disputaId: string, para: StatusDisputa): Promise<Saida> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };

  if (!TRANSICOES_OPERADOR[d.status].includes(para)) {
    return { ok: false, mensagem: `Não dá para ir de "${d.status}" para "${para}".` };
  }

  const erro = await moverDisputa({
    disputaId,
    de: [d.status],
    para,
    ator: "operador",
    tipo: "status",
  });
  if (erro) return { ok: false, mensagem: erro };

  revalidatePath("/");
  return { ok: true, mensagem: "Atualizado." };
}

/**
 * Manda a licitação para o cliente decidir: muda a etapa (o que já trava a
 * licitação para os outros clientes) e avisa no WhatsApp com o link do portal.
 */
export async function enviarAoCliente(disputaId: string): Promise<Saida> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };

  const encerra = d.licitacao.data_encerramento_proposta;
  if (encerra && new Date(encerra).getTime() < Date.now()) {
    return { ok: false, mensagem: "O prazo de proposta desta licitação já fechou." };
  }

  const erro = await moverDisputa({
    disputaId,
    de: ["sugerida", "recusada"],
    para: "aguardando_cliente",
    ator: "operador",
    tipo: "enviada_ao_cliente",
  });
  if (erro) return { ok: false, mensagem: erro };

  const { data: cliente } = await db()
    .from("clientes")
    .select("whatsapp, contato_nome, token_portal")
    .eq("id", d.cliente_id)
    .single<Pick<ClienteRow, "whatsapp" | "contato_nome" | "token_portal">>();

  const link = cliente ? urlPortal(cliente.token_portal) : undefined;
  const enviou = cliente
    ? await convidarCliente({
        whatsapp: cliente.whatsapp,
        contato: cliente.contato_nome,
        objeto: d.analise_ia?.resumo_cliente || d.licitacao.objeto || "",
        orgao: d.licitacao.orgao_razao_social,
        valor: d.licitacao.valor_estimado,
        encerramento: encerra,
        linkPortal: link!,
      })
    : false;

  revalidatePath("/");
  return {
    ok: true,
    mensagem: enviou
      ? "Enviada. O cliente recebeu o link no WhatsApp."
      : "Enviada para o portal, mas o WhatsApp não saiu (cliente sem número ou Evolution não configurada). Mande o link manualmente:",
    link: enviou ? undefined : link,
  };
}

/** Roda a análise da IA para esta licitação, no contexto deste cliente. */
export async function analisar(disputaId: string): Promise<Saida & { analise?: DisputaCompleta["analise_ia"] }> {
  await exigirOperador();
  const supabase = db();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("razao_social, porte, contexto")
    .eq("id", d.cliente_id)
    .single<Pick<ClienteRow, "razao_social" | "porte" | "contexto">>();
  if (!cliente) return { ok: false, mensagem: "Cliente não encontrado." };

  try {
    const analise = await analisarLicitacao(d.licitacao, cliente);
    const { error } = await supabase.from("disputas").update({ analise_ia: analise }).eq("id", disputaId);
    if (error) return { ok: false, mensagem: error.message };
    await registrarEvento({
      disputa_id: disputaId,
      cliente_id: d.cliente_id,
      ator: "operador",
      tipo: "analise_ia",
      dados: { veredito: analise.veredito },
    });
    revalidatePath("/");
    return { ok: true, mensagem: "Análise pronta.", analise };
  } catch (e) {
    return { ok: false, mensagem: `A análise falhou: ${(e as Error).message}` };
  }
}

export async function salvarNotas(disputaId: string, notas: string): Promise<Saida> {
  await exigirOperador();
  const { error } = await db().from("disputas").update({ notas_operador: notas }).eq("id", disputaId);
  return error ? { ok: false, mensagem: error.message } : { ok: true, mensagem: "Notas salvas." };
}

/**
 * Baixa o edital do PNCP, a IA lê tudo e a ficha fica guardada para a
 * licitação (vale para qualquer cliente). Pode levar alguns minutos: a mesa
 * tem maxDuration de 300s para caber.
 */
export async function lerEditalAcao(disputaId: string): Promise<Saida & { ficha?: FichaRow }> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };

  try {
    const { pdfs, lidos, ignorados } = await reunirPDFs(d.licitacao);
    const ficha = await lerEdital(d.licitacao, pdfs);
    const cfg = await lerConfigIA();
    const linha: FichaRow = {
      licitacao_id: d.licitacao_id,
      ficha,
      arquivos_lidos: lidos,
      versao_pncp: d.licitacao.data_atualizacao_pncp,
      modelo: cfg?.modelo ?? null,
      gerado_em: new Date().toISOString(),
    };
    const { error } = await db().from("fichas_edital").upsert(linha);
    if (error) return { ok: false, mensagem: error.message };
    await registrarEvento({
      disputa_id: disputaId,
      cliente_id: d.cliente_id,
      ator: "operador",
      tipo: "edital_lido",
      dados: { arquivos: lidos.map((l) => l.titulo), ignorados: ignorados.length },
    });
    revalidatePath("/");
    return {
      ok: true,
      mensagem: `Edital lido: ${lidos.length} arquivo(s)${ignorados.length ? `, ${ignorados.length} ignorado(s)` : ""}.`,
      ficha: linha,
    };
  } catch (e) {
    return { ok: false, mensagem: `Não deu para ler o edital: ${(e as Error).message}` };
  }
}
