import { NextRequest, NextResponse } from "next/server";
import { executarColeta } from "@/lib/coleta";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // teto do plano Hobby da Vercel.

/**
 * Porta do cron para a coleta. A lógica toda vive em @/lib/coleta porque o
 * botão "Procurar agora" da tela de filtros roda exatamente a mesma coisa —
 * duplicar o coletor seria garantir que as duas versões divergissem.
 */
export async function GET(req: NextRequest) {
  // Autenticação: o Vercel Cron manda um Bearer com o CRON_SECRET.
  // Chamadas manuais podem usar ?secret= ou o mesmo header.
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const header = req.headers.get("authorization");
    const query = req.nextUrl.searchParams.get("secret");
    if (header !== `Bearer ${segredo}` && query !== segredo) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  }

  const saida = await executarColeta();
  if (!saida.ok) {
    return NextResponse.json({ erro: saida.erro }, { status: saida.status });
  }
  return NextResponse.json(saida.resumo, { status: saida.status });
}
