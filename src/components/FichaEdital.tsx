"use client";

import { checklistHabilitacao, type DocumentoResumo, type ItemChecklist } from "@/lib/documentos";
import { dataDaSessao, type FichaRow } from "@/lib/ficha";
import { formatarData, formatarValor } from "@/lib/formato";
import { FileText } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { Aviso } from "./ui/aviso";
import { StatusDot, type Tom } from "./ui/status-dot";

const ROTULO_ITEM: Record<ItemChecklist["situacao"], string> = {
  ok: "Pronto",
  vence_logo: "Vence logo depois da sessão",
  vence_antes: "Vence antes da sessão",
  vencido: "Vencido",
  falta: "Falta",
};

const TOM_ITEM: Record<ItemChecklist["situacao"], Tom> = {
  ok: "sucesso",
  vence_logo: "alerta",
  vence_antes: "perigo",
  vencido: "perigo",
  falta: "perigo",
};

/**
 * A ficha do edital, organizada na ordem em que o operador decide:
 * o que é → quando e onde → o cliente consegue se habilitar? → o que pode dar
 * errado → o que dá para contestar.
 */
export default function FichaEdital({
  linha,
  cofre,
  encerramento,
  editalMudouDepois,
  nomeCliente,
}: {
  linha: FichaRow;
  cofre: DocumentoResumo[];
  encerramento: string | null;
  editalMudouDepois: boolean;
  nomeCliente: string;
}) {
  const f = linha.ficha;
  const sessao = dataDaSessao(f.sessao.data_hora) ?? encerramento;
  const checklist = checklistHabilitacao(f.documentos_exigidos, cofre, sessao);
  const prontos = checklist.filter((c) => c.situacao === "ok").length;

  return (
    <div className="space-y-5 rounded-md border bg-background/40 p-4 text-sm">
      {editalMudouDepois && (
        <Aviso tom="erro">O edital foi retificado no PNCP depois desta leitura. Leia de novo antes de seguir.</Aviso>
      )}

      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="leading-relaxed">{f.resumo}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        <Fato rotulo="Sessão" valor={f.sessao.data_hora} />
        <Fato rotulo="Plataforma" valor={f.sessao.plataforma} link={f.sessao.link} />
        <Fato rotulo="Disputa" valor={f.sessao.modo_disputa} />
        <Fato rotulo="Julgamento" valor={f.sessao.criterio_julgamento} />
        <Fato
          rotulo="Exclusiva ME/EPP"
          valor={{ sim: "Sim", nao: "Não", parcial: "Em parte dos itens", nao_informado: null }[f.exclusiva_me_epp]}
        />
        <Fato rotulo="Impugnação até" valor={f.prazos.impugnacao} />
        <Fato rotulo="Execução" valor={f.prazos.entrega_execucao} />
        <Fato rotulo="Vigência" valor={f.prazos.vigencia} />
        <Fato rotulo="Pagamento" valor={f.prazos.pagamento} />
      </dl>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 [break-after:avoid]">
          <h4 className="text-sm font-semibold">Habilitação de {nomeCliente}</h4>
          <StatusDot tom={prontos === checklist.length ? "sucesso" : "alerta"}>
            <span className="num">
              {prontos} de {checklist.length} prontos
            </span>
          </StatusDot>
        </div>
        {checklist.length === 0 ? (
          <p className="text-muted-foreground">A leitura não identificou documentos de habilitação no edital.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {checklist.map((c, i) => (
              <li
                key={`${c.tipo}-${i}`}
                className="grid gap-1 px-3 py-2.5 break-inside-avoid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-3"
              >
                <span>
                  <StatusDot tom={TOM_ITEM[c.situacao]}>
                    {ROTULO_ITEM[c.situacao]}
                    {c.validade && c.situacao !== "ok" && (
                      <span className="num font-normal text-muted-foreground">
                        {" "}
                        ({c.validade.split("-").reverse().slice(0, 2).join("/")})
                      </span>
                    )}
                  </StatusDot>
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium">{c.rotulo}</span>
                  {c.detalhe && <span className="block text-xs leading-relaxed text-muted-foreground">{c.detalhe}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Quadro titulo="Qualificação técnica" itens={f.exigencias_tecnicas} />
      <Quadro titulo="Qualificação econômico-financeira" itens={f.qualificacao_economica} />
      <Quadro titulo="Visita técnica" itens={f.visita_tecnica ? [f.visita_tecnica] : []} />
      <Quadro titulo="Amostra" itens={f.amostra ? [f.amostra] : []} />
      <Quadro titulo="Garantia" itens={f.garantia ? [f.garantia] : []} />
      <Quadro titulo="Riscos" tom="alerta" itens={f.riscos} />

      {f.clausulas_restritivas.length > 0 && (
        <Quadro
          titulo="Cláusulas que podem ser impugnadas"
          tom="alerta"
          rodape={f.prazos.impugnacao ? `Prazo para impugnar: ${f.prazos.impugnacao}.` : undefined}
          itens={f.clausulas_restritivas.map((c, i) => (
            <span key={i} className="block space-y-0.5">
              <span className="block font-medium">
                {c.clausula} {c.referencia && <span className="font-normal text-muted-foreground">({c.referencia})</span>}
              </span>
              <span className="block text-muted-foreground">{c.por_que}</span>
            </span>
          ))}
        />
      )}

      {f.proposta && (
        <>
          <Quadro
            titulo="Na proposta de preços"
            itens={[
              ...(f.proposta.colunas.length ? [`Colunas pedidas: ${f.proposta.colunas.join(", ")}`] : []),
              ...f.proposta.observacoes,
            ]}
          />
          <Quadro titulo="Declarações que vão na proposta" itens={f.proposta.declaracoes} />
        </>
      )}

      <Quadro titulo="Perguntas para o pregoeiro" itens={f.perguntas_esclarecimento} />
      <Quadro titulo="Penalidades" itens={f.penalidades} />

      {f.itens.length > 0 && (
        <Quadro
          titulo="Itens"
          itens={f.itens.map((it, i) => (
            <span key={i} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-0 flex-1">{it.descricao}</span>
              {it.quantidade && <span className="text-xs text-muted-foreground">{it.quantidade}</span>}
              {it.valor_estimado != null && (
                <span className="num shrink-0 font-medium">{formatarValor(it.valor_estimado)}</span>
              )}
            </span>
          ))}
        />
      )}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        Lido em {formatarData(linha.gerado_em)}
        {linha.modelo ? ` por ${linha.modelo}` : ""}, a partir de:{" "}
        {linha.arquivos_lidos.map((a) => a.titulo).join("; ")}.
      </p>
    </div>
  );
}

function Fato({ rotulo, valor, link }: { rotulo: string; valor: string | null | undefined; link?: string | null }) {
  if (!valor) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline dark:text-sidebar-primary">
            {valor}
          </a>
        ) : (
          valor
        )}
      </dd>
    </div>
  );
}

/**
 * Um bloco da ficha: quadro com borda e faixa de título, um ponto por linha.
 * Ocupa a largura toda para ler de cima a baixo, inclusive no papel.
 */
function Quadro({
  titulo,
  itens,
  tom = "neutro",
  rodape,
}: {
  titulo: string;
  itens: React.ReactNode[];
  tom?: "neutro" | "alerta";
  rodape?: string;
}) {
  if (!itens?.length) return null;
  const alerta = tom === "alerta";
  return (
    <section
      className={cn(
        "overflow-hidden rounded-md border border-l-4 bg-card [print-color-adjust:exact]",
        alerta ? "border-l-warning" : "border-l-primary/70",
      )}
    >
      <h4
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold [break-after:avoid]",
          alerta ? "bg-warning/10" : "bg-muted/60",
        )}
      >
        {titulo}
        {itens.length > 1 && <span className="num text-xs font-normal text-muted-foreground">{itens.length}</span>}
      </h4>
      <ol className="divide-y">
        {itens.map((x, i) => (
          <li key={i} className="flex gap-3 px-3 py-2 leading-relaxed break-inside-avoid">
            {itens.length > 1 && <span className="num w-5 shrink-0 text-right text-xs leading-6 text-muted-foreground">{i + 1}.</span>}
            <span className="min-w-0 flex-1">{x}</span>
          </li>
        ))}
      </ol>
      {rodape && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{rodape}</p>}
    </section>
  );
}
