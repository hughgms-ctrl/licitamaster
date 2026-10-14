import { exigirOperadorPagina } from "@/lib/auth";
import { FASES, GLOSSARIO } from "@/lib/guia";
import { DOCUMENTOS_BASICOS, ITENS_MANUAIS } from "@/lib/preparo";
import { DECLARACAO_APROVACAO } from "@/lib/etapas";
import { DECLARACAO_PROPOSTA } from "@/lib/proposta";
import { rotuloTipo } from "@/lib/documentos";
import { Cabecalho } from "@/components/Cabecalho";
import Procuracao from "@/components/Procuracao";
import { BotaoImprimir } from "@/components/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Material para revisão · Licitação Master" };

/**
 * Tudo o que o sistema diz sobre licitação, num lugar só, para um analista
 * experiente revisar antes do primeiro cliente real. Cada trecho tem um
 * código (R1, R2…) para a revisão apontar o que mudar.
 */
export default async function Revisao() {
  await exigirOperadorPagina();
  let n = 0;
  const cod = () => `R${++n}`;

  return (
    <div className="max-w-4xl space-y-8 print:max-w-none print:text-[12px]">
      <Cabecalho
        titulo="Material para revisão"
        sub="Os textos que orientam você e o cliente. Imprima ou salve em PDF e peça a um analista de licitação para anotar ao lado de cada código (R1, R2…) o que está errado ou faltando."
        acoes={<BotaoImprimir />}
      />

      <Bloco titulo="1. Checklist de preparação do cliente" nota="O que a empresa precisa ter antes da primeira disputa. 'Equipe' é o texto que você vê; 'Cliente' é o que aparece no portal.">
        {ITENS_MANUAIS.map((i) => (
          <Trecho key={i.id} cod={cod()} titulo={`${i.rotulo}${i.obrigatorio ? "" : " (opcional)"}`}>
            <p>
              <b>Equipe:</b> {i.dica}
            </p>
            {i.instrucao && (
              <p>
                <b>Cliente:</b> {i.instrucao}
              </p>
            )}
          </Trecho>
        ))}
        <Trecho cod={cod()} titulo="Documentos básicos exigidos de todo cliente">
          <ul className="list-disc pl-5">
            {DOCUMENTOS_BASICOS.map((d) => (
              <li key={d.tipo}>
                {rotuloTipo(d.tipo)}
                {d.obrigatorio ? "" : " (recomendado)"}
              </li>
            ))}
          </ul>
        </Trecho>
      </Bloco>

      <Bloco titulo="2. Declaração que o cliente aceita ao aprovar uma licitação" nota="Fica registrada na auditoria com data e origem.">
        <Trecho cod={cod()} titulo="Declaração de aprovação">
          <p>{DECLARACAO_APROVACAO}</p>
        </Trecho>
      </Bloco>

      <Bloco titulo="3. Guia da disputa" nota="Aparece na página Guia da disputa e no roteiro de cada licitação.">
        {FASES.map((f) => (
          <div key={f.id} className="space-y-2">
            <h3 className="font-semibold">{f.titulo}</h3>
            <Trecho cod={cod()} titulo="Resumo da fase">
              <p>{f.resumo}</p>
            </Trecho>
            {f.passos.map((p) => (
              <Trecho key={p.id} cod={cod()} titulo={p.titulo}>
                <p>{p.detalhe}</p>
                {p.cuidado && (
                  <p>
                    <b>Cuidado:</b> {p.cuidado}
                  </p>
                )}
              </Trecho>
            ))}
          </div>
        ))}
      </Bloco>

      <Bloco titulo="4. Glossário">
        {GLOSSARIO.map((g) => (
          <Trecho key={g.termo} cod={cod()} titulo={g.termo}>
            <p>{g.significado}</p>
          </Trecho>
        ))}
      </Bloco>

      <Bloco titulo="5. Proposta ajustada" nota="Declaração geral impressa em toda proposta readequada. As declarações específicas vêm do edital.">
        <Trecho cod={cod()} titulo="Declaração da proposta">
          <p>{DECLARACAO_PROPOSTA}</p>
        </Trecho>
      </Bloco>

      <Bloco titulo={`6. Procuração (${cod()})`} nota="Modelo com dados de exemplo. Os poderes são limitados de propósito: sem receber valores, assinar contratos nem substabelecer.">
        <div className="[&_button]:hidden">
          <Procuracao
            assessoria={{
              razao_social: "[Assessoria]",
              cnpj: "",
              endereco: "[endereço da assessoria]",
              procuradores: [{ nome: "[Procurador]", cpf: "00000000000", qualificacao: "[nacionalidade, estado civil, profissão]" }],
            }}
            outorgante={{
              razao_social: "[Empresa cliente]",
              cnpj: "00000000000000",
              endereco: "[endereço]",
              cidade_uf: "[cidade/UF]",
              representante_nome: "[Representante legal]",
              representante_cpf: "00000000000",
            }}
          />
        </div>
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 [break-inside:auto]">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {nota && <p className="text-sm text-muted-foreground print:text-zinc-600">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

function Trecho({ cod, titulo, children }: { cod: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[3rem_1fr] gap-3 rounded-md border bg-card p-3 text-sm leading-relaxed [break-inside:avoid] print:border-zinc-300 print:bg-white">
      <span className="num font-mono text-xs font-semibold text-primary dark:text-sidebar-primary print:text-zinc-900">{cod}</span>
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{titulo}</p>
        {children}
        <p className="hidden pt-2 text-zinc-500 print:block">Observação: ____________________________________________</p>
      </div>
    </div>
  );
}
