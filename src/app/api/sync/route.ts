import { NextRequest, NextResponse } from "next/server";
import { executarColeta } from "@/lib/coleta";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Porta do agendador para a coleta. A lógica vive em @/lib/coleta porque o
 * "Buscar agora" da mesa roda exatamente a mesma coisa.
 */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const saida = await executarColeta();
  if (!saida.ok) return NextResponse.json({ erro: saida.erro }, { status: saida.status });
  return NextResponse.json(saida.resumo, { status: saida.status });
}
