"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingDown } from "lucide-react";
import { referenciaPreco } from "@/app/acoes";
import type { DisputaCompleta } from "@/lib/db";
import { chanceDeGanhar, type AnalisePreco } from "@/lib/preco";
import { Concorrentes, ChanceGanhar } from "./Mercado";
import { brl } from "@/lib/proposta";
import { cn } from "@/lib/utils";
import { Aviso } from "./ui/aviso";
import { StatusDot } from "./ui/status-dot";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Preço de referência: em licitações parecidas, quanto abaixo do estimado o
 * vencedor fechou. Compara com o piso do cliente para dizer se dá para ganhar.
 */
export default function PrecoReferencia({ d }: { d: DisputaCompleta }) {
  const [a, setA] = useState<AnalisePreco | null>(null);
  const [base, setBase] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const estimado = d.licitacao.valor_estimado;
  const piso = d.preco_minimo;

  useEffect(() => {
    let vivo = true;
    referenciaPreco(d.id)
      .then((s) => {
        if (!vivo) return;
        if (s.ok && s.analise) {
          setA(s.analise);
          setBase(s.base ?? 0);
        } else setErro(s.mensagem);
      })
      .catch((e) => vivo && setErro((e as Error).message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [d.id]);

  const alvo = a?.mediana != null && estimado ? estimado * (1 - a.mediana) : null;
  const faixa = a?.p25 != null && a?.p75 != null && estimado ? [estimado * (1 - a.p75), estimado * (1 - a.p25)] : null;
  const pisoDesconto = piso && estimado ? 1 - piso / estimado : null;

  return (
    <div className="space-y-4 rounded-md border bg-background/40 p-4 text-sm">
      <span className="inline-flex items-center gap-2 font-medium">
        <TrendingDown className="size-4 text-muted-foreground" />
        Preço de referência
      </span>

      {carregando ? (
        <p className="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Procurando licitações parecidas…
        </p>
      ) : erro ? (
        <Aviso tom="erro">{erro}</Aviso>
      ) : !a || a.n === 0 ? (
        <p className="leading-relaxed text-muted-foreground">
          Ainda não há licitações parecidas com resultado na base ({base} resultados no total). A base cresce sozinha
          todo dia com os resultados oficiais do PNCP e com os lances que você registra.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-muted/50 p-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Desconto típico do vencedor</dt>
              <dd className="num font-semibold">{a.mediana != null ? pct(a.mediana) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Faixa comum</dt>
              <dd className="num font-semibold">{a.p25 != null && a.p75 != null ? `${pct(a.p25)} a ${pct(a.p75)}` : "poucos dados"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lance que costuma ganhar</dt>
              <dd className="num font-semibold">{alvo ? brl(alvo) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Base</dt>
              <dd className="num font-semibold">
                {a.n} parecida{a.n === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>

          {piso && alvo && (
            <Aviso tom={piso <= alvo ? "sucesso" : faixa && piso <= faixa[1] ? "alerta" : "erro"}>
              {piso <= alvo
                ? `O piso do cliente (${brl(piso)}, ${pct(pisoDesconto!)} abaixo do estimado) está abaixo do lance que costuma ganhar. Boa chance, se a habilitação estiver em dia.`
                : faixa && piso <= faixa[1]
                  ? `O piso do cliente (${brl(piso)}) fica dentro da faixa comum, mas acima do típico. Dá para disputar, com chance média.`
                  : `O piso do cliente (${brl(piso)}, ${pisoDesconto != null ? pct(pisoDesconto) : "—"} abaixo do estimado) está acima do que costuma ganhar. Chance baixa: vale conversar com o cliente sobre o custo.`}
            </Aviso>
          )}
          {a.n < 5 && <p className="text-xs text-muted-foreground">Poucas referências: use como sinal, não como regra.</p>}

          {piso && estimado && <ChanceGanhar chance={chanceDeGanhar(piso, estimado, a.razoes)} rotulo="Chance com o preço mínimo atual" />}

          {a.concorrentes.length > 0 && <Concorrentes lista={a.concorrentes} />}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">As mais parecidas</p>
            <ul className="divide-y overflow-hidden rounded-md border bg-card">
              {a.semelhantes.slice(0, 6).map((s, i) => (
                <li key={i} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1">{s.objeto}</span>
                    <span className="text-xs text-muted-foreground">
                      {[s.orgao, s.uf].filter(Boolean).join(" · ")} · {s.fonte === "nossa" ? "nosso registro" : "resultado oficial"}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    {brl(s.vencedor)} de {brl(s.estimado)}
                  </span>
                  <StatusDot tom={s.desconto > 0.25 ? "alerta" : "neutro"} className={cn("shrink-0")}>
                    {pct(s.desconto)} abaixo
                  </StatusDot>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
