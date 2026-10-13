import { cn } from "@/lib/utils";

export interface Stat {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  tom?: "sucesso" | "alerta" | "perigo";
}

const COR = { sucesso: "text-success", alerta: "text-warning", perigo: "text-destructive" };

/** Resumo em faixa única com divisórias, em vez de vários cartões soltos. */
export function StatStrip({ itens, className }: { itens: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:flex sm:divide-x [&>*]:border-border",
        className
      )}
    >
      {itens.map((s, i) => (
        <div
          key={s.rotulo}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1 px-4 py-3",
            i % 2 === 1 && "border-l sm:border-l-0",
            i >= 2 && "border-t sm:border-t-0"
          )}
        >
          <span className="truncate text-xs text-muted-foreground">{s.rotulo}</span>
          <span className={cn("num text-xl font-semibold tracking-tight", s.tom && COR[s.tom])}>{s.valor}</span>
          {s.detalhe && <span className="truncate text-xs text-muted-foreground">{s.detalhe}</span>}
        </div>
      ))}
    </div>
  );
}
