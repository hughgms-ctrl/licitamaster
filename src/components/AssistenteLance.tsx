"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { lerReais } from "@/lib/resultado";
import { brl } from "@/lib/proposta";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Aviso } from "./ui/aviso";

const PASSOS = [0.003, 0.005, 0.01, 0.02];

/**
 * Calculadora para usar durante a sessão, ao lado do portal: digite o melhor
 * lance da sala e ela mostra os próximos lances possíveis, quanto falta até o
 * piso do cliente e quando parar. Não dá lance nenhum: quem decide é você.
 */
export default function AssistenteLance({
  piso: pisoTotal,
  estimado: estimadoTotal,
  lotes,
}: {
  piso: number | null;
  estimado: number | null;
  /** com lotes, cada um tem o seu piso: a calculadora trabalha no lote escolhido */
  lotes?: { chave: string; rotulo: string; valor_estimado: number | null; preco_minimo: number }[] | null;
}) {
  const [loteAtual, setLoteAtual] = useState(lotes?.[0]?.chave ?? "");
  const lote = lotes?.find((x) => x.chave === loteAtual);
  const piso = lote ? lote.preco_minimo : pisoTotal;
  const estimado = lote ? lote.valor_estimado : estimadoTotal;
  const [melhor, setMelhor] = useState("");
  const [nosso, setNosso] = useState("");
  const m = lerReais(melhor);
  const n = lerReais(nosso);
  const arred = (v: number) => Math.floor(v * 100) / 100;

  const opcoes = m
    ? PASSOS.map((p) => {
        const v = arred(m * (1 - p));
        return { p, v, abaixoDoPiso: piso != null && v < piso };
      })
    : [];
  const folga = m && piso ? m - piso : null;
  const naFrente = m && n ? n <= m : false;

  return (
    <div className="space-y-3 rounded-md border bg-card p-3">
      <span className="inline-flex items-center gap-2 font-medium">
        <Calculator className="size-4 text-muted-foreground" />
        Calculadora de lance
      </span>
      {lotes && lotes.length > 1 && (
        <label className="block space-y-1 text-xs text-muted-foreground">
          <span>Lote em disputa agora</span>
          <NativeSelect
            value={loteAtual}
            onChange={(e) => {
              setLoteAtual(e.target.value);
              setMelhor("");
              setNosso("");
            }}
          >
            {lotes.map((x) => (
              <option key={x.chave} value={x.chave}>
                {x.rotulo}: piso {brl(x.preco_minimo)}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Melhor lance da sala agora</span>
          <Input className="num h-9 text-base" inputMode="decimal" placeholder="ex: 195.000,00" value={melhor} onChange={(e) => setMelhor(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Nosso último lance (opcional)</span>
          <Input className="num h-9 text-base" inputMode="decimal" placeholder="ex: 196.500,00" value={nosso} onChange={(e) => setNosso(e.target.value)} />
        </label>
      </div>

      {m && (
        <>
          {naFrente ? (
            <Aviso tom="sucesso">O cliente está na frente. Espere: lance contra você mesmo só baixa o preço.</Aviso>
          ) : folga != null && folga <= 0 ? (
            <Aviso tom="erro">
              O melhor lance já está no piso do cliente ou abaixo ({brl(piso!)}). Pare aqui: ganhar abaixo do piso é
              ganhar no prejuízo.
            </Aviso>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              {opcoes.map((o) => (
                <div
                  key={o.p}
                  className={cn(
                    "rounded-md border p-2 text-center",
                    o.abaixoDoPiso ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-background/40"
                  )}
                >
                  <p className="text-xs text-muted-foreground">−{(o.p * 100).toLocaleString("pt-BR")}%</p>
                  <p className="num font-semibold">{brl(o.v)}</p>
                  {o.abaixoDoPiso && <p className="text-xs">abaixo do piso</p>}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {folga != null && folga > 0 && <>Falta {brl(folga)} até o piso. </>}
            {estimado && <>O melhor lance está {((1 - m / estimado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% abaixo do estimado. </>}
            Confira o valor antes de enviar: lance com zero a mais ou a menos vale do mesmo jeito.
          </p>
        </>
      )}
    </div>
  );
}
