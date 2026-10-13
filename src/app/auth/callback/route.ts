import { NextResponse, type NextRequest } from "next/server";
import { authServidor } from "@/lib/auth";

/**
 * Volta dos links de e-mail do Supabase Auth (confirmação de conta e
 * "esqueci a senha"). Troca o código do link por uma sessão em cookie e
 * segue para `next`.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  // só caminhos internos: impede usar o link como redirecionador aberto
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const auth = await authServidor();
    const { error } = await auth.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, req.url));
  }
  return NextResponse.redirect(new URL("/entrar?motivo=link-invalido", req.url));
}
