import type { NextRequest } from "next/server";

/**
 * As rotas chamadas pelo agendador (/api/sync, /api/resumo) ficam fora do
 * login e se protegem pelo CRON_SECRET. Sem o segredo configurado, recusam
 * tudo — nunca abrem por omissão.
 */
export function cronAutorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization");
  const query = req.nextUrl.searchParams.get("secret");
  return header === `Bearer ${segredo}` || query === segredo;
}
