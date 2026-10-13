import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mensagem dentro do fluxo (resultado de ação, erro de formulário). */
export function Aviso({
  tom = "info",
  titulo,
  children,
  className,
}: {
  tom?: "info" | "sucesso" | "erro" | "alerta";
  titulo?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icone = tom === "erro" || tom === "alerta" ? AlertCircle : tom === "sucesso" ? CheckCircle2 : Info;
  return (
    <div
      role="status"
      className={cn(
        "flex gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        tom === "erro" && "border-destructive/30 bg-destructive/5",
        tom === "alerta" && "border-warning/30 bg-warning/5",
        tom === "sucesso" && "border-success/30 bg-success/5",
        tom === "info" && "bg-muted/60",
        className
      )}
    >
      <Icone
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tom === "erro" && "text-destructive",
          tom === "alerta" && "text-warning",
          tom === "sucesso" && "text-success",
          tom === "info" && "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1 space-y-1.5 leading-relaxed">
        {titulo && <p className="font-medium">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}
