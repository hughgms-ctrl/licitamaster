import { NextRequest, NextResponse } from "next/server";
import { rodarAutomacao } from "@/lib/automacao";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";
// Leitura de edital pode levar minutos; a rodada para antes do teto.
export const maxDuration = 300;

/**
 * Porta do agendador para a análise automática: lê o edital das aprovadas e
 * faz a análise rápida das melhores da triagem. Não envia nada ao cliente.
 */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await rodarAutomacao());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
