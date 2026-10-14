"use server";

import { revalidatePath } from "next/cache";
import { db, type ClienteRow } from "@/lib/db";
import { exigirOperador } from "@/lib/auth";
import { registrarEvento } from "@/lib/disputas";
import { asaasConfigurado, criarCobrancaAsaas, garantirClienteAsaas, situacaoCobrancaAsaas } from "@/lib/asaas";

export interface SaidaFinanceiro {
  ok: boolean;
  mensagem: string;
  link?: string | null;
}

/** Quanto o cliente paga: mensalidade e porcentagem sobre o que recebe dos contratos. */
export async function salvarPlano(clienteId: string, mensalidade: number | null, percentual: number | null): Promise<SaidaFinanceiro> {
  await exigirOperador();
  if (percentual != null && (percentual < 0 || percentual > 50)) return { ok: false, mensagem: "Porcentagem entre 0 e 50." };
  if (mensalidade != null && mensalidade < 0) return { ok: false, mensagem: "Mensalidade inválida." };
  const { error } = await db()
    .from("clientes")
    .update({ mensalidade, percentual_exito: percentual })
    .eq("id", clienteId);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/financeiro");
  return { ok: true, mensagem: "Plano salvo." };
}

/**
 * Gera uma cobrança para o cliente. Com o Asaas configurado, cria a fatura lá
 * (boleto ou Pix, à escolha do cliente) e guarda o link; sem ele, só registra.
 */
export async function gerarCobranca(p: {
  clienteId: string;
  tipo: "mensalidade" | "exito";
  valor: number;
  vencimento: string;
  referencia: string;
  descricao: string;
}): Promise<SaidaFinanceiro> {
  const eu = await exigirOperador();
  if (!(p.valor > 0)) return { ok: false, mensagem: "Valor precisa ser maior que zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) return { ok: false, mensagem: "Vencimento inválido." };
  const { data: c } = await db().from("clientes").select("*").eq("id", p.clienteId).maybeSingle<ClienteRow & { asaas_cliente_id?: string | null }>();
  if (!c) return { ok: false, mensagem: "Cliente não encontrado." };

  let asaasId: string | null = null;
  let link: string | null = null;
  let situacao = "emitida";
  if (asaasConfigurado()) {
    try {
      const idCliente = c.asaas_cliente_id || (await garantirClienteAsaas(c));
      if (!c.asaas_cliente_id) await db().from("clientes").update({ asaas_cliente_id: idCliente }).eq("id", c.id);
      const cob = await criarCobrancaAsaas({
        cliente: idCliente,
        valor: Math.round(p.valor * 100) / 100,
        vencimento: p.vencimento,
        descricao: p.descricao,
        referencia: `${p.tipo}:${p.referencia}`,
      });
      asaasId = cob.id;
      link = cob.invoiceUrl;
      situacao = cob.status;
    } catch (e) {
      return { ok: false, mensagem: (e as Error).message };
    }
  }

  const { error } = await db().from("cobrancas").insert({
    cliente_id: c.id,
    tipo: p.tipo,
    referencia: p.referencia.slice(0, 100),
    valor: Math.round(p.valor * 100) / 100,
    vencimento: p.vencimento,
    asaas_id: asaasId,
    link,
    situacao,
    criado_por: eu.email,
  });
  if (error) {
    return {
      ok: false,
      mensagem: asaasId
        ? `A fatura foi criada no Asaas (${asaasId}), mas não deu para registrar aqui: ${error.message}. Não gere de novo.`
        : error.message,
      link,
    };
  }
  await registrarEvento({ cliente_id: c.id, ator: "operador", tipo: "cobranca_gerada", dados: { tipo: p.tipo, valor: p.valor, asaas: asaasId } });
  revalidatePath("/financeiro");
  return {
    ok: true,
    mensagem: asaasId ? "Fatura criada no Asaas. Mande o link ao cliente." : "Cobrança registrada (Asaas não configurado).",
    link,
  };
}

/** Consulta no Asaas a situação das cobranças em aberto. */
export async function atualizarSituacoes(): Promise<SaidaFinanceiro> {
  await exigirOperador();
  if (!asaasConfigurado()) return { ok: false, mensagem: "Asaas não configurado." };
  const { data } = await db()
    .from("cobrancas")
    .select("id, asaas_id, situacao")
    .not("asaas_id", "is", null)
    .in("situacao", ["PENDING", "OVERDUE"])
    .limit(100);
  let mudaram = 0;
  for (const c of data ?? []) {
    try {
      const s = await situacaoCobrancaAsaas(c.asaas_id as string);
      if (s !== c.situacao) {
        await db().from("cobrancas").update({ situacao: s }).eq("id", c.id);
        mudaram++;
      }
    } catch {
      /* uma falha não impede as outras */
    }
  }
  revalidatePath("/financeiro");
  return { ok: true, mensagem: mudaram ? `${mudaram} cobrança(s) mudaram de situação.` : "Nada mudou desde a última consulta." };
}
