import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Tudo é da mesa de operação e exige login, EXCETO:
 *   /c/<token>        portal do cliente — autenticado pelo token na URL
 *   /api/sync, /api/resumo, /api/alertas, /api/resultados, /api/automacao   agendador — CRON_SECRET
 *   /entrar, /criar-conta, /redefinir-senha, /auth/*   o próprio login
 *
 * Aqui só se confere que há uma sessão válida (e se renova o cookie dela).
 * Se a pessoa está na equipe é conferido no servidor, em cada página e
 * server action (`exigirOperador`) — o middleware não é a única porta.
 */
export async function middleware(req: NextRequest) {
  // Link de e-mail do Auth que caiu na raiz (acontece quando o Supabase usa
  // a Site URL em vez do redirect pedido): encaminha o código para o
  // callback, que abre a sessão, em vez de jogar a pessoa na tela de entrada.
  const code = req.nextUrl.searchParams.get("code");
  if (code && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(code)}&next=/`;
    return NextResponse.redirect(url);
  }

  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return bloquear(req);

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of lista) res.cookies.set(name, value, options);
      },
    },
  });

  // getUser valida o token no servidor do Auth (getSession só leria o cookie).
  const { data } = await supabase.auth.getUser();
  if (!data.user) return bloquear(req);
  return res;
}

function bloquear(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!c/|api/sync|api/resumo|api/alertas|api/resultados|api/automacao|entrar|criar-conta|redefinir-senha|auth/|_next/|favicon.ico).*)"],
};
