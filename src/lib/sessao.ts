/**
 * Sessão do operador: uma senha só (OPERADOR_SENHA), cookie httpOnly.
 *
 * O valor do cookie é um HMAC da senha com SESSAO_SEGREDO — nunca a senha.
 * Trocar qualquer um dos dois derruba todas as sessões abertas.
 *
 * Usa Web Crypto porque roda nos dois lados: no middleware (edge) e nas
 * server actions (node).
 */

export const COOKIE_SESSAO = "lm_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 14; // 14 dias

async function hmac(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** O valor esperado do cookie, ou null se o servidor não está configurado. */
export async function valorSessaoEsperado(): Promise<string | null> {
  const senha = process.env.OPERADOR_SENHA;
  const segredo = process.env.SESSAO_SEGREDO;
  if (!senha || !segredo) return null;
  return hmac(segredo, `operador:${senha}`);
}

/** Comparação sem atalho: não vaza pelo tempo quantos caracteres bateram. */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function sessaoValida(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const esperado = await valorSessaoEsperado();
  return esperado != null && iguais(cookie, esperado);
}

/**
 * Barreira dentro de cada server action do operador.
 *
 * O middleware NÃO basta: server action do Next é um endpoint público que
 * pode ser chamado por POST em qualquer rota — inclusive /c/<token>, que o
 * middleware deixa passar. Sem esta checagem, quem tem o link do portal de
 * um cliente poderia disparar ação de operador.
 */
export async function exigirOperador(): Promise<void> {
  const { cookies } = await import("next/headers");
  const valor = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!(await sessaoValida(valor))) throw new Error("Sessão de operador expirada. Entre de novo.");
}
