"use client";

import { useActionState } from "react";
import { definirNovaSenha } from "../entrar/acoes";

/** Chega-se aqui pelo link de "Esqueci a senha", já com sessão aberta. */
export default function NovaSenha() {
  const [msg, acao, enviando] = useActionState(definirNovaSenha, null);
  return (
    <main className="entrar">
      <form action={acao} className="entrar-caixa">
        <h1 className="entrar-marca">Senha nova</h1>
        <label className="campo-rotulado">
          <span>Senha nova</span>
          <input className="campo" type="password" name="senha" autoComplete="new-password" minLength={8} autoFocus required />
          <em className="dica">Pelo menos 8 caracteres.</em>
        </label>
        <label className="campo-rotulado">
          <span>Repita a senha</span>
          <input className="campo" type="password" name="confirma" autoComplete="new-password" minLength={8} required />
        </label>
        {msg && <p className="aviso aviso-erro">{msg}</p>}
        <button className="btn btn-primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar senha e entrar"}
        </button>
      </form>
    </main>
  );
}
