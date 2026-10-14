"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { salvarAssessoria } from "@/app/(mesa)/configuracoes/acoes";
import type { Assessoria } from "@/lib/assessoria";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Campo, Secao } from "./ui/campo";
import { Aviso } from "./ui/aviso";

/** Quem recebe a procuração dos clientes: a assessoria e até 3 procuradores. */
export default function FormAssessoria({ atual }: { atual: Assessoria | null }) {
  const [saida, enviar, enviando] = useActionState(salvarAssessoria, null);
  return (
    <form action={enviar}>
      <Secao
        titulo="Assessoria e procuradores"
        descricao="Vão na procuração que o cliente assina. Procurador é quem dá os lances e assina as propostas em nome do cliente."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Razão social da assessoria">
            <Input name="razao_social" defaultValue={atual?.razao_social ?? ""} />
          </Campo>
          <Campo rotulo="CNPJ da assessoria">
            <Input name="cnpj" defaultValue={atual?.cnpj ?? ""} />
          </Campo>
          <Campo rotulo="Endereço da assessoria" className="sm:col-span-2">
            <Input name="endereco" defaultValue={atual?.endereco ?? ""} />
          </Campo>
        </div>
        {[0, 1, 2].map((i) => {
          const p = atual?.procuradores[i];
          return (
            <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_10rem]">
              <Campo rotulo={`Procurador ${i + 1}${i > 0 ? " (opcional)" : ""}`}>
                <Input name={`p${i}_nome`} placeholder="Nome completo" defaultValue={p?.nome ?? ""} />
              </Campo>
              <Campo rotulo="CPF">
                <Input name={`p${i}_cpf`} defaultValue={p?.cpf ?? ""} />
              </Campo>
              <Campo
                rotulo="Qualificação"
                className="sm:col-span-2"
                dica="Nacionalidade, estado civil e profissão, como vai no texto."
              >
                <Input name={`p${i}_qualificacao`} placeholder="brasileiro, casado, administrador" defaultValue={p?.qualificacao ?? ""} />
              </Campo>
            </div>
          );
        })}
        {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}
        <Button disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          Salvar dados da assessoria
        </Button>
      </Secao>
    </form>
  );
}
