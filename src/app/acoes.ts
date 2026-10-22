"use server";

import { revalidatePath } from "next/cache";
import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta, type StatusDisputa } from "@/lib/db";
import { exigirOperador } from "@/lib/auth";
import { redigirRecurso, type TipoRecurso } from "@/lib/ai";
import { analisarDisputa, lerEditalDisputa } from "@/lib/automacao";
import type { FichaRow } from "@/lib/ficha";
import { FASES, type GuiaMarcado } from "@/lib/guia";
import type { ResultadoDisputa } from "@/lib/resultado";
import type { ContratoDisputa } from "@/lib/contrato";
import { consultarResultado, gravarResultado } from "@/lib/resultados-pncp";
import type { AnalisePreco } from "@/lib/preco";
import { analisarMercado, carregarReferencias } from "@/lib/referencias";
import { convidarCliente, convidarClienteVarias } from "@/lib/notify";
import { linhaLicitacao } from "@/lib/coleta";
import type { ContratacaoPNCP } from "@/lib/pncp";
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

/** Muda a etapa para "com o cliente" (o que já trava a licitação para os outros). */
async function marcarEnviada(d: DisputaCompleta): Promise<string | null> {
  const encerra = d.licitacao.data_encerramento_proposta;
  if (encerra && new Date(encerra).getTime() < Date.now()) return "O prazo de proposta desta licitação já fechou.";
  return moverDisputa({
    disputaId: d.id,
    de: ["sugerida", "recusada"],
    para: "aguardando_cliente",
    ator: "operador",
    tipo: "enviada_ao_cliente",
  });
}

async function contatoCliente(clienteId: string) {
  const { data } = await db()
    .from("clientes")
    .select("whatsapp, contato_nome, token_portal")
    .eq("id", clienteId)
    .single<Pick<ClienteRow, "whatsapp" | "contato_nome" | "token_portal">>();
  return data;
}

/**
 * Manda a licitação para o cliente decidir: muda a etapa e avisa no WhatsApp
 * com o link do portal.
 */
export async function enviarAoCliente(disputaId: string): Promise<Saida> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };

  // Com a análise profunda feita, o portal mostra ao cliente o que vão exigir
  // (documentos, atestados, prazo). Sem ela, envia assim mesmo: a mesa avisa
  // antes, e o operador decide.
  const { data: fichaRow } = await db()
    .from("fichas_edital")
    .select("ficha")
    .eq("licitacao_id", d.licitacao_id)
    .maybeSingle<Pick<FichaRow, "ficha">>();

  const erro = await marcarEnviada(d);
  if (erro) return { ok: false, mensagem: erro };

  const cliente = await contatoCliente(d.cliente_id);
  const link = cliente ? urlPortal(cliente.token_portal) : undefined;
  const enviou = cliente
    ? await convidarCliente({
        whatsapp: cliente.whatsapp,
        contato: cliente.contato_nome,
        objeto: fichaRow?.ficha.resumo_cliente || d.analise_ia?.resumo_cliente || d.licitacao.objeto || "",
        orgao: d.licitacao.orgao_razao_social,
        valor: d.licitacao.valor_estimado,
        encerramento: d.licitacao.data_encerramento_proposta,
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

export interface SaidaLote {
  enviadas: string[];
  falhas: { id: string; mensagem: string }[];
  /** clientes que não receberam o WhatsApp: o link para mandar à mão */
  semWhatsapp: { cliente: string; link: string }[];
}

/**
 * Envio em lote, depois que o operador conferiu a lista. Cada licitação passa
 * pelas mesmas regras do envio avulso; cada cliente recebe uma mensagem só,
 * com todas as que são dele.
 */
export async function enviarVarias(ids: string[]): Promise<SaidaLote> {
  await exigirOperador();
  const saida: SaidaLote = { enviadas: [], falhas: [], semWhatsapp: [] };
  const porCliente = new Map<string, DisputaCompleta[]>();

  for (const id of ids.slice(0, 100)) {
    const d = await carregar(id);
    if (!d) {
      saida.falhas.push({ id, mensagem: "Disputa não encontrada." });
      continue;
    }
    const erro = await marcarEnviada(d);
    if (erro) {
      saida.falhas.push({ id, mensagem: erro });
      continue;
    }
    saida.enviadas.push(id);
    porCliente.set(d.cliente_id, [...(porCliente.get(d.cliente_id) ?? []), d]);
  }

  for (const [clienteId, lista] of porCliente) {
    const cliente = await contatoCliente(clienteId);
    if (!cliente) continue;
    const link = urlPortal(cliente.token_portal);
    const enviou =
      lista.length === 1
        ? await convidarCliente({
            whatsapp: cliente.whatsapp,
            contato: cliente.contato_nome,
            objeto: lista[0].analise_ia?.resumo_cliente || lista[0].licitacao.objeto || "",
            orgao: lista[0].licitacao.orgao_razao_social,
            valor: lista[0].licitacao.valor_estimado,
            encerramento: lista[0].licitacao.data_encerramento_proposta,
            linkPortal: link,
          })
        : await convidarClienteVarias({
            whatsapp: cliente.whatsapp,
            contato: cliente.contato_nome,
            licitacoes: lista.map((d) => ({
              objeto: d.analise_ia?.resumo_cliente || d.licitacao.objeto || "",
              valor: d.licitacao.valor_estimado,
              encerramento: d.licitacao.data_encerramento_proposta,
            })),
            linkPortal: link,
          });
    if (!enviou) saida.semWhatsapp.push({ cliente: lista[0].cliente.nome_fantasia || lista[0].cliente.razao_social, link });
  }

  revalidatePath("/");
  return saida;
}

/** Roda a análise da IA para esta licitação, no contexto deste cliente. */
export async function analisar(disputaId: string): Promise<Saida & { analise?: DisputaCompleta["analise_ia"] }> {
  await exigirOperador();
  const d = await carregar(disputaId);
  if (!d) return { ok: false, mensagem: "Disputa não encontrada." };
  try {
    const analise = await analisarDisputa(d, "operador");
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
  const refs = await carregarReferencias(db(), d.licitacao_id);
  return { ok: true, mensagem: "", base: refs.length, analise: analisarMercado(d.licitacao, refs) };
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
    const { linha, lidos, ignorados } = await lerEditalDisputa(d, "operador");
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

/**
 * Grava o preço mínimo da disputa pelo operador (normalmente vindo da
 * calculadora). O cliente também informa o dele no portal; o último vale.
 */
export async function salvarPrecoMinimo(disputaId: string, valor: number | null): Promise<Saida> {
  await exigirOperador();
  if (valor != null && (!Number.isFinite(valor) || valor <= 0)) return { ok: false, mensagem: "Valor inválido." };
  const { error } = await db()
    .from("disputas")
    .update({ preco_minimo: valor == null ? null : Math.round(valor * 100) / 100 })
    .eq("id", disputaId);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/");
  return { ok: true, mensagem: valor == null ? "Preço mínimo apagado." : "Preço mínimo salvo." };
}

/**
 * Traz para a triagem uma licitação da lista "quase entraram": grava a
 * licitação (se ainda não existe) e a sugestão para este cliente.
 */
export async function trazerParaTriagem(numeroControle: string, clienteId: string): Promise<Saida & { disputaId?: string }> {
  await exigirOperador();
  const supabase = db();
  const { data: q } = await supabase
    .from("quase_entraram")
    .select("perfil_id, score, termos, motivo, raw")
    .eq("numero_controle_pncp", numeroControle)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!q) return { ok: false, mensagem: "Não está mais na lista. Recarregue a página." };

  const c = q.raw as ContratacaoPNCP;
  const { data: existe } = await supabase.from("licitacoes").select("numero_controle_pncp").eq("numero_controle_pncp", numeroControle).maybeSingle();
  if (!existe) {
    const { error } = await supabase.from("licitacoes").insert(linhaLicitacao(c, c.modalidadeId ?? 6));
    if (error) return { ok: false, mensagem: error.message };
  }
  const { data: disp, error: erroDisp } = await supabase
    .from("disputas")
    .upsert(
      {
        licitacao_id: numeroControle,
        cliente_id: clienteId,
        perfil_id: q.perfil_id,
        score: q.score,
        termos_encontrados: q.termos ?? [],
      },
      { onConflict: "licitacao_id,cliente_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (erroDisp) return { ok: false, mensagem: erroDisp.message };

  await supabase.from("quase_entraram").delete().eq("numero_controle_pncp", numeroControle).eq("cliente_id", clienteId);
  if (disp?.id) {
    await registrarEvento({
      disputa_id: disp.id as string,
      cliente_id: clienteId,
      ator: "operador",
      tipo: "trazida_para_triagem",
      dados: { motivo_fora: q.motivo },
    });
  }
  revalidatePath("/");
  return {
    ok: true,
    mensagem: disp?.id ? "Está na triagem." : "Este cliente já tinha esta licitação na mesa.",
    disputaId: (disp?.id as string | undefined) ?? undefined,
  };
}
