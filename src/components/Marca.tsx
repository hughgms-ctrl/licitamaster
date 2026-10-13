import { cn } from "@/lib/utils";

/** Marca: um carimbo de protocolo, o gesto que encerra toda etapa de licitação. */
export function Selo({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 1.4" />
      <path d="M8.2 12.3l2.5 2.5 5-5.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Marca({ className, sub }: { className?: string; sub?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Selo className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">Licitação Master</span>
        {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}
