import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";

/**
 * Tudo é da mesa de operação, e exige sessão, EXCETO:
 *   /c/<token>   portal do cliente — autenticado pelo token na URL
 *   /api/sync    coleta — autenticada pelo CRON_SECRET
 *   /entrar      a própria tela de login
 */
export async function middleware(req: NextRequest) {
  if (await sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value)) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!c/|api/sync|entrar|_next/|favicon.ico).*)"],
};
