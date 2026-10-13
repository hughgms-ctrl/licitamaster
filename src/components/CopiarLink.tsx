"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function CopiarLink({ link, className }: { link: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <Input readOnly value={link} onFocus={(e) => e.target.select()} className="num h-8 min-w-0 flex-1 font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            /* sem permissão de clipboard: o campo já seleciona ao focar */
          }
        }}
      >
        {copiado ? <Check className="text-success" /> : <Copy />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
