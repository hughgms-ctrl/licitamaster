"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, type Porte } from "@/lib/db";
import { exigirOperador } from "@/lib/auth";
import { registrarEvento } from "@/lib/disputas";
import { ITENS_MANUAIS, type Preparo, type StatusPreparo } from "@/lib/preparo";

const STATUS_PREPARO: StatusPreparo[] = ["pendente", "cliente_informou", "feito", "nao_se_aplica"];

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
    endereco: so(form.get("endereco")) || null,
    cidade_uf: so(form.get("cidade_uf")) || null,
    representante_nome: so(form.get("representante_nome")) || null,
    representante_cpf: digitos(so(form.get("representante_cpf"))) || null,
    representante_cargo: so(form.get("representante_cargo")) || null,
  };
}

const CAMPOS_PROPOSTA = ["endereco", "cidade_uf", "representante_nome", "representante_cpf", "representante_cargo"] as const;

/** Sem os campos da proposta: para quando a migration deles ainda não rodou no banco. */
function semCamposProposta<T extends Record<string, unknown>>(c: T): T {
  const x = { ...c };
  for (const k of CAMPOS_PROPOSTA) delete x[k];
  return x;
}

/** Coluna que o banco ainda não conhece (PostgREST PGRST204 / Postgres 42703). */
function colunaFaltando(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "PGRST204" || e.code === "42703" || /column .* does not exist|Could not find the/i.test(e.message ?? ""));
}

function validar(c: ReturnType<typeof lerFormulario>): string | null {
  if (!c.razao_social) return "Informe a razão social.";
  if (c.cnpj.length !== 14) return "O CNPJ precisa ter 14 dígitos.";
  if (c.representante_cpf && c.representante_cpf.length !== 11) return "O CPF do representante precisa ter 11 dígitos.";
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

  let { data, error } = await db().from("clientes").insert(c).select("id").single();
  if (colunaFaltando(error)) {
    ({ data, error } = await db().from("clientes").insert(semCamposProposta(c)).select("id").single());
  }
  if (error || !data) {
    return error?.code === "23505" ? "Já existe um cliente com este CNPJ." : (error?.message ?? "Não deu para cadastrar.");
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

  let { error } = await db().from("clientes").update(c).eq("id", id);
  if (colunaFaltando(error)) ({ error } = await db().from("clientes").update(semCamposProposta(c)).eq("id", id));
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

/** Muda a situação de um item da preparação do cliente. */
export async function marcarPreparo(
  id: string,
  item: string,
  status: StatusPreparo,
  nota: string | null
): Promise<void> {
  const eu = await exigirOperador();
  if (!ITENS_MANUAIS.some((i) => i.id === item)) throw new Error("Item desconhecido.");
  if (!STATUS_PREPARO.includes(status)) throw new Error("Situação inválida.");
  const { data, error } = await db().from("clientes").select("preparo").eq("id", id).single();
  if (error) throw new Error(error.message);
  const preparo = { ...((data.preparo as Preparo) ?? {}) };
  preparo[item] = { status, nota: nota?.trim() || null, em: new Date().toISOString(), por: eu.email };
  const { error: e2 } = await db().from("clientes").update({ preparo }).eq("id", id);
  if (e2) throw new Error(e2.message);
  await registrarEvento({ cliente_id: id, ator: "operador", tipo: "preparo_marcado", dados: { item, status } });
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}
