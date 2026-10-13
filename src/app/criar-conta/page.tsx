"use client";

import Link from "next/link";
import { useActionState } from "react";
import { criarConta } from "../entrar/acoes";

export default function CriarConta() {
  const [msg, acao, enviando] = useActionState(criarConta, null);

  if (msg === "ENVIADO") {
    return (
      <main className="entrar">
        <div className="entrar-caixa">
          <h1 className="entrar-marca">Confirme o seu e-mail</h1>
          <p>Enviamos um link de confirmação. Abra o e-mail e clique no link para ativar a conta.</p>
          <p className="dica">Não chegou? Confira a caixa de spam. O link vale por 24 horas.</p>
          <Link className="btn" href="/entrar">
            Voltar para a entrada
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="entrar">
      <form action={acao} className="entrar-caixa">
        <h1 className="entrar-marca">Criar conta</h1>
        <p className="dica">
          Para a equipe que opera as licitações. Seu e-mail precisa ter sido liberado pelo
          administrador. A primeira conta do sistema vira a administradora.
        </p>
        <label className="campo-rotulado">
          <span>Nome</span>
          <input className="campo" name="nome" autoComplete="name" />
        </label>
        <label className="campo-rotulado">
          <span>E-mail</span>
          <input className="campo" type="email" name="email" autoComplete="email" required />
        </label>
        <label className="campo-rotulado">
          <span>Senha</span>
          <input className="campo" type="password" name="senha" autoComplete="new-password" minLength={8} required />
          <em className="dica">Pelo menos 8 caracteres.</em>
        </label>
        <label className="campo-rotulado">
          <span>Repita a senha</span>
          <input className="campo" type="password" name="confirma" autoComplete="new-password" minLength={8} required />
        </label>
        {msg && <p className="aviso aviso-erro">{msg}</p>}
        <button className="btn btn-primario" disabled={enviando}>
          {enviando ? "Criando…" : "Criar conta"}
        </button>
        <div className="entrar-links">
          <Link href="/entrar">Já tenho conta</Link>
        </div>
      </form>
    </main>
  );
}
