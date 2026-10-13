"use client";

import { useActionState } from "react";
import type { ClienteRow } from "@/lib/db";

/** Formulário de cliente, usado para criar e para editar. */
export default function FormCliente({
  acao,
  cliente,
  rotulo,
}: {
  acao: (estado: string | null, form: FormData) => Promise<string | null>;
  cliente?: ClienteRow;
  rotulo: string;
}) {
  const [msg, enviar, enviando] = useActionState(acao, null);
  return (
    <form action={enviar} className="editor">
      <div className="editor-secao">
        <h3 className="editor-titulo">Empresa</h3>
        <div className="grade-campos">
          <Campo nome="razao_social" rotulo="Razão social" valor={cliente?.razao_social} obrigatorio />
          <Campo nome="nome_fantasia" rotulo="Nome fantasia" valor={cliente?.nome_fantasia} />
          <Campo nome="cnpj" rotulo="CNPJ" valor={cliente?.cnpj} obrigatorio />
          <label className="campo-rotulado">
            <span>Porte</span>
            <select className="campo" name="porte" defaultValue={cliente?.porte ?? "ME"}>
              <option value="MEI">MEI</option>
              <option value="ME">ME</option>
              <option value="EPP">EPP</option>
              <option value="demais">Demais</option>
            </select>
            <em className="dica">ME/EPP têm exclusividade até R$ 80 mil por item</em>
          </label>
        </div>
      </div>

      <div className="editor-secao">
        <h3 className="editor-titulo">Contato</h3>
        <div className="grade-campos">
          <Campo nome="contato_nome" rotulo="Nome do responsável" valor={cliente?.contato_nome} />
          <Campo
            nome="whatsapp"
            rotulo="WhatsApp"
            valor={cliente?.whatsapp}
            dica="55 + DDD + número. É por aqui que ele recebe o link para aprovar."
          />
          <Campo nome="email" rotulo="E-mail" valor={cliente?.email} />
        </div>
      </div>

      <div className="editor-secao">
        <h3 className="editor-titulo">O que a empresa faz</h3>
        <p className="dica">
          A IA lê isto para decidir se uma licitação serve. Escreva o que vende, como entrega,
          em que região atua e — principalmente — o que <b>não</b> consegue fazer.
        </p>
        <textarea
          className="campo campo-area"
          name="contexto"
          rows={5}
          defaultValue={cliente?.contexto ?? ""}
          placeholder="ex: manutenção predial e elétrica em Vitória e Grande Vitória, equipe de 8 técnicos, sem capacidade para obra nova acima de R$ 300 mil nem atendimento fora do ES."
        />
      </div>

      {cliente && (
        <div className="editor-secao">
          <label className="linha-check">
            <input type="checkbox" name="ativo" defaultChecked={cliente.ativo} />
            <span>Cliente ativo. Desligado, a coleta para de procurar licitações para ele.</span>
          </label>
        </div>
      )}

      {msg && <p className={`aviso ${msg === "Salvo." ? "" : "aviso-erro"}`}>{msg}</p>}
      <div className="acoes acoes-editor">
        <button className="btn btn-primario" disabled={enviando}>
          {enviando ? "Salvando…" : rotulo}
        </button>
      </div>
    </form>
  );
}

function Campo({
  nome,
  rotulo,
  valor,
  obrigatorio,
  dica,
}: {
  nome: string;
  rotulo: string;
  valor?: string | null;
  obrigatorio?: boolean;
  dica?: string;
}) {
  return (
    <label className="campo-rotulado">
      <span>{rotulo}</span>
      <input className="campo" name={nome} defaultValue={valor ?? ""} required={obrigatorio} />
      {dica && <em className="dica">{dica}</em>}
    </label>
  );
}
