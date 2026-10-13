"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { salvarIA } from "@/app/(mesa)/configuracoes/acoes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Campo, Secao } from "./ui/campo";
import { Aviso } from "./ui/aviso";

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
    <form action={enviar} className="divide-y overflow-hidden rounded-lg border bg-card">
      <Secao titulo="Provedor">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Provedor de IA">
          {PROVEDORES.map((p) => (
            <label
              key={p.id}
              data-ativo={provedor === p.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring data-[ativo=true]:border-primary data-[ativo=true]:bg-primary/5"
            >
              <input
                type="radio"
                name="provedor"
                value={p.id}
                checked={provedor === p.id}
                onChange={() => setProvedor(p.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input data-[ativo=true]:border-primary"
                data-ativo={provedor === p.id}
              >
                {provedor === p.id && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{p.nome}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{p.dica}</span>
              </span>
            </label>
          ))}
        </div>
      </Secao>

      <Secao titulo="Modelo e chave">
        <Campo rotulo="Modelo">
          {provedor === "anthropic" ? (
            <NativeSelect name="modelo" defaultValue={modeloInicial} key="sel-anthropic">
              {modelosAnthropic.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}: {m.dica}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input name="modelo" defaultValue={modeloInicial} key="txt-openai" />
          )}
        </Campo>
        <Campo
          rotulo="Chave de API"
          dica={
            provedor === "anthropic" ? (
              <>
                Crie em{" "}
                <a className="text-primary hover:underline dark:text-sidebar-primary" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
                  platform.claude.com
                </a>
                , em API Keys. A assinatura do Claude (Pro/Max) não vale aqui: o uso pela API é cobrado à parte.
              </>
            ) : (
              <>
                Crie em{" "}
                <a className="text-primary hover:underline dark:text-sidebar-primary" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                  platform.openai.com
                </a>
                , em API keys.
              </>
            )
          }
        >
          <Input
            name="api_key"
            type="password"
            autoComplete="off"
            className="font-mono"
            placeholder={provedor === "anthropic" ? "sk-ant-…" : "sk-…"}
            required
          />
        </Campo>
      </Secao>

      <div className="space-y-3 bg-muted/30 p-4 px-5">
        {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}
        <Button disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          {enviando ? "Testando a chave…" : "Testar e salvar"}
        </Button>
      </div>
    </form>
  );
}
