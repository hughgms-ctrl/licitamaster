"use client";

import { useEffect } from "react";

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
    <main className="entrar">
      <div className="entrar-caixa">
        <h1 className="entrar-marca">{versaoNova ? "O sistema foi atualizado" : "Algo deu errado"}</h1>
        <p>
          {versaoNova
            ? "Publicamos uma versão nova enquanto esta página estava aberta. Recarregue para continuar. Se você estava salvando algo, confira se foi salvo e envie de novo."
            : "A tela encontrou um erro inesperado. Recarregue a página; se o erro continuar, avise com o horário em que aconteceu."}
        </p>
        <button className="btn btn-primario" onClick={() => window.location.reload()}>
          Recarregar a página
        </button>
        {!versaoNova && (
          <button className="btn" onClick={() => reset()}>
            Tentar de novo sem recarregar
          </button>
        )}
        {error.digest && <p className="dica">Código do erro: {error.digest}</p>}
      </div>
    </main>
  );
}
