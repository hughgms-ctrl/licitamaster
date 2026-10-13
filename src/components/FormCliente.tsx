"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { ClienteRow } from "@/lib/db";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
import { Checkbox } from "./ui/checkbox";
import { Campo as CampoBase, Secao } from "./ui/campo";
import { Aviso } from "./ui/aviso";

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
    <form action={enviar} className="divide-y overflow-hidden rounded-lg border bg-card">
      <Secao titulo="Empresa">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo nome="razao_social" rotulo="Razão social" valor={cliente?.razao_social} obrigatorio />
          <Campo nome="nome_fantasia" rotulo="Nome fantasia" valor={cliente?.nome_fantasia} />
          <Campo nome="cnpj" rotulo="CNPJ" valor={cliente?.cnpj} obrigatorio />
          <CampoBase rotulo="Porte" dica="ME/EPP têm exclusividade até R$ 80 mil por item.">
            <NativeSelect name="porte" defaultValue={cliente?.porte ?? "ME"}>
              <option value="MEI">MEI</option>
              <option value="ME">ME</option>
              <option value="EPP">EPP</option>
              <option value="demais">Demais</option>
            </NativeSelect>
          </CampoBase>
        </div>
      </Secao>

      <Secao titulo="Contato">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo nome="contato_nome" rotulo="Nome do responsável" valor={cliente?.contato_nome} />
          <Campo nome="email" rotulo="E-mail" valor={cliente?.email} />
          <Campo
            nome="whatsapp"
            rotulo="WhatsApp"
            valor={cliente?.whatsapp}
            dica="55 + DDD + número. É por aqui que ele recebe o link para aprovar."
          />
        </div>
      </Secao>

      <Secao
        titulo="O que a empresa faz"
        descricao={
          <>
            A IA lê isto para decidir se uma licitação serve. Escreva o que vende, como entrega, em que
            região atua e — principalmente — o que <b className="font-medium text-foreground">não</b> consegue fazer.
          </>
        }
      >
        <Textarea
          name="contexto"
          aria-label="O que a empresa faz"
          rows={5}
          defaultValue={cliente?.contexto ?? ""}
          placeholder="ex: manutenção predial e elétrica em Vitória e Grande Vitória, equipe de 8 técnicos, sem capacidade para obra nova acima de R$ 300 mil nem atendimento fora do ES."
        />
      </Secao>

      {cliente && (
        <div className="p-5">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="ativo" defaultChecked={cliente.ativo} className="mt-0.5" />
            <span className="leading-relaxed">
              <span className="font-medium">Cliente ativo.</span>{" "}
              <span className="text-muted-foreground">Desligado, a coleta para de procurar licitações para ele.</span>
            </span>
          </label>
        </div>
      )}

      <div className="space-y-3 bg-muted/30 p-4 px-5">
        {msg && <Aviso tom={msg === "Salvo." ? "sucesso" : "erro"}>{msg}</Aviso>}
        <Button disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          {enviando ? "Salvando…" : rotulo}
        </Button>
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
    <CampoBase rotulo={rotulo} dica={dica}>
      <Input name={nome} defaultValue={valor ?? ""} required={obrigatorio} />
    </CampoBase>
  );
}
