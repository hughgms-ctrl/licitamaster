import { cn } from "@/lib/utils";

/** Título da página dentro da mesa, com ações à direita. */
export function Cabecalho({
  titulo,
  sub,
  acoes,
  antes,
  className,
}: {
  titulo: React.ReactNode;
  sub?: React.ReactNode;
  acoes?: React.ReactNode;
  antes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {antes}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
        {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </div>
  );
}
