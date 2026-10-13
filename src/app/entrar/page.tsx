"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { entrar } from "./acoes";

function Formulario() {
  const [erro, acao, enviando] = useActionState(entrar, null);
  const motivo = useSearchParams().get("motivo");
  return (
    <form action={acao} className="entrar-caixa">
      <h1 className="entrar-marca">Licitação Master</h1>
      <p className="dica">Mesa de operação. Entre com o seu e-mail.</p>
      {motivo === "sem-acesso" && !erro && (
        <p className="aviso aviso-erro">Sua conta ainda não foi liberada para a equipe. Peça ao administrador.</p>
      )}
      {motivo === "link-invalido" && !erro && (
        <p className="aviso aviso-erro">O link expirou ou já foi usado. Peça outro.</p>
      )}
      <label className="campo-rotulado">
        <span>E-mail</span>
        <input className="campo" type="email" name="email" autoComplete="email" autoFocus required />
      </label>
      <label className="campo-rotulado">
        <span>Senha</span>
        <input className="campo" type="password" name="senha" autoComplete="current-password" required />
      </label>
      {erro && <p className="aviso aviso-erro">{erro}</p>}
      <button className="btn btn-primario" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      <div className="entrar-links">
        <Link href="/redefinir-senha">Esqueci a senha</Link>
        <Link href="/criar-conta">Criar conta</Link>
      </div>
    </form>
  );
}

export default function Entrar() {
  return (
    <main className="entrar">
      <Suspense>
        <Formulario />
      </Suspense>
    </main>
  );
}
