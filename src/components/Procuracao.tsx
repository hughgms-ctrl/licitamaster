"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type { Assessoria } from "@/lib/assessoria";
import { formatarCnpj } from "@/lib/formato";
import { Button } from "./ui/button";
import { Aviso } from "./ui/aviso";
import { Linha } from "./ui/linha-papel";

export interface OutorganteProcuracao {
  razao_social: string;
  cnpj: string;
  endereco: string | null;
  cidade_uf: string | null;
  representante_nome: string | null;
  representante_cpf: string | null;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const cpf = (c: string | null | undefined) => {
  const d = (c ?? "").replace(/\D/g, "");
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : (c ?? "");
};

/**
 * Procuração para a assessoria representar o cliente nas licitações.
 * Poderes limitados de propósito: participar do certame (propostas, lances,
 * recursos, declarações), sem receber valores, assinar contrato nem
 * substabelecer. Quem assina contrato e recebe é o próprio cliente.
 */
export default function Procuracao({
  outorgante,
  assessoria,
  instrucoes,
}: {
  outorgante: OutorganteProcuracao;
  assessoria: Assessoria | null;
  /** para o cliente no portal: o passo a passo de assinar e enviar */
  instrucoes?: React.ReactNode;
}) {
  const hoje = new Date();
  const [c, setC] = useState({
    endereco: [outorgante.endereco, outorgante.cidade_uf].filter(Boolean).join(", "),
    representante: outorgante.representante_nome ?? "",
    cpfRep: cpf(outorgante.representante_cpf),
    cidade: outorgante.cidade_uf ?? "",
    data: `${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`,
    validade: "12 (doze) meses",
  });
  const campo = (k: keyof typeof c) => ({
    value: c[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setC((x) => ({ ...x, [k]: e.target.value })),
  });
  const procuradores = assessoria?.procuradores ?? [];
  const plural = procuradores.length > 1;

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="space-y-3 print:hidden">
        {instrucoes}
        {procuradores.length === 0 && (
          <Aviso tom="alerta">
            Os dados dos procuradores ainda não foram cadastrados (Configurações → Assessoria e procuradores). A
            procuração não pode ser assinada sem eles.
          </Aviso>
        )}
        <Button onClick={() => window.print()}>
          <Printer />
          Imprimir ou salvar PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] space-y-5 rounded-lg border bg-white p-8 text-[13.5px] leading-relaxed text-zinc-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <h1 className="text-center text-base font-bold uppercase tracking-[0.2em]">Procuração</h1>

        <p className="text-justify">
          <b>OUTORGANTE:</b> {outorgante.razao_social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº{" "}
          <span className="num">{formatarCnpj(outorgante.cnpj)}</span>, com sede em{" "}
          <Linha className="inline-block w-full sm:w-[28rem]" placeholder="endereço completo, cidade/UF" {...campo("endereco")} />,
          neste ato representada por seu(sua) representante legal,{" "}
          <Linha className="inline-block w-64" placeholder="nome do representante" {...campo("representante")} />, inscrito(a)
          no CPF sob o nº <Linha className="inline-block w-40" placeholder="000.000.000-00" {...campo("cpfRep")} />.
        </p>

        <p className="text-justify">
          <b>{plural ? "OUTORGADOS" : "OUTORGADO"}:</b>{" "}
          {procuradores.length
            ? procuradores.map((p, i) => (
                <span key={p.cpf}>
                  {i > 0 && (i === procuradores.length - 1 ? " e " : "; ")}
                  {p.nome}
                  {p.qualificacao ? `, ${p.qualificacao}` : ""}, inscrito(a) no CPF sob o nº <span className="num">{cpf(p.cpf)}</span>
                </span>
              ))
            : "______________________________________________"}
          {assessoria?.razao_social
            ? `, ${plural ? "integrantes" : "integrante"} de ${assessoria.razao_social}${assessoria.cnpj ? `, CNPJ nº ${formatarCnpj(assessoria.cnpj)}` : ""}${assessoria.endereco ? `, com endereço em ${assessoria.endereco}` : ""}`
            : ""}
          .
        </p>

        <p className="text-justify">
          <b>PODERES:</b> Pelo presente instrumento particular, a outorgante nomeia e constitui {plural ? "os outorgados seus procuradores, para agirem em conjunto ou separadamente" : "o(a) outorgado(a) seu(sua) procurador(a)"},
          com poderes para representá-la em licitações e contratações diretas promovidas por órgãos e entidades da
          Administração Pública direta e indireta, inclusive nos sistemas eletrônicos de compras (Compras.gov.br e
          demais portais), podendo: credenciar-se; apresentar, retificar e retirar propostas e documentos de
          habilitação; formular lances e ofertas; negociar preços; prestar esclarecimentos e responder a diligências;
          firmar declarações e propostas de preços; manifestar intenção de recorrer, interpor recursos e
          contrarrazões, e deles desistir; e praticar os demais atos necessários ao fiel cumprimento deste mandato.
        </p>

        <p className="text-justify">
          Este mandato <b>não</b> confere poderes para receber valores ou dar quitação, assinar contratos ou atas de
          registro de preços em nome da outorgante, nem para substabelecer.
        </p>

        <p>
          <b>VALIDADE:</b> <Linha className="inline-block w-48" {...campo("validade")} /> a contar da data de assinatura.
        </p>

        <div className="space-y-12 pt-4 [break-inside:avoid]">
          <p className="flex flex-wrap items-baseline gap-1 print:block">
            <Linha className="w-48" placeholder="Cidade/UF" {...campo("cidade")} />, <Linha className="w-56" {...campo("data")} />.
          </p>
          <div className="mx-auto w-80 max-w-full space-y-0.5 border-t border-zinc-500 pt-1 text-center">
            <p className="font-semibold">{c.representante || "Representante legal"}</p>
            <p className="num">CPF {c.cpfRep || "_______________"}</p>
            <p>{outorgante.razao_social}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
