import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { db } from "./db";

/**
 * Login da equipe: Supabase Auth (e-mail e senha) + a lista `operadores`.
 *
 * O cliente do Auth usa a chave PUBLICÁVEL e a sessão em cookie — é o
 * padrão do @supabase/ssr. Ele só serve para saber QUEM está logado; tudo
 * que lê ou grava dados continua indo pelo `db()` (service_role), no
 * servidor, depois de conferir que a pessoa está na lista.
 */

function urlEChave() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, chave };
}

/** Cliente do Auth para server components, server actions e route handlers. */
export async function authServidor() {
  const { url, chave } = urlEChave();
  const loja = await cookies();
  return createServerClient(url, chave, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options);
        } catch {
          // Server component não pode gravar cookie; o middleware renova a
          // sessão a cada requisição, então perder esta escrita é inofensivo.
        }
      },
    },
  });
}

export interface Operador {
  email: string;
  nome: string | null;
  papel: "admin" | "operador";
}

/** Quem está logado, se estiver na equipe. Null caso contrário. */
export async function operadorAtual(): Promise<Operador | null> {
  const auth = await authServidor();
  const { data } = await auth.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: op } = await db().from("operadores").select("email, nome, papel").eq("email", email).maybeSingle();
  return (op as Operador | null) ?? null;
}

/**
 * Barreira dentro de cada server action do operador.
 *
 * O middleware NÃO basta: server action do Next é um endpoint público que
 * pode ser chamado por POST em qualquer rota — inclusive /c/<token>, que o
 * middleware deixa passar. Sem esta checagem, quem tem o link do portal de
 * um cliente poderia disparar ação de operador.
 */
export async function exigirOperador(): Promise<Operador> {
  const op = await operadorAtual();
  if (!op) throw new Error("Sessão expirada ou sem acesso. Entre de novo.");
  return op;
}

export async function exigirAdmin(): Promise<Operador> {
  const op = await exigirOperador();
  if (op.papel !== "admin") throw new Error("Só administradores podem fazer isso.");
  return op;
}

/**
 * Para páginas da mesa: quem não está na equipe volta para a entrada.
 * Necessário porque o middleware só sabe que existe uma sessão — e qualquer
 * pessoa consegue criar um usuário no Auth com a chave publicável.
 */
export async function exigirOperadorPagina(): Promise<Operador> {
  const op = await operadorAtual();
  if (!op) {
    const { redirect } = await import("next/navigation");
    redirect("/entrar?motivo=sem-acesso");
  }
  return op!;
}
