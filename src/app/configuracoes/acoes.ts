"use server";

import { revalidatePath } from "next/cache";
import { exigirAdmin, exigirOperador } from "@/lib/auth";
import { db } from "@/lib/db";
import { removerConfigIA, salvarConfigIA, testarChave, type Provedor } from "@/lib/config-ia";

export interface SaidaConfig {
  ok: boolean;
  mensagem: string;
}

/** Testa a chave contra o provedor e só salva se ela funcionar. */
export async function salvarIA(_: SaidaConfig | null, form: FormData): Promise<SaidaConfig> {
  await exigirOperador();
  const provedor: Provedor = form.get("provedor") === "openai" ? "openai" : "anthropic";
  const modelo = String(form.get("modelo") ?? "").trim();
  const apiKey = String(form.get("api_key") ?? "").trim();

  if (!modelo) return { ok: false, mensagem: "Escolha o modelo." };
  if (!apiKey) return { ok: false, mensagem: "Cole a chave de API." };
  if (provedor === "anthropic" && !apiKey.startsWith("sk-ant-")) {
    return { ok: false, mensagem: "Chave da Anthropic começa com sk-ant-. Confira se copiou a chave certa." };
  }
  if (provedor === "openai" && !apiKey.startsWith("sk-")) {
    return { ok: false, mensagem: "Chave da OpenAI começa com sk-. Confira se copiou a chave certa." };
  }

  const erro = await testarChave(provedor, apiKey, modelo);
  if (erro) return { ok: false, mensagem: `A chave não foi salva. ${erro}` };

  await salvarConfigIA(provedor, modelo, apiKey);
  revalidatePath("/configuracoes");
  return { ok: true, mensagem: "Chave testada e salva. A IA já está usando esta configuração." };
}

export async function removerIA(): Promise<void> {
  await exigirOperador();
  await removerConfigIA();
  revalidatePath("/configuracoes");
}

// ── Equipe ───────────────────────────────────────────────────────

export async function liberarEmail(_: SaidaConfig | null, form: FormData): Promise<SaidaConfig> {
  const admin = await exigirAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const papel = form.get("papel") === "admin" ? "admin" : "operador";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, mensagem: "Informe um e-mail válido." };
  const { error } = await db()
    .from("operadores")
    .upsert({ email, papel, liberado_por: admin.email }, { onConflict: "email" });
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/configuracoes");
  return { ok: true, mensagem: `${email} liberado. Agora a pessoa cria a conta em "Criar conta" com este e-mail.` };
}

export async function removerOperador(email: string): Promise<void> {
  const admin = await exigirAdmin();
  if (email === admin.email) throw new Error("Você não pode remover a si mesmo.");
  await db().from("operadores").delete().eq("email", email);
  revalidatePath("/configuracoes");
}
