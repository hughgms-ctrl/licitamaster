import { NextRequest, NextResponse } from "next/server";
import { enviarResumo } from "@/lib/resumo";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Porta do agendador para o resumo de sugestões novas no WhatsApp. */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await enviarResumo());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
