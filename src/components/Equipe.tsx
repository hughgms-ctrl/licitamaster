"use client";

import { useActionState } from "react";
import { liberarEmail, removerOperador } from "@/app/configuracoes/acoes";

interface Membro {
  email: string;
  nome: string | null;
  papel: "admin" | "operador";
}

export default function Equipe({ membros, eu }: { membros: Membro[]; eu: string }) {
  const [saida, acao, enviando] = useActionState(liberarEmail, null);
  return (
    <div className="editor-secao">
      <h3 className="editor-titulo">Equipe</h3>
      <p className="dica">
        Só entra na mesa quem está nesta lista. Libere o e-mail aqui e a pessoa cria a conta em
        &quot;Criar conta&quot;, na tela de entrada.
      </p>
      <ul className="equipe">
        {membros.map((m) => (
          <li key={m.email}>
            <span>
              <b>{m.nome || m.email}</b>
              {m.nome && <span className="dica"> {m.email}</span>}
            </span>
            <span className={`selo ${m.papel === "admin" ? "selo-aprovada" : ""}`}>
              {m.papel === "admin" ? "Administrador" : "Operador"}
            </span>
            {m.email !== eu && (
              <button
                className="btn btn-discreto"
                onClick={async () => {
                  if (confirm(`Tirar ${m.email} da equipe? A pessoa perde o acesso na hora.`)) {
                    await removerOperador(m.email);
                  }
                }}
              >
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>
      <form action={acao} className="equipe-liberar">
        <input className="campo" type="email" name="email" placeholder="email@empresa.com.br" required />
        <select className="campo" name="papel" defaultValue="operador" aria-label="Papel">
          <option value="operador">Operador</option>
          <option value="admin">Administrador</option>
        </select>
        <button className="btn btn-primario" disabled={enviando}>
          Liberar e-mail
        </button>
      </form>
      {saida && <p className={`aviso ${saida.ok ? "" : "aviso-erro"}`}>{saida.mensagem}</p>}
    </div>
  );
}
