"use client";

import { useActionState, useState } from "react";
import { salvarIA } from "@/app/configuracoes/acoes";

type Provedor = "anthropic" | "openai";

const PROVEDORES: { id: Provedor; nome: string; dica: string }[] = [
  { id: "anthropic", nome: "Claude", dica: "Da Anthropic. Lê editais em PDF com tabelas e anexos." },
  { id: "openai", nome: "OpenAI", dica: "GPT. Use se você já tem créditos na OpenAI." },
];

export default function FormIA({
  modelosAnthropic,
  modeloPadrao,
  provedorAtual,
  modeloAtual,
}: {
  modelosAnthropic: { id: string; rotulo: string; dica: string }[];
  modeloPadrao: Record<Provedor, string>;
  provedorAtual: Provedor;
  modeloAtual: string | null;
}) {
  const [provedor, setProvedor] = useState<Provedor>(provedorAtual);
  const [saida, enviar, enviando] = useActionState(salvarIA, null);
  const modeloInicial =
    provedor === provedorAtual && modeloAtual ? modeloAtual : modeloPadrao[provedor];

  return (
    <form action={enviar} className="editor">
      <div className="editor-secao">
        <h3 className="editor-titulo">Provedor</h3>
        <div className="escolhas" role="radiogroup" aria-label="Provedor de IA">
          {PROVEDORES.map((p) => (
            <label key={p.id} className="escolha" data-ativo={provedor === p.id}>
              <input
                type="radio"
                name="provedor"
                value={p.id}
                checked={provedor === p.id}
                onChange={() => setProvedor(p.id)}
              />
              <span className="escolha-nome">{p.nome}</span>
              <span className="dica">{p.dica}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="editor-secao">
        <label className="campo-rotulado">
          <span>Modelo</span>
          {provedor === "anthropic" ? (
            <select className="campo" name="modelo" defaultValue={modeloInicial} key="sel-anthropic">
              {modelosAnthropic.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}: {m.dica}
                </option>
              ))}
            </select>
          ) : (
            <input className="campo" name="modelo" defaultValue={modeloInicial} key="txt-openai" />
          )}
        </label>
        <label className="campo-rotulado">
          <span>Chave de API</span>
          <input
            className="campo"
            name="api_key"
            type="password"
            autoComplete="off"
            placeholder={provedor === "anthropic" ? "sk-ant-…" : "sk-…"}
            required
          />
          <em className="dica">
            {provedor === "anthropic" ? (
              <>
                Crie em{" "}
                <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
                  platform.claude.com
                </a>
                , em API Keys. A assinatura do Claude (Pro/Max) não vale aqui: o uso pela API é cobrado
                à parte.
              </>
            ) : (
              <>
                Crie em{" "}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                  platform.openai.com
                </a>
                , em API keys.
              </>
            )}
          </em>
        </label>
      </div>

      {saida && <p className={`aviso ${saida.ok ? "" : "aviso-erro"}`}>{saida.mensagem}</p>}
      <div className="acoes acoes-editor">
        <button className="btn btn-primario" disabled={enviando}>
          {enviando ? "Testando a chave…" : "Testar e salvar"}
        </button>
      </div>
    </form>
  );
}
