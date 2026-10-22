import Link from "next/link";
import { Bot, Clock } from "lucide-react";
import { exigirOperadorPagina } from "@/lib/auth";
import { db } from "@/lib/db";
import { limparObjeto } from "@/lib/formato";
import { calcularMetricas, formatarMinutos, type EventoLinha, type FechadaLinha, type TempoLinha } from "@/lib/metricas";
import { Cabecalho } from "@/components/Cabecalho";
import { StatStrip } from "@/components/ui/stat-strip";
import { Aviso } from "@/components/ui/aviso";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Métricas · Licitação Master" };

const PERIODOS = [7, 30, 90] as const;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** O Supabase devolve no máximo 1000 linhas por vez: busca de página em página. */
async function todas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maximo = 20_000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const linhas: T[] = [];
  for (let de = 0; de < maximo; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) return { data: linhas, error };
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: linhas, error: null };
}

export default async function PaginaMetricas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await exigirOperadorPagina();
  const { dias: p } = await searchParams;
  const dias = PERIODOS.find((d) => String(d) === p) ?? 30;
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const supabase = db();

  const [{ data: eventos }, { data: tempos, error: erroTempo }, { data: fechadas }] = await Promise.all([
    todas<EventoLinha>((de, ate) =>
      supabase
        .from("eventos")
        .select("disputa_id, ator, tipo, dados, created_at")
        .gte("created_at", desde)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    // a tabela pode não existir ainda: sem ela, as métricas de tempo ficam vazias
    todas<TempoLinha>((de, ate) =>
      supabase
        .from("tempo_trabalho")
        .select("operador, disputa_id, segundos")
        .gte("created_at", desde)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    supabase
      .from("disputas")
      .select("id, status, cliente_id, cliente:clientes(*)")
      .in("status", ["ganhou", "perdeu"])
      .gte("updated_at", desde)
      .limit(1000),
  ]);

  const linhasTempo = tempos;
  const segundosPorDisputa = new Map<string, number>();
  for (const t of linhasTempo) {
    if (t.disputa_id) segundosPorDisputa.set(t.disputa_id, (segundosPorDisputa.get(t.disputa_id) ?? 0) + t.segundos);
  }

  const fechadasBrutas = (fechadas ?? []) as unknown as {
    id: string;
    status: "ganhou" | "perdeu";
    cliente_id: string;
    cliente: { percentual_exito?: number | null } | null;
  }[];
  const idsGanhas = fechadasBrutas.filter((f) => f.status === "ganhou").map((f) => f.id);
  const [{ data: contratos }, { data: resultados }] = idsGanhas.length
    ? await Promise.all([
        supabase.from("contratos_disputa").select("disputa_id, valor_contratado").in("disputa_id", idsGanhas),
        supabase.from("resultados_disputa").select("disputa_id, nosso_lance").in("disputa_id", idsGanhas),
      ])
    : [{ data: [] }, { data: [] }];
  const contratado = new Map((contratos ?? []).map((c) => [c.disputa_id as string, c.valor_contratado as number | null]));
  const lance = new Map((resultados ?? []).map((r) => [r.disputa_id as string, r.nosso_lance as number | null]));

  const linhasFechadas: FechadaLinha[] = fechadasBrutas.map((f) => ({
    id: f.id,
    status: f.status,
    cliente_id: f.cliente_id,
    valor: Number(contratado.get(f.id) ?? lance.get(f.id) ?? 0) || null,
    percentualExito: f.cliente?.percentual_exito ?? null,
    minutos: Math.round((segundosPorDisputa.get(f.id) ?? 0) / 60),
  }));

  const m = calcularMetricas(eventos, linhasTempo, linhasFechadas);

  // As licitações que mais tomaram tempo da equipe no período.
  const topIds = [...segundosPorDisputa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const { data: topDisputas } = topIds.length
    ? await supabase
        .from("disputas")
        .select("id, status, licitacao:licitacoes(objeto), cliente:clientes(razao_social, nome_fantasia)")
        .in(
          "id",
          topIds.map(([id]) => id)
        )
    : { data: [] };
  const porId = new Map(
    ((topDisputas ?? []) as unknown as {
      id: string;
      status: string;
      licitacao: { objeto: string | null } | null;
      cliente: { razao_social: string; nome_fantasia: string | null } | null;
    }[]).map((d) => [d.id, d])
  );

  return (
    <>
      <Cabecalho
        titulo="Métricas"
        sub="Quanto tempo de gente cada licitação consome, quem faz o quê e o que a operação ganha."
        acoes={
          <nav aria-label="Período" className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
            {PERIODOS.map((d) => (
              <Link
                key={d}
                href={`/metricas?dias=${d}`}
                aria-current={d === dias ? "page" : undefined}
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
                  d === dias && "bg-card text-foreground shadow-sm dark:bg-accent dark:shadow-none"
                )}
              >
                {d} dias
              </Link>
            ))}
          </nav>
        }
      />

      {erroTempo && (
        <Aviso tom="alerta" titulo="O tempo ainda não está sendo medido." className="mb-6">
          Rode a migração <code>20261022120000_tempo_trabalho.sql</code> no SQL Editor do Supabase. A partir daí a mesa
          mede sozinha o tempo de cada pessoa em cada licitação.
        </Aviso>
      )}

      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Resultado</h2>
          <StatStrip
            itens={[
              {
                rotulo: "Taxa de vitória",
                valor: pct(m.taxaVitoria),
                detalhe: `${m.ganhas} ganhas, ${m.perdidas} perdidas`,
                tom: m.taxaVitoria != null && m.taxaVitoria >= 0.3 ? "sucesso" : undefined,
              },
              { rotulo: "Valor ganho", valor: brl(m.valorGanho), detalhe: "contratado ou nosso lance" },
              { rotulo: "Êxito a receber", valor: brl(m.exitoPrevisto), detalhe: "% de êxito sobre o ganho" },
              {
                rotulo: "Clientes aprovaram",
                valor: m.enviadas ? pct(m.aprovadas / m.enviadas) : "—",
                detalhe: `${m.aprovadas} de ${m.enviadas} enviadas`,
              },
            ]}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Tempo da equipe</h2>
          <StatStrip
            itens={[
              { rotulo: "Tempo total", valor: formatarMinutos(m.minutosTotal), detalhe: "medido sozinho" },
              {
                rotulo: "Por licitação",
                valor: formatarMinutos(m.minutosPorDisputa),
                detalhe: `média de ${m.disputasComTempo} trabalhadas`,
              },
              { rotulo: "Por licitação ganha", valor: formatarMinutos(m.minutosPorGanha) },
              {
                rotulo: "Feito pela IA sozinha",
                valor: pct(m.fracaoAutomatica),
                detalhe: `${m.analisesAutomaticas} análises, ${m.editaisAutomaticos} editais`,
              },
            ]}
          />
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Clock className="mt-0.5 size-3.5 shrink-0" />
            Conta só o tempo com a mesa aberta e a pessoa mexendo nela; parado por mais de 2 minutos não conta. O tempo na
            página de uma licitação vai para ela; o resto (triagem, clientes) entra só no total.
          </p>
        </section>

        <div className="grid gap-8 xl:grid-cols-2">
          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">Por pessoa</h2>
            {m.porOperador.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém da equipe agiu neste período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Pessoa</th>
                      <th className="px-4 py-2 text-right font-medium">Tempo</th>
                      <th className="px-4 py-2 text-right font-medium">Licitações</th>
                      <th className="px-4 py-2 text-right font-medium">Enviadas</th>
                      <th className="px-4 py-2 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="num divide-y">
                    {m.porOperador.map((o) => (
                      <tr key={o.operador}>
                        <td className="max-w-[16rem] truncate px-4 py-2 font-sans">{o.operador}</td>
                        <td className="px-4 py-2 text-right">{formatarMinutos(o.minutos)}</td>
                        <td className="px-4 py-2 text-right">{o.disputas}</td>
                        <td className="px-4 py-2 text-right">{o.enviadas}</td>
                        <td className="px-4 py-2 text-right">{o.acoes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Bot className="mt-0.5 size-3.5 shrink-0" />
              Licitações conta as que a pessoa mexeu (enviou, mudou de etapa, analisou, registrou lance).
            </p>
          </section>

          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">Onde o tempo foi</h2>
            {topIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum tempo medido em licitações neste período.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
                {topIds.map(([id, seg]) => {
                  const d = porId.get(id);
                  return (
                    <li key={id}>
                      <Link href={`/disputas/${id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-muted-foreground">
                            {d?.cliente?.nome_fantasia || d?.cliente?.razao_social || "—"}
                          </span>
                          <span className="block truncate font-medium">{limparObjeto(d?.licitacao?.objeto ?? "")}</span>
                        </span>
                        <span className="num shrink-0 text-muted-foreground">{formatarMinutos(Math.round(seg / 60))}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
