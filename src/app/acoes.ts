"use server";

import { revalidatePath } from "next/cache";
import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta, type StatusDisputa } from "@/lib/db";
import { exigirOperador } from "@/lib/auth";
import { analisarLicitacao, lerEdital } from "@/lib/ai";
import { reunirPDFs } from "@/lib/edital";
import { lerConfigIA } from "@/lib/config-ia";
import type { FichaRow } from "@/lib/ficha";
import { FASES, type GuiaMarcado } from "@/lib/guia";
import type { ResultadoDisputa } from "@/lib/resultado";
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

  // O cliente decide com o edital lido: o portal mostra a ele o que vão
  // exigir (documentos, atestados, prazo). Sem a ficha, ele aprovaria às cegas.
  const { data: fichaRow } = await db()
    .from("fichas_edital")
    .select("ficha")
    .eq("licitacao_id", d.licitacao_id)
    .maybeSingle<Pick<FichaRow, "ficha">>();
  if (!fichaRow) {
    return {
      ok: false,
      mensagem: "Leia o edital antes de enviar. O cliente precisa ver o que vão exigir dele para decidir.",
    };
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
        objeto: fichaRow.ficha.resumo_cliente || d.analise_ia?.resumo_cliente || d.licitacao.objeto || "",
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
 * Registra (ou corrige) o resultado da sessão: nosso lance, vencedor e
 * concorrentes. Um registro por disputa; salvar de novo substitui.
 */
export async function salvarResultado(
  disputaId: string,
  r: Omit<ResultadoDisputa, "disputa_id" | "licitacao_id" | "registrado_por" | "updated_at">
): Promise<Saida> {
  const eu = await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };

  const valor = (n: number | null) => (n != null && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null);
  const inteiro = (n: number | null) => (n != null && Number.isInteger(n) && n >= 1 ? n : null);
  const concorrentes = (r.concorrentes ?? [])
    .filter((c) => c.nome?.trim() || c.lance)
    .slice(0, 50)
    .map((c) => ({ nome: (c.nome ?? "").trim().slice(0, 200), cnpj: c.cnpj?.replace(/\D/g, "") || null, lance: valor(c.lance) }));

  const linha = {
    disputa_id: disputaId,
    licitacao_id: d.licitacao_id,
    nosso_lance: valor(r.nosso_lance),
    posicao: inteiro(r.posicao),
    participantes: inteiro(r.participantes),
    vencedor_nome: r.vencedor_nome?.trim().slice(0, 200) || null,
    vencedor_lance: valor(r.vencedor_lance),
    concorrentes,
    observacao: r.observacao?.trim().slice(0, 2000) || null,
    registrado_por: eu.email,
    updated_at: new Date().toISOString(),
  };
  if (linha.posicao && linha.participantes && linha.posicao > linha.participantes) {
    return { ok: false, mensagem: "A posição não pode ser maior que o número de participantes." };
  }

  const { error } = await db().from("resultados_disputa").upsert(linha, { onConflict: "disputa_id" });
  if (error) return { ok: false, mensagem: error.message };
  await registrarEvento({
    disputa_id: disputaId,
    cliente_id: d.cliente_id,
    ator: "operador",
    tipo: "resultado_registrado",
    dados: { nosso_lance: linha.nosso_lance, vencedor_lance: linha.vencedor_lance, posicao: linha.posicao },
  });
  return { ok: true, mensagem: "Resultado registrado." };
}

/** Marca ou desmarca um passo do guia da disputa. */
export async function marcarPassoGuia(disputaId: string, chave: string, feito: boolean): Promise<Saida> {
  await exigirOperador();
  const [fase, passo] = chave.split(".");
  if (!FASES.find((f) => f.id === fase)?.passos.some((p) => p.id === passo)) {
    return { ok: false, mensagem: "Passo desconhecido." };
  }
  const { data, error } = await db().from("disputas").select("guia").eq("id", disputaId).maybeSingle();
  if (error || !data) return { ok: false, mensagem: error?.message ?? "Disputa não encontrada." };
  const guia = { ...((data.guia as GuiaMarcado) ?? {}) };
  if (feito) guia[chave] = new Date().toISOString();
  else delete guia[chave];
  const { error: e2 } = await db().from("disputas").update({ guia }).eq("id", disputaId);
  return e2 ? { ok: false, mensagem: e2.message } : { ok: true, mensagem: "Salvo." };
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
