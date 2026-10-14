"use client";

import { useState } from "react";
import { Calculator, Check } from "lucide-react";
import { calcularPrecoMinimo, type EntradaPreco } from "@/lib/preco-minimo";
import { lerReais } from "@/lib/resultado";
import { brl } from "@/lib/proposta";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Aviso } from "./ui/aviso";

const pct = (x: number) => `${x.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const lerPct = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Calculadora do preço mínimo, com imposto e taxas "por dentro" (sobre o
 * preço de venda). Serve ao operador na página da licitação e ao cliente no
 * portal; `usar` devolve o valor para quem chamou.
 */
export default function CalculadoraPreco({
  estimado,
  assessoriaPct,
  usar,
  rotuloUsar = "Usar como preço mínimo",
  className,
}: {
  estimado: number | null;
  /** taxa de êxito da assessoria, já preenchida quando se sabe */
  assessoriaPct?: number | null;
  usar?: (valor: number) => void;
  rotuloUsar?: string;
  className?: string;
}) {
  const [custo, setCusto] = useState("");
  const [frete, setFrete] = useState("");
  const [outros, setOutros] = useState("");
  const [impostos, setImpostos] = useState("");
  const [assessoria, setAssessoria] = useState(assessoriaPct != null ? String(assessoriaPct).replace(".", ",") : "");
  const [despesas, setDespesas] = useState("");
  const [lucroTipo, setLucroTipo] = useState<"pct" | "reais">("pct");
  const [lucro, setLucro] = useState("");
  const [usado, setUsado] = useState(false);

  const entrada: EntradaPreco = {
    custo: lerReais(custo) ?? 0,
    frete: lerReais(frete) ?? 0,
    outros: lerReais(outros) ?? 0,
    impostosPct: lerPct(impostos),
    assessoriaPct: lerPct(assessoria),
    despesasPct: lerPct(despesas),
    lucro: { tipo: lucroTipo, valor: lucroTipo === "pct" ? lerPct(lucro) : (lerReais(lucro) ?? 0) },
  };
  const r = calcularPrecoMinimo(entrada);
  const doEstimado = r && estimado && estimado > 0 ? r.preco / estimado : null;

  const partes = r
    ? [
        { rotulo: "Custos", valor: r.custos, cor: "bg-muted-foreground/50" },
        { rotulo: "Impostos", valor: r.impostos, cor: "bg-warning" },
        { rotulo: "Assessoria", valor: r.assessoria, cor: "bg-info" },
        { rotulo: "Outras despesas", valor: r.despesas, cor: "bg-muted-foreground/30" },
        { rotulo: "Lucro", valor: r.lucro, cor: "bg-success" },
      ].filter((p) => p.valor > 0)
    : [];

  return (
    <div className={cn("space-y-4 text-sm", className)}>
      <div className="space-y-1">
        <span className="inline-flex items-center gap-2 font-medium">
          <Calculator className="size-4 text-muted-foreground" />
          Calculadora do preço mínimo
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Valores para a licitação inteira. Impostos e taxas são calculados sobre o preço de venda, como o governo
          paga de verdade.
        </p>
      </div>

      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
        <CampoNum rotulo="Custo do produto ou serviço" dica="fornecedor, material, mão de obra" valor={custo} mudar={setCusto} prefixo="R$" />
        <CampoNum rotulo="Frete e entrega" valor={frete} mudar={setFrete} prefixo="R$" />
        <CampoNum rotulo="Outros custos" dica="amostra, garantia, viagens" valor={outros} mudar={setOutros} prefixo="R$" />
        <CampoNum rotulo="Impostos sobre a venda" dica="Simples, por exemplo: 4% a 15%" valor={impostos} mudar={setImpostos} sufixo="%" />
        <CampoNum rotulo="Taxa da assessoria" dica="sobre o valor ganho" valor={assessoria} mudar={setAssessoria} sufixo="%" />
        <CampoNum rotulo="Outras despesas sobre a venda" dica="prazo de pagamento, comissões" valor={despesas} mudar={setDespesas} sufixo="%" />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Lucro que quer garantir</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1" role="radiogroup" aria-label="Tipo de lucro">
            {(
              [
                ["pct", "% da venda"],
                ["reais", "R$ fixos"],
              ] as const
            ).map(([v, rot]) => (
              <button
                key={v}
                role="radio"
                aria-checked={lucroTipo === v}
                onClick={() => setLucroTipo(v)}
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
                  lucroTipo === v && "bg-card text-foreground shadow-sm dark:bg-accent dark:shadow-none"
                )}
              >
                {rot}
              </button>
            ))}
          </div>
          <div className="w-40">
            <Num
              valor={lucro}
              mudar={setLucro}
              prefixo={lucroTipo === "reais" ? "R$" : undefined}
              sufixo={lucroTipo === "pct" ? "%" : undefined}
              rotulo="Lucro"
            />
          </div>
        </div>
      </div>

      {r ? (
        <div className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Preço mínimo</p>
              <p className="num text-2xl font-semibold tracking-tight">{brl(r.preco)}</p>
              {doEstimado != null && (
                <p className="num text-xs text-muted-foreground">{pct(doEstimado * 100)} do valor estimado pelo órgão</p>
              )}
            </div>
            {usar && (
              <Button
                size="sm"
                onClick={() => {
                  usar(r.preco);
                  setUsado(true);
                }}
              >
                {usado ? <Check /> : null}
                {rotuloUsar}
              </Button>
            )}
          </div>

          <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
            {partes.map((p) => (
              <span key={p.rotulo} className={p.cor} style={{ width: `${(p.valor / r.preco) * 100}%` }} />
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5">
            {partes.map((p) => (
              <div key={p.rotulo}>
                <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-2 rounded-full", p.cor)} />
                  {p.rotulo}
                </dt>
                <dd className="num font-medium">{brl(p.valor)}</dd>
              </div>
            ))}
          </dl>

          {doEstimado != null && doEstimado > 1 && (
            <Aviso tom="erro">
              Acima do valor estimado pelo órgão. O pregoeiro não aceita proposta acima do preço máximo: assim não dá
              para disputar.
            </Aviso>
          )}
          {doEstimado != null && doEstimado < 0.75 && (
            <Aviso tom="alerta">
              Menos de 75% do estimado. O pregoeiro pode achar que não dá para cumprir (inexequível) e pedir prova:
              guarde as cotações do fornecedor.
            </Aviso>
          )}
        </div>
      ) : (
        entrada.impostosPct + entrada.assessoriaPct + entrada.despesasPct + (lucroTipo === "pct" ? entrada.lucro.valor : 0) >= 100 ? (
          <Aviso tom="erro">Os percentuais somam 100% ou mais. Não existe preço que feche essa conta.</Aviso>
        ) : (
          <p className="text-xs text-muted-foreground">Preencha o custo para ver o preço mínimo.</p>
        )
      )}
    </div>
  );
}

function CampoNum({
  rotulo,
  dica,
  ...p
}: { rotulo: string; dica?: string } & Parameters<typeof Num>[0]) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{rotulo}</span>
      <Num rotulo={rotulo} {...p} />
      {dica && <span className="block text-[0.6875rem] text-muted-foreground/80">{dica}</span>}
    </label>
  );
}

function Num({
  valor,
  mudar,
  prefixo,
  sufixo,
  rotulo,
}: {
  valor: string;
  mudar: (v: string) => void;
  prefixo?: string;
  sufixo?: string;
  rotulo: string;
}) {
  return (
    <div className="relative">
      {prefixo && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefixo}</span>
      )}
      <Input
        aria-label={rotulo}
        inputMode="decimal"
        className={cn("num", prefixo && "pl-8", sufixo && "pr-7")}
        placeholder="0"
        value={valor}
        onChange={(e) => mudar(e.target.value)}
      />
      {sufixo && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{sufixo}</span>
      )}
    </div>
  );
}
