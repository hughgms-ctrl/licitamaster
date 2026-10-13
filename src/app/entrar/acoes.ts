"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { authServidor } from "@/lib/auth";

/** Mensagens do Supabase Auth em português, sem revelar se o e-mail existe. */
function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme o seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Este e-mail já tem conta. Entre ou use \"Esqueci a senha\".";
  }
  if (m.includes("password") && m.includes("characters")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Espere alguns minutos.";
  return msg;
}

const urlBase = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const lerEmail = (f: FormData) => String(f.get("email") ?? "").trim().toLowerCase();

export async function entrar(_: string | null, form: FormData): Promise<string | null> {
  const email = lerEmail(form);
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return "Informe e-mail e senha.";

  const auth = await authServidor();
  const { error } = await auth.auth.signInWithPassword({ email, password: senha });
  if (error) return traduzir(error.message);

  const { data: op } = await db().from("operadores").select("email").eq("email", email).maybeSingle();
  if (!op) {
    await auth.auth.signOut();
    return "Sua conta existe, mas ainda não foi liberada para a equipe. Peça ao administrador.";
  }
  redirect("/");
}

/**
 * Cria a conta. Só passa quem está liberado na lista `operadores` — exceto
 * a PRIMEIRA conta do sistema, que vira administradora (sem ela não haveria
 * quem liberar as outras).
 */
export async function criarConta(_: string | null, form: FormData): Promise<string | null> {
  const email = lerEmail(form);
  const nome = String(form.get("nome") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  const confirma = String(form.get("confirma") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Informe um e-mail válido.";
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (senha !== confirma) return "As senhas não conferem.";

  const supabase = db();
  const { count } = await supabase.from("operadores").select("email", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    const { error } = await supabase.from("operadores").insert({ email, nome: nome || null, papel: "admin", liberado_por: "primeira conta" });
    if (error) return error.message;
  } else {
    const { data: op } = await supabase.from("operadores").select("email").eq("email", email).maybeSingle();
    if (!op) return "Este e-mail não está liberado. Peça ao administrador para incluí-lo em Configurações → Equipe.";
    if (nome) await supabase.from("operadores").update({ nome }).eq("email", email);
  }

  const auth = await authServidor();
  const { data, error } = await auth.auth.signUp({
    email,
    password: senha,
    options: { emailRedirectTo: `${urlBase()}/auth/callback?next=/`, data: { nome } },
  });
  if (error) return traduzir(error.message);

  // Com confirmação de e-mail desligada no Supabase, a sessão já vem pronta.
  if (data.session) redirect("/");
  return "ENVIADO";
}

export async function pedirRedefinicao(_: string | null, form: FormData): Promise<string | null> {
  const email = lerEmail(form);
  if (!email) return "Informe o seu e-mail.";
  const auth = await authServidor();
  const { error } = await auth.auth.resetPasswordForEmail(email, {
    redirectTo: `${urlBase()}/auth/callback?next=/nova-senha`,
  });
  // Mesmo texto exista o e-mail ou não: não dá para descobrir quem tem conta.
  if (error && !error.message.toLowerCase().includes("not found")) return traduzir(error.message);
  return "ENVIADO";
}

export async function definirNovaSenha(_: string | null, form: FormData): Promise<string | null> {
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (senha !== String(form.get("confirma") ?? "")) return "As senhas não conferem.";
  const auth = await authServidor();
  const { error } = await auth.auth.updateUser({ password: senha });
  if (error) return traduzir(error.message);
  redirect("/");
}

export async function sair() {
  const auth = await authServidor();
  await auth.auth.signOut();
  redirect("/entrar");
}
