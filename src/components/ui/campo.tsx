import { cn } from "@/lib/utils";

/** Rótulo + controle + dica, empilhados. O controle fica dentro do label. */
export function Campo({
  rotulo,
  dica,
  children,
  className,
}: {
  rotulo: React.ReactNode;
  dica?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium leading-none">{rotulo}</span>
      {children}
      {dica && <span className="block text-xs leading-relaxed text-muted-foreground">{dica}</span>}
    </label>
  );
}

/** Seção de formulário: título à esquerda em telas largas, conteúdo à direita. */
export function Secao({
  titulo,
  descricao,
  children,
  className,
  acao,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  acao?: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-[0.9375rem] font-semibold leading-tight">{titulo}</h3>
          {descricao && <p className="text-sm leading-relaxed text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
