"use client";

import { cn } from "@/lib/utils";

/** Campo de texto na tela; no papel vira só o texto, que pode quebrar de linha. */
export function Linha({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <input
        {...props}
        className={cn(
          "w-full min-w-0 border-b border-dashed border-zinc-300 bg-transparent px-0.5 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none print:hidden",
          className
        )}
      />
      <span className={cn("hidden whitespace-pre-wrap print:inline", className?.includes("text-center") && "print:block")}>
        {String(props.value ?? "")}
      </span>
    </>
  );
}

