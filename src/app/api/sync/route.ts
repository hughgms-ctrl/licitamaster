import { NextRequest, NextResponse } from "next/server";
import { executarColeta } from "@/lib/coleta";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";
// A varredura do Brasil inteiro tem centenas de páginas: cada chamada usa
// quase todo o teto da função e grava onde parou.
export const maxDuration = 300;

/**
 * Porta do agendador para a coleta. A lógica vive em @/lib/coleta porque o
 * "Buscar agora" da mesa roda exatamente a mesma coisa.
 */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const saida = await executarColeta({ orcamentoMs: Number(process.env.COLETA_ORCAMENTO_MS ?? 230_000) });
  if (!saida.ok) return NextResponse.json({ erro: saida.erro }, { status: saida.status });
  return NextResponse.json(saida.resumo, { status: saida.status });
}
