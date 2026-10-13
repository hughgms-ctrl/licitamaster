import { cn } from "@/lib/utils";

export function Vazio({
  icone: Icone,
  titulo,
  children,
  className,
}: {
  icone?: React.ComponentType<{ className?: string }>;
  titulo: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center",
        className
      )}
    >
      {Icone && (
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Icone className="size-5 text-muted-foreground" />
        </div>
      )}
      <p className="font-medium">{titulo}</p>
      {children && <div className="max-w-md space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  );
}
