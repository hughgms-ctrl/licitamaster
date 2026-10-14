"use server";

import { revalidatePath } from "next/cache";
import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta, type StatusDisputa } from "@/lib/db";
import { exigirOperador } from "@/lib/auth";
import { analisarLicitacao, lerEdital, redigirRecurso, type TipoRecurso } from "@/lib/ai";
import { reunirPDFs } from "@/lib/edital";
import { lerConfigIA } from "@/lib/config-ia";
import type { FichaRow } from "@/lib/ficha";
import { FASES, type GuiaMarcado } from "@/lib/guia";
import type { ResultadoDisputa } from "@/lib/resultado";
import type { ContratoDisputa } from "@/lib/contrato";
import { consultarResultado, gravarResultado } from "@/lib/resultados-pncp";
import { analisarPreco, type AnalisePreco, type Referencia } from "@/lib/preco";
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

/**
 * Referências de preço para uma licitação: resultados oficiais do PNCP e os
 * nossos registros de lances, filtrados pelos parecidos.
 */
export async function referenciaPreco(disputaId: string): Promise<Saida & { analise?: AnalisePreco; base?: number }> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };
  const supabase = db();
  const [{ data: oficiais }, { data: nossos }] = await Promise.all([
    supabase
      .from("resultados_pncp")
      .select("licitacao_id, valor_estimado, valor_homologado, licitacao:licitacoes(objeto, orgao_razao_social, uf, modalidade_nome, valor_estimado)")
      .eq("tem_resultado", true)
      .neq("licitacao_id", d.licitacao_id)
      .order("consultado_em", { ascending: false })
      .limit(3000),
    supabase
      .from("resultados_disputa")
      .select("disputa_id, vencedor_lance, licitacao_id, licitacao:licitacoes(objeto, orgao_razao_social, uf, modalidade_nome, valor_estimado)")
      .not("vencedor_lance", "is", null)
      .neq("licitacao_id", d.licitacao_id)
      .limit(2000),
  ]);
  type L = { objeto: string | null; orgao_razao_social: string | null; uf: string | null; modalidade_nome: string | null; valor_estimado: number | null };
  const refs: Referencia[] = [];
  const vistas = new Set<string>();
  for (const r of (nossos ?? []) as unknown as { licitacao_id: string; vencedor_lance: number; licitacao: L | null }[]) {
    if (!r.licitacao?.valor_estimado) continue;
    vistas.add(r.licitacao_id);
    refs.push({ fonte: "nossa", objeto: r.licitacao.objeto ?? "", orgao: r.licitacao.orgao_razao_social, uf: r.licitacao.uf, modalidade: r.licitacao.modalidade_nome, estimado: r.licitacao.valor_estimado, vencedor: Number(r.vencedor_lance) });
  }
  for (const r of (oficiais ?? []) as unknown as { licitacao_id: string; valor_estimado: number | null; valor_homologado: number | null; licitacao: L | null }[]) {
    if (vistas.has(r.licitacao_id) || !r.licitacao) continue;
    const estimado = Number(r.valor_estimado ?? r.licitacao.valor_estimado ?? 0);
    refs.push({ fonte: "pncp", objeto: r.licitacao.objeto ?? "", orgao: r.licitacao.orgao_razao_social, uf: r.licitacao.uf, modalidade: r.licitacao.modalidade_nome, estimado, vencedor: Number(r.valor_homologado ?? 0) });
  }
  return {
    ok: true,
    mensagem: "",
    base: refs.length,
    analise: analisarPreco({ objeto: d.licitacao.objeto, uf: d.licitacao.uf, modalidade: d.licitacao.modalidade_nome }, refs),
  };
}

/** Rascunho de intenção de recurso, razões ou contrarrazões, pela IA. */
export async function gerarRecurso(disputaId: string, tipo: TipoRecurso, fatos: string): Promise<Saida & { texto?: string }> {
  await exigirOperador();
  if (!["intencao", "razoes", "contrarrazoes"].includes(tipo)) return { ok: false, mensagem: "Tipo inválido." };
  if (fatos.trim().length < 20) return { ok: false, mensagem: "Conte o que aconteceu com um pouco mais de detalhe." };
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };
  const { data: f } = await db().from("fichas_edital").select("ficha").eq("licitacao_id", d.licitacao_id).maybeSingle<Pick<FichaRow, "ficha">>();
  try {
    const texto = await redigirRecurso({
      tipo,
      fatos: fatos.slice(0, 6000),
      empresa: d.cliente.razao_social,
      orgao: d.licitacao.orgao_razao_social,
      objeto: d.licitacao.objeto,
      modalidade: d.licitacao.modalidade_nome,
      resumoEdital: f?.ficha.resumo ?? null,
      exigencias: [...(f?.ficha.exigencias_tecnicas ?? []), ...(f?.ficha.documentos_exigidos ?? []).map((x) => `${x.tipo}: ${x.detalhe}`)].slice(0, 40),
    });
    await registrarEvento({ disputa_id: disputaId, cliente_id: d.cliente_id, ator: "operador", tipo: "recurso_redigido", dados: { tipo } });
    return { ok: true, mensagem: "Rascunho pronto. Revise antes de enviar.", texto };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}

/** Consulta agora o resultado oficial no PNCP e grava para a inteligência de preço. */
export async function buscarResultadoOficial(
  disputaId: string
): Promise<Saida & { vencedor?: string | null; valor?: number | null; temResultado?: boolean }> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };
  try {
    const r = await consultarResultado(d.licitacao);
    await gravarResultado(r);
    if (!r.tem_resultado) {
      return { ok: true, temResultado: false, mensagem: "O PNCP ainda não publicou o resultado desta licitação. Tente de novo em alguns dias." };
    }
    // vencedor: o fornecedor com mais valor homologado
    const porFornecedor = new Map<string, number>();
    for (const i of r.itens) if (i.fornecedor && i.homologado) porFornecedor.set(i.fornecedor, (porFornecedor.get(i.fornecedor) ?? 0) + i.homologado);
    const vencedor = [...porFornecedor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      ok: true,
      temResultado: true,
      vencedor,
      valor: r.valor_homologado,
      mensagem: `Resultado oficial: ${vencedor ?? "fornecedor não informado"}${r.valor_homologado ? `, total homologado de R$ ${r.valor_homologado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}.`,
    };
  } catch (e) {
    return { ok: false, mensagem: `Não deu para consultar o PNCP: ${(e as Error).message}` };
  }
}

/** Salva o contrato de uma disputa ganha (dados e eventos, tudo de uma vez). */
export async function salvarContrato(
  disputaId: string,
  c: Omit<ContratoDisputa, "disputa_id" | "updated_at">
): Promise<Saida> {
  const eu = await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };
  if (d.status !== "ganhou") return { ok: false, mensagem: "Contrato só para disputa ganha." };
  const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const valor = (n: number | null) => (n != null && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null);
  const tipos = ["empenho", "entrega", "nota", "pagamento"];
  const eventos = (c.eventos ?? [])
    .filter((e) => tipos.includes(e.tipo) && data(e.data))
    .slice(0, 500)
    .map((e) => ({
      id: String(e.id).slice(0, 40),
      tipo: e.tipo,
      data: e.data,
      valor: valor(e.valor),
      descricao: e.descricao?.trim().slice(0, 300) || null,
    }));
  const { error } = await db()
    .from("contratos_disputa")
    .upsert(
      {
        disputa_id: disputaId,
        numero: c.numero?.trim().slice(0, 100) || null,
        valor_contratado: valor(c.valor_contratado),
        assinado_em: data(c.assinado_em),
        vigencia_fim: data(c.vigencia_fim),
        eventos,
        observacao: c.observacao?.trim().slice(0, 2000) || null,
        atualizado_por: eu.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "disputa_id" }
    );
  return error ? { ok: false, mensagem: error.message } : { ok: true, mensagem: "Contrato salvo." };
}

/** Guarda a proposta ajustada como o operador deixou na tela. */
export async function salvarProposta(disputaId: string, dados: unknown, total: number): Promise<Saida> {
  const eu = await exigirOperador();
  const json = JSON.stringify(dados ?? {});
  if (json.length > 500_000) return { ok: false, mensagem: "Proposta grande demais para salvar." };
  const { data: existe } = await db().from("disputas").select("id").eq("id", disputaId).maybeSingle();
  if (!existe) return { ok: false, mensagem: "Disputa não encontrada." };
  const { error } = await db()
    .from("propostas_disputa")
    .upsert(
      {
        disputa_id: disputaId,
        dados: JSON.parse(json),
        total: Number.isFinite(total) ? Math.round(total * 100) / 100 : null,
        salvo_por: eu.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "disputa_id" }
    );
  return error ? { ok: false, mensagem: error.message } : { ok: true, mensagem: "Proposta salva." };
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
