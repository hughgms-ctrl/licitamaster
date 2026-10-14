import Link from "next/link";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, type ClienteRow } from "@/lib/db";
import { formatarCnpj } from "@/lib/formato";
import type { DocumentoResumo } from "@/lib/documentos";
import { progressoPreparo } from "@/lib/preparo";
import { ChevronRight, Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/Cabecalho";
import { Aviso } from "@/components/ui/aviso";
import { Vazio } from "@/components/ui/vazio";
import { StatusDot } from "@/components/ui/status-dot";
import { StatStrip } from "@/components/ui/stat-strip";

export const dynamic = "force-dynamic";

export default async function Clientes() {
  await exigirOperadorPagina();
  const supabase = db();
  const [{ data: clientes, error }, { data: disputas }, { data: docs }] = await Promise.all([
    supabase.from("clientes").select("*").order("razao_social"),
    supabase.from("disputas").select("cliente_id, status"),
    supabase
      .from("documentos_cliente")
      .select("id, cliente_id, tipo, descricao, nome_arquivo, validade, emitido_em, enviado_por, created_at")
      .order("created_at", { ascending: false }),
  ]);
  const docsPor = new Map<string, DocumentoResumo[]>();
  for (const d of (docs ?? []) as (DocumentoResumo & { cliente_id: string })[]) {
    docsPor.set(d.cliente_id, [...(docsPor.get(d.cliente_id) ?? []), d]);
  }

  // por cliente: quantas sugestões na mesa, quantas em andamento, quantas ganhas
  const placar = new Map<string, { sugeridas: number; andamento: number; ganhas: number }>();
  for (const d of disputas ?? []) {
    const p = placar.get(d.cliente_id) ?? { sugeridas: 0, andamento: 0, ganhas: 0 };
    if (d.status === "sugerida") p.sugeridas++;
    else if (d.status === "ganhou") p.ganhas++;
    else if (!["descartada", "recusada", "perdeu", "desistiu"].includes(d.status)) p.andamento++;
    placar.set(d.cliente_id, p);
  }

  const lista = (clientes ?? []) as ClienteRow[];
  const total = { sugeridas: 0, andamento: 0, ganhas: 0 };
  for (const p of placar.values()) {
    total.sugeridas += p.sugeridas;
    total.andamento += p.andamento;
    total.ganhas += p.ganhas;
  }

  return (
    <>
      <Cabecalho
        titulo="Clientes"
        sub="As empresas em nome de quem você disputa."
        acoes={
          <Button asChild>
            <Link href="/clientes/novo">
              <Plus />
              Novo cliente
            </Link>
          </Button>
        }
      />
      {lista.length > 0 && (
        <StatStrip
          className="mb-6"
          itens={[
            { rotulo: "Clientes ativos", valor: lista.filter((c) => c.ativo).length, detalhe: `${lista.length} no total` },
            { rotulo: "Na triagem", valor: total.sugeridas },
            { rotulo: "Em andamento", valor: total.andamento },
            { rotulo: "Ganhas", valor: total.ganhas, tom: "sucesso" },
          ]}
        />
      )}
      <section className="space-y-3">
          {error && <Aviso tom="erro">{error.message}</Aviso>}
          {lista.length === 0 ? (
            <Vazio icone={Building2} titulo="Cadastre o primeiro cliente.">
              <p>
                Depois do cadastro, monte o perfil de busca dele. É o perfil que diz à coleta quais
                licitações procurar.
              </p>
              <Button asChild size="sm">
                <Link href="/clientes/novo">
                  <Plus />
                  Cadastrar cliente
                </Link>
              </Button>
            </Vazio>
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border bg-card">
              {lista.map((c) => {
                const p = placar.get(c.id) ?? { sugeridas: 0, andamento: 0, ganhas: 0 };
                const prep = progressoPreparo(c.preparo, docsPor.get(c.id) ?? []);
                return (
                  <Link
                    key={c.id}
                    href={`/clientes/${c.id}`}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                      {(c.nome_fantasia || c.razao_social).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{c.nome_fantasia || c.razao_social}</span>
                        {!c.ativo && <StatusDot tom="neutro">Desligado</StatusDot>}
                        {c.ativo && !prep.pronto && (
                          <StatusDot tom={prep.aConferir ? "alerta" : "perigo"}>
                            Preparação {prep.prontos}/{prep.total}
                          </StatusDot>
                        )}
                      </span>
                      <span className="num block truncate text-xs text-muted-foreground">
                        {c.porte}, CNPJ {formatarCnpj(c.cnpj)}
                      </span>
                    </span>
                    <span className="hidden items-center gap-5 text-xs text-muted-foreground md:flex">
                      <span>
                        <b className="num font-semibold text-foreground">{p.sugeridas}</b> na triagem
                      </span>
                      <span>
                        <b className="num font-semibold text-foreground">{p.andamento}</b> em andamento
                      </span>
                      <span>
                        <b className="num font-semibold text-success">{p.ganhas}</b> ganhas
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>
          )}
      </section>
    </>
  );
}
