"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { TelaEntrada } from "@/components/TelaEntrada";
import { Button } from "@/components/ui/button";

/**
 * Erro inesperado em qualquer tela. O caso mais comum não é bug: o sistema
 * foi publicado de novo enquanto a página estava aberta, e o formulário
 * aponta para uma versão que não existe mais. Recarregar resolve.
 */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const versaoNova = /server action|deployment|chunk|loading/i.test(error.message ?? "");

  return (
    <TelaEntrada
      titulo={versaoNova ? "O sistema foi atualizado" : "Algo deu errado"}
      sub={
        versaoNova
          ? "Publicamos uma versão nova enquanto esta página estava aberta. Recarregue para continuar. Se você estava salvando algo, confira se foi salvo e envie de novo."
          : "A tela encontrou um erro inesperado. Recarregue a página; se o erro continuar, avise com o horário em que aconteceu."
      }
    >
      <div className="space-y-2">
        <Button className="w-full" onClick={() => window.location.reload()}>
          <RotateCw />
          Recarregar a página
        </Button>
        {!versaoNova && (
          <Button variant="outline" className="w-full" onClick={() => reset()}>
            Tentar de novo sem recarregar
          </Button>
        )}
        {error.digest && <p className="pt-2 text-center text-xs text-muted-foreground">Código do erro: <span className="font-mono">{error.digest}</span></p>}
      </div>
    </TelaEntrada>
  );
}
