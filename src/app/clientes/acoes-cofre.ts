"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { exigirOperador } from "@/lib/sessao";
import { registrarEvento } from "@/lib/disputas";
import * as cofre from "@/lib/cofre";
import type { SaidaCofre } from "@/components/Cofre";

/**
 * Cofre pela mesa de operação. O primeiro argumento (clienteId) vem
 * amarrado pela página com .bind — mas server action é endpoint público, então
 * a sessão de operador é conferida de novo em cada uma.
 */

async function cnpjDo(clienteId: string): Promise<string> {
  const { data } = await db().from("clientes").select("cnpj").eq("id", clienteId).single();
  if (!data) throw new Error("Cliente não encontrado.");
  return data.cnpj as string;
}

export async function opPedirUpload(clienteId: string, nome: string, mime: string, bytes: number) {
  await exigirOperador();
  return cofre.pedirUpload(clienteId, nome, mime, bytes);
}

export async function opRegistrar(
  clienteId: string,
  path: string,
  nomeArquivo: string,
  tipo?: string
): Promise<SaidaCofre> {
  await exigirOperador();
  try {
    const r = await cofre.registrar({
      clienteId,
      cnpjCliente: await cnpjDo(clienteId),
      path,
      nomeArquivo,
      enviadoPor: "operador",
      tipo,
    });
    await registrarEvento({ cliente_id: clienteId, ator: "operador", tipo: "documento_enviado", dados: { tipo: r.documento.tipo } });
    revalidatePath(`/clientes/${clienteId}`);
    return { ok: true, documento: r.documento, aviso: r.aviso };
  } catch (e) {
    return { ok: false, aviso: (e as Error).message };
  }
}

export async function opLink(clienteId: string, documentoId: string) {
  await exigirOperador();
  return cofre.linkArquivo(clienteId, documentoId);
}

export async function opAtualizar(clienteId: string, documentoId: string, tipo: string, validade: string | null) {
  await exigirOperador();
  await cofre.atualizar(clienteId, documentoId, tipo, validade);
  revalidatePath(`/clientes/${clienteId}`);
}

export async function opApagar(clienteId: string, documentoId: string) {
  await exigirOperador();
  await cofre.apagar(clienteId, documentoId);
  await registrarEvento({ cliente_id: clienteId, ator: "operador", tipo: "documento_apagado", dados: { documento_id: documentoId } });
  revalidatePath(`/clientes/${clienteId}`);
}
