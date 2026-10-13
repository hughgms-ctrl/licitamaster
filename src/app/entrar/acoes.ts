"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, iguais, valorSessaoEsperado } from "@/lib/sessao";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function entrar(_: string | null, form: FormData): Promise<string | null> {
  const esperado = await valorSessaoEsperado();
  if (!esperado) {
    return "O servidor não tem OPERADOR_SENHA e SESSAO_SEGREDO configurados no .env.local.";
  }

  const senha = String(form.get("senha") ?? "");
  // Freio barato contra força bruta: toda tentativa custa 1s.
  await sleep(1000);
  if (!iguais(senha, process.env.OPERADOR_SENHA!)) return "Senha incorreta.";

  (await cookies()).set(COOKIE_SESSAO, esperado, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/entrar");
}
