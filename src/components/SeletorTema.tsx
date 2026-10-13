"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPCOES = [
  { id: "light", rotulo: "Claro", icone: Sun },
  { id: "dark", rotulo: "Escuro", icone: Moon },
] as const;

/** Seletor visível de tema: claro ou escuro. */
export function SeletorTema({ className, compacto }: { className?: string; compacto?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  // O tema só é conhecido no navegador; antes disso nenhum botão fica marcado.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const atual = montado ? resolvedTheme : null;

  return (
    <div role="radiogroup" aria-label="Tema" className={cn("inline-flex rounded-md bg-muted p-0.5", className)}>
      {OPCOES.map(({ id, rotulo, icone: Icone }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={atual === id}
          aria-label={rotulo}
          onClick={() => setTheme(id)}
          className={cn(
            "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            atual === id && "bg-card text-foreground shadow-sm dark:bg-accent dark:shadow-none"
          )}
        >
          <Icone className="size-3.5" />
          {!compacto && rotulo}
        </button>
      ))}
    </div>
  );
}
