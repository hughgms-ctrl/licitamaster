"use server";

import { revalidatePath } from "next/cache";
import { db, type ClienteRow } from "@/lib/db";
import { moverDisputa } from "@/lib/disputas";
import { enviarWhatsApp } from "@/lib/notify";
import { formatarValor } from "@/lib/formato";
import { DECLARACAO_APROVACAO } from "@/lib/etapas";
import * as cofre from "@/lib/cofre";
import { registrarEvento } from "@/lib/disputas";
import type { SaidaCofre } from "@/components/Cofre";
import { ITENS_MANUAIS, type Preparo } from "@/lib/preparo";

/**
 * Ações do portal do cliente. A autenticação é o token na URL — então TODA
 * ação recebe o token e confere de novo, e só mexe em disputa do próprio
 * cliente (a função mover_disputa no banco exige p_cliente).
 */

export interface SaidaPortal {
  ok: boolean;
  mensagem: string;
}

const TOKEN_VALIDO = /^[a-f0-9]{48}$/;

async function clientePorToken(
  token: string
): Promise<Pick<ClienteRow, "id" | "razao_social" | "nome_fantasia" | "cnpj"> | null> {
  if (!TOKEN_VALIDO.test(token)) return null;
  const { data } = await db()
    .from("clientes")
    .select("id, razao_social, nome_fantasia, cnpj")
    .eq("token_portal", token)
    .eq("ativo", true)
    .maybeSingle();
  return data;
}

export async function responder(
  token: string,
  disputaId: string,
  resposta:
    | { decisao: "sim"; precoMinimo: number; notas: string; confirmo: boolean }
    | { decisao: "nao"; motivo: string }
): Promise<SaidaPortal> {
  const cliente = await clientePorToken(token);
  if (!cliente) return { ok: false, mensagem: "Link inválido ou expirado. Peça um novo." };

  const { data: d } = await db()
    .from("disputas")
    .select("id, status, cliente_id, licitacao:licitacoes(objeto, data_encerramento_proposta)")
    .eq("id", disputaId)
    .eq("cliente_id", cliente.id)
    .maybeSingle();
  if (!d) return { ok: false, mensagem: "Licitação não encontrada." };

  const lic = d.licitacao as unknown as { objeto: string | null; data_encerramento_proposta: string | null };
  if (lic.data_encerramento_proposta && new Date(lic.data_encerramento_proposta).getTime() < Date.now()) {
    return { ok: false, mensagem: "O prazo desta licitação já fechou." };
  }

  const nome = cliente.nome_fantasia || cliente.razao_social;
  let erro: string | null;
  let aviso: string;

  if (resposta.decisao === "sim") {
    const preco = Number(resposta.precoMinimo);
    if (!Number.isFinite(preco) || preco <= 0) {
      return { ok: false, mensagem: "Informe o preço mínimo (maior que zero)." };
    }
    if (!resposta.confirmo) {
      return { ok: false, mensagem: "Marque a confirmação para aprovar." };
    }
    erro = await moverDisputa({
      disputaId,
      de: ["aguardando_cliente"],
      para: "aprovada",
      ator: "cliente",
      tipo: "aprovada_pelo_cliente",
      clienteId: cliente.id,
      precoMinimo: preco,
      notasCliente: resposta.notas.trim().slice(0, 1000) || undefined,
      dados: { declaracao: DECLARACAO_APROVACAO },
    });
    aviso = `✅ *${nome}* APROVOU a participação\nPreço mínimo: *${formatarValor(preco)}*\n\n${(lic.objeto ?? "").slice(0, 200)}`;
  } else {
    erro = await moverDisputa({
      disputaId,
      de: ["aguardando_cliente"],
      para: "recusada",
      ator: "cliente",
      tipo: "recusada_pelo_cliente",
      clienteId: cliente.id,
      motivo: resposta.motivo.trim().slice(0, 1000) || "sem motivo informado",
    });
    aviso = `❌ *${nome}* recusou\nMotivo: ${resposta.motivo.trim() || "não informou"}\n\n${(lic.objeto ?? "").slice(0, 200)}`;
  }

  if (erro) return { ok: false, mensagem: erro };

  const operador = process.env.ALERTA_WHATSAPP_NUMERO;
  if (operador) await enviarWhatsApp(operador, aviso);

  revalidatePath(`/c/${token}`);
  return {
    ok: true,
    mensagem:
      resposta.decisao === "sim"
        ? "Aprovado! A partir daqui é com a gente: montamos a proposta e avisamos você a cada etapa."
        : "Tudo certo, não vamos participar desta.",
  };
}

// ── Cofre de documentos pelo portal ──────────────────────────────
// O cliente envia e consulta os próprios documentos. Apagar fica só com o
// operador: um clique errado do cliente não pode sumir com uma certidão
// que está numa proposta em andamento.

export async function ptPedirUpload(token: string, nome: string, mime: string, bytes: number) {
  const cliente = await clientePorToken(token);
  if (!cliente) return { erro: "Link inválido ou expirado." };
  return cofre.pedirUpload(cliente.id, nome, mime, bytes);
}

export async function ptRegistrar(token: string, path: string, nomeArquivo: string, tipo?: string): Promise<SaidaCofre> {
  const cliente = await clientePorToken(token);
  if (!cliente) return { ok: false, aviso: "Link inválido ou expirado." };
  try {
    const r = await cofre.registrar({
      clienteId: cliente.id,
      cnpjCliente: cliente.cnpj,
      path,
      nomeArquivo,
      enviadoPor: "cliente",
      tipo,
    });
    await registrarEvento({ cliente_id: cliente.id, ator: "cliente", tipo: "documento_enviado", dados: { tipo: r.documento.tipo } });
    const operador = process.env.ALERTA_WHATSAPP_NUMERO;
    if (operador) {
      await enviarWhatsApp(operador, `📎 *${cliente.nome_fantasia || cliente.razao_social}* enviou um documento pelo portal: ${nomeArquivo}`);
    }
    revalidatePath(`/c/${token}`);
    return { ok: true, documento: r.documento, aviso: r.aviso };
  } catch (e) {
    return { ok: false, aviso: (e as Error).message };
  }
}

export async function ptLink(token: string, documentoId: string) {
  const cliente = await clientePorToken(token);
  if (!cliente) throw new Error("Link inválido ou expirado.");
  return cofre.linkArquivo(cliente.id, documentoId);
}

// ── Preparação pelo portal ───────────────────────────────────────
// O cliente avisa que fez a parte dele (ex: subiu a conta gov.br). Vira
// "cliente diz que fez": quem confere e marca como feito é a equipe.

export async function ptInformarPreparo(token: string, item: string, nota: string): Promise<SaidaPortal> {
  const cliente = await clientePorToken(token);
  if (!cliente) return { ok: false, mensagem: "Link inválido ou expirado." };
  const def = ITENS_MANUAIS.find((i) => i.id === item);
  if (!def || !def.instrucao) return { ok: false, mensagem: "Item desconhecido." };

  const { data, error } = await db().from("clientes").select("preparo").eq("id", cliente.id).single();
  if (error) return { ok: false, mensagem: "Não deu para salvar agora. Tente de novo em instantes." };
  const preparo = { ...((data.preparo as Preparo) ?? {}) };
  if (preparo[item]?.status === "feito") return { ok: true, mensagem: "Esse já está conferido por nós." };
  preparo[item] = {
    status: "cliente_informou",
    nota: nota.trim().slice(0, 500) || null,
    em: new Date().toISOString(),
    por: "cliente",
  };
  const { error: e2 } = await db().from("clientes").update({ preparo }).eq("id", cliente.id);
  if (e2) return { ok: false, mensagem: "Não deu para salvar agora. Tente de novo em instantes." };

  await registrarEvento({ cliente_id: cliente.id, ator: "cliente", tipo: "preparo_informado", dados: { item } });
  const operador = process.env.ALERTA_WHATSAPP_NUMERO;
  if (operador) {
    await enviarWhatsApp(
      operador,
      `✅ *${cliente.nome_fantasia || cliente.razao_social}* avisou pelo portal que concluiu: ${def.rotulo}. Confira na mesa.`
    );
  }
  revalidatePath(`/c/${token}`);
  return { ok: true, mensagem: "Obrigado! Vamos conferir e avisamos se faltar algo." };
}
