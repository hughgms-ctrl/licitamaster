"use client";

import Link from "next/link";
import { useActionState } from "react";
import { pedirRedefinicao } from "../entrar/acoes";

export default function RedefinirSenha() {
  const [msg, acao, enviando] = useActionState(pedirRedefinicao, null);
  return (
    <main className="entrar">
      <form action={acao} className="entrar-caixa">
        <h1 className="entrar-marca">Esqueci a senha</h1>
        {msg === "ENVIADO" ? (
          <p>Se este e-mail tiver conta, enviamos um link para criar uma senha nova. Confira também o spam.</p>
        ) : (
          <>
            <p className="dica">Enviamos um link para o seu e-mail para criar uma senha nova.</p>
            <label className="campo-rotulado">
              <span>E-mail</span>
              <input className="campo" type="email" name="email" autoComplete="email" autoFocus required />
            </label>
            {msg && <p className="aviso aviso-erro">{msg}</p>}
            <button className="btn btn-primario" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar link"}
            </button>
          </>
        )}
        <div className="entrar-links">
          <Link href="/entrar">Voltar para a entrada</Link>
        </div>
      </form>
    </main>
  );
}
