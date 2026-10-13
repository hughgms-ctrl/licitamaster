import { cn } from "@/lib/utils";

export type Tom = "neutro" | "primario" | "sucesso" | "alerta" | "perigo" | "info";

const COR: Record<Tom, string> = {
  neutro: "bg-muted-foreground/50",
  primario: "bg-primary",
  sucesso: "bg-success",
  alerta: "bg-warning",
  perigo: "bg-destructive",
  info: "bg-info",
};

/** Estado = ponto + rótulo. A cor nunca carrega a informação sozinha. */
export function StatusDot({
  tom = "neutro",
  children,
  className,
  pulsar,
}: {
  tom?: Tom;
  children: React.ReactNode;
  className?: string;
  pulsar?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <span className="relative flex size-1.5 shrink-0">
        {pulsar && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", COR[tom])} />}
        <span className={cn("relative inline-flex size-1.5 rounded-full", COR[tom])} />
      </span>
      <span className="text-foreground/85">{children}</span>
    </span>
  );
}
