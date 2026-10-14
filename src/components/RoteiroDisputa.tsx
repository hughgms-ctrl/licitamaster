"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, ChevronDown, ExternalLink, ShieldAlert } from "lucide-react";
import { marcarPassoGuia } from "@/app/acoes";
import type { DisputaCompleta } from "@/lib/db";
import type { FichaRow } from "@/lib/ficha";
import { FASES, TOTAL_PASSOS, faseAtual, type GuiaMarcado } from "@/lib/guia";
import { formatarValor } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Checkbox } from "./ui/checkbox";
import { Aviso } from "./ui/aviso";
import AssistenteLance from "./AssistenteLance";

/**
 * O roteiro da disputa dentro da mesa: o piso do cliente sempre à vista, os
 * dados da sessão tirados da ficha do edital e os passos de cada fase para
 * marcar. A fase em que a disputa está abre sozinha.
 */
export default function RoteiroDisputa({ d, ficha }: { d: DisputaCompleta; ficha: FichaRow | null }) {
  const [marcado, setMarcado] = useState<GuiaMarcado>(d.guia ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const atual = faseAtual(d.status);
  const feitos = Object.keys(marcado).length;
  const f = ficha?.ficha;

  async function alternar(chave: string, feito: boolean) {
    setErro(null);
    const antes = marcado;
    setMarcado((x) => {
      const n = { ...x };
      if (feito) n[chave] = new Date().toISOString();
      else delete n[chave];
      return n;
    });
    try {
      const s = await marcarPassoGuia(d.id, chave, feito);
      if (!s.ok) throw new Error(s.mensagem);
    } catch (e) {
      setMarcado(antes);
      setErro((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 rounded-md border bg-background/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-medium">
          <BookOpen className="size-4 text-muted-foreground" />
          Roteiro da disputa
          <span className="num text-xs font-normal text-muted-foreground">
            {feitos} de {TOTAL_PASSOS} passos
          </span>
        </span>
        <Link href="/guia" target="_blank" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Entender cada fase
        </Link>
      </div>

      {d.preco_minimo != null ? (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-0.5">
            <p>
              Nunca dar lance abaixo de{" "}
              <b className="num text-base font-semibold">{formatarValor(d.preco_minimo)}</b>
            </p>
            <p className="text-xs text-muted-foreground">
              Preço mínimo informado pelo cliente
              {d.licitacao.valor_estimado && d.licitacao.valor_estimado > 0
                ? ` · estimado do órgão ${formatarValor(d.licitacao.valor_estimado)}`
                : ""}
            </p>
          </div>
        </div>
      ) : (
        <Aviso tom="alerta">O cliente ainda não informou o preço mínimo. Não dispute sem ele.</Aviso>
      )}

      {f ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Dado rotulo="Sessão" valor={f.sessao.data_hora} />
          <Dado rotulo="Plataforma" valor={f.sessao.plataforma} link={f.sessao.link} />
          <Dado rotulo="Modo de disputa" valor={f.sessao.modo_disputa} />
          <Dado rotulo="Impugnar até" valor={f.prazos.impugnacao} />
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">
          Leia o edital (botão &quot;Ler edital&quot;) para o roteiro mostrar data da sessão, plataforma e modo de disputa.
        </p>
      )}

      {["proposta_enviada", "em_disputa"].includes(d.status) && (
        <AssistenteLance piso={d.preco_minimo} estimado={d.licitacao.valor_estimado} />
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <div className="divide-y overflow-hidden rounded-md border bg-card">
        {FASES.map((fase) => {
          const n = fase.passos.filter((p) => marcado[`${fase.id}.${p.id}`]).length;
          const completa = n === fase.passos.length;
          return (
            <details key={fase.id} open={fase.id === atual} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    completa ? "bg-success" : fase.id === atual ? "bg-primary" : "bg-muted-foreground/40"
                  )}
                />
                <span className={cn("flex-1 font-medium", fase.id === atual && "text-primary dark:text-sidebar-primary")}>
                  {fase.titulo}
                  {fase.id === atual && <span className="ml-2 text-xs font-normal text-muted-foreground">agora</span>}
                </span>
                <span className="num text-xs text-muted-foreground">
                  {n}/{fase.passos.length}
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-1 px-3 pb-3">
                <p className="pb-1 text-xs leading-relaxed text-muted-foreground">{fase.resumo}</p>
                {fase.passos.map((p) => {
                  const chave = `${fase.id}.${p.id}`;
                  const ok = !!marcado[chave];
                  return (
                    <label key={p.id} className="flex cursor-pointer gap-3 rounded-md p-2 hover:bg-accent/50">
                      <Checkbox checked={ok} onCheckedChange={(v) => alternar(chave, v === true)} className="mt-0.5" />
                      <span className="min-w-0 space-y-1">
                        <span className={cn("block font-medium", ok && "text-muted-foreground line-through")}>{p.titulo}</span>
                        {!ok && <span className="block leading-relaxed text-muted-foreground">{p.detalhe}</span>}
                        {!ok && p.cuidado && (
                          <span className="flex items-start gap-1.5 text-xs leading-relaxed text-warning">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            {p.cuidado}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function Dado({ rotulo, valor, link }: { rotulo: string; valor: string | null; link?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">
        {!valor ? (
          "—"
        ) : link ? (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline dark:text-sidebar-primary">
            {valor}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          valor
        )}
      </dd>
    </div>
  );
}
