import { NextRequest, NextResponse } from "next/server";
import { buscarResultadosPendentes } from "@/lib/resultados-pncp";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Porta do agendador para buscar no PNCP o resultado oficial das licitações encerradas. */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await buscarResultadosPendentes());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
