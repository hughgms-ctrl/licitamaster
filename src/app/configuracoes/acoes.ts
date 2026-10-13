"use server";

import { revalidatePath } from "next/cache";
import { exigirOperador } from "@/lib/sessao";
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
