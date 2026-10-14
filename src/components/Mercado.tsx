import { Target, Users } from "lucide-react";
import type { Chance, Concorrente } from "@/lib/preco";
import { cn } from "@/lib/utils";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

const COR = {
  alta: "text-success",
  media: "text-warning",
  baixa: "text-destructive",
  poucos_dados: "text-muted-foreground",
} as const;

const BARRA = {
  alta: "bg-success",
  media: "bg-warning",
  baixa: "bg-destructive",
  poucos_dados: "bg-muted-foreground/40",
} as const;

const ROTULO = { alta: "Alta", media: "Média", baixa: "Baixa", poucos_dados: "Poucos dados" } as const;

/** Chance de ganhar com um preço, medida contra quem venceu licitações parecidas. */
export function ChanceGanhar({ chance, rotulo = "Chance de ganhar", className }: { chance: Chance; rotulo?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5 rounded-md border p-3 text-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium">
          <Target className="size-4 text-muted-foreground" />
          {rotulo}
        </span>
        <b className={cn("font-semibold", COR[chance.nivel])}>{ROTULO[chance.nivel]}</b>
      </div>
      {chance.fracao != null ? (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full", BARRA[chance.nivel])} style={{ width: `${Math.max(4, chance.fracao * 100)}%` }} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Com esse preço, você teria ficado igual ou abaixo do vencedor em {pct(chance.fracao)} das {chance.n} licitações
            parecidas. Documentação em dia e os concorrentes do dia decidem o resto.
          </p>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Ainda há poucas licitações parecidas com resultado para medir. A base cresce todo dia.
        </p>
      )}
    </div>
  );
}

/** Quem mais ganha licitações parecidas. Dados oficiais do PNCP e lances registrados. */
export function Concorrentes({ lista, className }: { lista: Concorrente[]; className?: string }) {
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      <p className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Users className="size-3.5" />
        Quem costuma ganhar licitações assim
      </p>
      <ul className="divide-y overflow-hidden rounded-md border bg-card">
        {lista.map((c) => (
          <li key={`${c.nome}-${c.cnpj ?? ""}`} className="space-y-0.5 px-3 py-2">
            <p className="font-medium leading-snug">{c.nome}</p>
            <p className="num flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              {c.cnpj && <span>{formatarCnpj(c.cnpj)}</span>}
              <span>
                {c.vitorias} {c.vitorias === 1 ? "vitória" : "vitórias"}, em média {pct(c.descontoMedio)} abaixo do estimado
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatarCnpj(c: string) {
  const d = c.replace(/\D/g, "");
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : c;
}
