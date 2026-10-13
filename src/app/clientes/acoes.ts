"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, type Porte } from "@/lib/db";
import { exigirOperador } from "@/lib/auth";
import { registrarEvento } from "@/lib/disputas";

const PORTES: Porte[] = ["MEI", "ME", "EPP", "demais"];
const so = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const digitos = (v: string) => v.replace(/\D/g, "");

function lerFormulario(form: FormData) {
  const porte = so(form.get("porte")) as Porte;
  return {
    razao_social: so(form.get("razao_social")),
    nome_fantasia: so(form.get("nome_fantasia")) || null,
    cnpj: digitos(so(form.get("cnpj"))),
    porte: PORTES.includes(porte) ? porte : "ME",
    contato_nome: so(form.get("contato_nome")) || null,
    whatsapp: digitos(so(form.get("whatsapp"))) || null,
    email: so(form.get("email")) || null,
    contexto: so(form.get("contexto")),
  };
}

function validar(c: ReturnType<typeof lerFormulario>): string | null {
  if (!c.razao_social) return "Informe a razão social.";
  if (c.cnpj.length !== 14) return "O CNPJ precisa ter 14 dígitos.";
  if (c.whatsapp && c.whatsapp.length < 12) {
    return "WhatsApp no formato 55 + DDD + número (ex: 5527999999999).";
  }
  return null;
}

export async function criarCliente(_: string | null, form: FormData): Promise<string | null> {
  await exigirOperador();
  const c = lerFormulario(form);
  const erro = validar(c);
  if (erro) return erro;

  const { data, error } = await db().from("clientes").insert(c).select("id").single();
  if (error) {
    return error.code === "23505" ? "Já existe um cliente com este CNPJ." : error.message;
  }
  await registrarEvento({ cliente_id: data.id, ator: "operador", tipo: "cliente_criado" });
  redirect(`/clientes/${data.id}`);
}

export async function salvarCliente(
  id: string,
  _: string | null,
  form: FormData
): Promise<string | null> {
  await exigirOperador();
  const c = { ...lerFormulario(form), ativo: form.get("ativo") === "on" };
  const erro = validar(c);
  if (erro) return erro;

  const { error } = await db().from("clientes").update(c).eq("id", id);
  if (error) return error.code === "23505" ? "Já existe outro cliente com este CNPJ." : error.message;
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return "Salvo.";
}

/** Gera um link novo de portal. O antigo para de funcionar na hora. */
export async function regenerarLink(id: string): Promise<void> {
  await exigirOperador();
  const token = randomBytes(24).toString("hex");
  const { error } = await db().from("clientes").update({ token_portal: token }).eq("id", id);
  if (error) throw new Error(error.message);
  await registrarEvento({ cliente_id: id, ator: "operador", tipo: "link_portal_regenerado" });
  revalidatePath(`/clientes/${id}`);
}
