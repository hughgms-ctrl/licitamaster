import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { operadorAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recebe os blocos de tempo que o navegador mediu (componente Cronometro).
 * Vem por sendBeacon também ao fechar a aba, por isso aceita texto puro.
 */
export async function POST(req: NextRequest) {
  const op = await operadorAtual();
  if (!op) return NextResponse.json({ erro: "sem acesso" }, { status: 401 });

  let corpo: { disputa_id?: unknown; segundos?: unknown };
  try {
    corpo = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const segundos = Math.round(Number(corpo.segundos));
  if (!Number.isFinite(segundos) || segundos < 5) return NextResponse.json({ ok: true });
  const disputaId = typeof corpo.disputa_id === "string" && UUID.test(corpo.disputa_id) ? corpo.disputa_id : null;

  const supabase = db();
  let clienteId: string | null = null;
  if (disputaId) {
    const { data } = await supabase.from("disputas").select("cliente_id").eq("id", disputaId).maybeSingle();
    clienteId = (data?.cliente_id as string | undefined) ?? null;
  }
  // Sem a tabela (migração ainda não rodada), o tempo se perde em silêncio.
  await supabase.from("tempo_trabalho").insert({
    operador: op.email,
    disputa_id: disputaId,
    cliente_id: clienteId,
    segundos: Math.min(segundos, 900),
  });
  return NextResponse.json({ ok: true });
}
