"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { ClienteRow } from "@/lib/db";
import { ROTULO_ESTRATEGIA, ROTULO_RISCO } from "@/lib/objetivos";
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
        titulo="Para a proposta de preços"
        descricao="Vão no cabeçalho e na assinatura da proposta. Quem assina é o representante legal (sócio ou procurador)."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo nome="endereco" rotulo="Endereço" valor={cliente?.endereco} dica="Rua, número, bairro e CEP." />
          <Campo nome="cidade_uf" rotulo="Cidade/UF" valor={cliente?.cidade_uf} dica="ex: Vitória/ES" />
          <Campo nome="representante_nome" rotulo="Representante legal" valor={cliente?.representante_nome} />
          <Campo nome="representante_cpf" rotulo="CPF do representante" valor={cliente?.representante_cpf} />
          <Campo nome="representante_cargo" rotulo="Cargo" valor={cliente?.representante_cargo} dica="ex: Sócio-administrador" />
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

      <Secao
        titulo="Objetivos do cliente"
        descricao="Antes de disputar, saiba onde ele quer chegar. A IA usa isto para dizer se cada licitação serve, e a calculadora de preço já vem com o lucro mínimo."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoBase rotulo="Perfil de atuação" dica="Sniper combina com equipe pequena; força bruta pede mais gente e organização.">
            <NativeSelect name="obj_estrategia" defaultValue={cliente?.objetivos?.estrategia ?? ""}>
              <option value="">Ainda não definido</option>
              {Object.entries(ROTULO_ESTRATEGIA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </CampoBase>
          <CampoBase rotulo="Risco que aceita">
            <NativeSelect name="obj_risco" defaultValue={cliente?.objetivos?.risco ?? ""}>
              <option value="">Ainda não definido</option>
              {Object.entries(ROTULO_RISCO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </CampoBase>
          <Campo
            nome="obj_capital"
            rotulo="Capital para bancar entregas (R$)"
            valor={numeroTexto(cliente?.objetivos?.capital)}
            dica="O órgão paga depois da entrega. Quanto ele consegue adiantar de compra e mão de obra?"
          />
          <Campo
            nome="obj_lucro_pct"
            rotulo="Lucro mínimo por venda (%)"
            valor={numeroTexto(cliente?.objetivos?.lucro_pct)}
            dica="Abaixo disso não vale a pena. Vai direto para a calculadora de preço."
          />
          <Campo nome="obj_meta" rotulo="Meta de faturamento com governo (R$)" valor={numeroTexto(cliente?.objetivos?.meta_faturamento)} />
          <Campo nome="obj_prazo" rotulo="Em quantos meses" valor={numeroTexto(cliente?.objetivos?.prazo_meses)} />
        </div>
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

function numeroTexto(n: number | null | undefined) {
  return n == null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
