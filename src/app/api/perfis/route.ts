import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FILTROS_PRONTOS, materializar } from "@/lib/filtros-prontos";

export const dynamic = "force-dynamic";

/** Lista os perfis de um cliente, do mais antigo para o mais novo. */
export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente_id");
  if (!clienteId) return NextResponse.json({ erro: "informe cliente_id" }, { status: 400 });
  const { data, error } = await db()
    .from("perfis")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("created_at");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Salva um perfil inteiro (cria se não tiver id). */
export async function PUT(req: NextRequest) {
  const body = await req.json();

  const erro = validar(body);
  if (erro) return NextResponse.json({ erro }, { status: 400 });

  const { data, error } = await db().from("perfis").upsert(body).select("*").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * Semeia os modelos prontos (de TI) para um cliente por tipo de serviço. Idempotente: pula os que
 * já existem com o mesmo nome, então dá pra chamar de novo depois sem
 * duplicar nem sobrescrever o que você já ajustou à mão.
 */
export async function POST(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente_id");
  if (!clienteId) return NextResponse.json({ erro: "informe cliente_id" }, { status: 400 });
  const supabase = db();

  const { data: existentes, error: erroLer } = await supabase
    .from("perfis")
    .select("nome")
    .eq("cliente_id", clienteId);
  if (erroLer) return NextResponse.json({ erro: erroLer.message }, { status: 500 });

  const jaTem = new Set((existentes ?? []).map((p) => (p.nome as string).toLowerCase()));
  const novos = FILTROS_PRONTOS.filter((f) => !jaTem.has(f.nome.toLowerCase()))
    .map((f) => ({ ...materializar(f), cliente_id: clienteId }));

  if (novos.length === 0) {
    return NextResponse.json({ criados: 0, pulados: FILTROS_PRONTOS.length });
  }

  const { data, error } = await supabase.from("perfis").insert(novos).select("*");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({
    criados: data?.length ?? 0,
    pulados: FILTROS_PRONTOS.length - novos.length,
    perfis: data,
  });
}

/**
 * Apaga um perfil. As disputas que ele já marcou continuam no banco —
 * o `perfil_id` delas vira null (on delete set null no schema), então você
 * não perde histórico por desistir de um filtro.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "informe o id do filtro" }, { status: 400 });

  const { error } = await db().from("perfis").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Barra o que o banco aceitaria mas quebraria a pontuação depois. */
function validar(p: Record<string, unknown>): string | null {
  if (!p || typeof p !== "object") return "corpo inválido";
  if (typeof p.cliente_id !== "string" || !p.cliente_id) return "o perfil precisa de um cliente";
  if (typeof p.nome !== "string" || !p.nome.trim()) return "o perfil precisa de um nome";

  if (!Array.isArray(p.termos_positivos) || p.termos_positivos.length === 0) {
    return "um filtro sem termo positivo nunca casaria nada";
  }
  for (const t of p.termos_positivos as { termo?: unknown; peso?: unknown }[]) {
    if (typeof t?.termo !== "string" || !t.termo.trim()) return "há termo positivo em branco";
    if (typeof t?.peso !== "number" || !Number.isFinite(t.peso)) {
      return `o termo "${t.termo}" está sem peso numérico`;
    }
  }

  const min = Number(p.score_minimo);
  const alerta = Number(p.score_alerta);
  if (!Number.isFinite(min) || min < 0) return "score mínimo inválido";
  if (!Number.isFinite(alerta) || alerta < 0) return "score de alerta inválido";
  if (alerta < min) {
    return "o score de alerta não pode ser menor que o mínimo — alertaria o que nem entra no radar";
  }

  return null;
}
