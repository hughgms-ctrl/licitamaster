"use client";

import { useActionState } from "react";
import { entrar } from "./acoes";

export default function Entrar() {
  const [erro, acao, enviando] = useActionState(entrar, null);
  return (
    <main className="entrar">
      <form action={acao} className="entrar-caixa">
        <h1 className="entrar-marca">Licitação Master</h1>
        <p className="dica">Mesa de operação. Entre com a senha do operador.</p>
        <label className="campo-rotulado">
          <span>Senha</span>
          <input className="campo" type="password" name="senha" autoFocus required />
        </label>
        {erro && <p className="aviso aviso-erro">{erro}</p>}
        <button className="btn btn-primario" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
