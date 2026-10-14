"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Gavel,
  Loader2,
  Printer,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { analisar, lerEditalAcao, salvarNotas } from "@/app/acoes";
import type { DisputaCompleta } from "@/lib/db";
import { ROTULO_STATUS } from "@/lib/etapas";
import { formatarData, formatarValor, limparObjeto } from "@/lib/formato";
import { dataDaSessao, type FichaRow } from "@/lib/ficha";
import { checklistHabilitacao, pendenciasHabilitacao, type DocumentoResumo } from "@/lib/documentos";
import { ETAPAS_COM_RESULTADO, type ResultadoDisputa } from "@/lib/resultado";
import type { ContratoDisputa } from "@/lib/contrato";
import { ETAPAS_COM_GUIA } from "@/lib/guia";
import { cn } from "@/lib/utils";
import { Analise, Fato, Prazo, useAcoesDisputa } from "./disputa-comum";
import FichaEdital from "./FichaEdital";
import RoteiroDisputa from "./RoteiroDisputa";
import RegistroLances from "./RegistroLances";
import ContratoPainel from "./ContratoPainel";
import PrecoReferencia from "./PrecoReferencia";
import RecursoPainel from "./RecursoPainel";
import CopiarLink from "./CopiarLink";
import { TOM_STATUS } from "./tons";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { StatusDot } from "./ui/status-dot";
import { Aviso } from "./ui/aviso";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export type AbaDisputa = "resumo" | "edital" | "preco" | "roteiro" | "lances" | "contrato" | "recurso";

/**
 * A página de uma licitação: o cabeçalho com os fatos e as ações, e o resto
 * em abas. Cada aba responde uma pergunta; nada fica empilhado na tela.
 */
export default function DisputaDetalhe({
  inicial,
  fichaInicial,
  cofre,
  resultadoInicial,
  contratoInicial,
  comOutro,
  abaInicial,
}: {
  inicial: DisputaCompleta;
  fichaInicial: FichaRow | null;
  cofre: DocumentoResumo[];
  resultadoInicial: ResultadoDisputa | null;
  contratoInicial: ContratoDisputa | null;
  comOutro: string | null;
  abaInicial?: AbaDisputa;
}) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [ficha, setFicha] = useState(fichaInicial);
  const [resultado, setResultado] = useState(resultadoInicial);
  const [contrato, setContrato] = useState(contratoInicial);
  const [lendo, setLendo] = useState(false);
  const [notas, setNotas] = useState(d.notas_operador ?? "");
  // `agora` congelado no carregamento, para servidor e navegador concordarem.
  const [agora] = useState(() => Date.now());

  const l = d.licitacao;
  const nomeCliente = d.cliente.nome_fantasia || d.cliente.razao_social;
  const objeto = limparObjeto(l.objeto);
  const local = [l.municipio, l.uf].filter(Boolean).join("/");
  const linkEdital = l.link_pncp ?? l.link_sistema_origem;

  function atualizar(campos: Partial<DisputaCompleta>) {
    setD((x) => ({ ...x, ...campos }));
    router.refresh();
  }

  const a = useAcoesDisputa(d, { temFicha: !!ficha, aoMudar: atualizar });

  // Abas que fazem sentido nesta etapa.
  const abas: { id: AbaDisputa; rotulo: string; icone: React.ReactNode }[] = [
    { id: "resumo", rotulo: "Resumo", icone: <Sparkles /> },
    { id: "edital", rotulo: "Análise do edital", icone: <FileText /> },
  ];
  if (l.valor_estimado) abas.push({ id: "preco", rotulo: "Preço de referência", icone: <TrendingDown /> });
  if (ETAPAS_COM_GUIA.includes(d.status)) abas.push({ id: "roteiro", rotulo: "Roteiro", icone: <BookOpen /> });
  if ((ETAPAS_COM_RESULTADO as readonly string[]).includes(d.status))
    abas.push({ id: "lances", rotulo: "Lances", icone: <Gavel /> });
  if (d.status === "ganhou") abas.push({ id: "contrato", rotulo: "Contrato", icone: <FileCheck2 /> });
  if (["em_disputa", "ganhou", "perdeu"].includes(d.status))
    abas.push({ id: "recurso", rotulo: "Recurso", icone: <Scale /> });
  const [aba, setAba] = useState<AbaDisputa>(
    abaInicial && abas.some((x) => x.id === abaInicial) ? abaInicial : "resumo"
  );

  const editalMudou =
    !!ficha?.versao_pncp && !!l.data_atualizacao_pncp && new Date(l.data_atualizacao_pncp) > new Date(ficha.versao_pncp);
  const pendencias =
    a.podeEnviar && ficha
      ? pendenciasHabilitacao(
          checklistHabilitacao(
            ficha.ficha.documentos_exigidos,
            cofre,
            dataDaSessao(ficha.ficha.sessao.data_hora) ?? l.data_encerramento_proposta
          )
        )
      : null;

  async function lerEdital() {
    setLendo(true);
    a.setSaida(null);
    try {
      const s = await lerEditalAcao(d.id);
      a.setSaida({ ok: s.ok, mensagem: s.mensagem });
      if (s.ficha) {
        setFicha(s.ficha);
        setAba("edital");
      }
    } catch (e) {
      a.setSaida({ ok: false, mensagem: (e as Error).message });
    } finally {
      setLendo(false);
    }
  }

  function analiseRapida() {
    a.rodar(
      () => analisar(d.id),
      (s) => {
        const an = (s as typeof s & { analise?: DisputaCompleta["analise_ia"] }).analise;
        if (an) setD((x) => ({ ...x, analise_ia: an }));
      }
    );
  }

  const botaoProfunda = (rotulo: string, variante: "default" | "outline" = "outline") => (
    <Button size="sm" variant={variante} disabled={lendo} onClick={lerEdital}>
      {lendo ? <Loader2 className="animate-spin" /> : ficha ? <RefreshCw /> : <FileSearch />}
      {lendo ? "Lendo o edital… (1 a 3 min)" : rotulo}
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho: o que é, de quem, quando fecha */}
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ArrowLeft className="size-4" />
          Mesa
        </Link>

        <div className="flex gap-4">
          <Prazo iso={l.data_encerramento_proposta} agora={agora} status={d.status} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 text-xs text-muted-foreground">{l.orgao_razao_social ?? "Órgão não informado"}</p>
              <Badge variant="secondary">{nomeCliente}</Badge>
              <StatusDot tom={TOM_STATUS[d.status]} pulsar={d.status === "em_disputa"}>
                {d.status === "sugerida" ? "Na triagem" : ROTULO_STATUS[d.status]}
              </StatusDot>
              {l.revisoes > 0 && (
                <StatusDot tom="alerta">Edital retificado {l.revisoes === 1 ? "uma vez" : `${l.revisoes} vezes`}</StatusDot>
              )}
            </div>
            <h1 className="text-xl font-semibold leading-snug tracking-tight">{objeto}</h1>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3 xl:grid-cols-6">
          <Fato rotulo="Valor estimado" num>
            {formatarValor(l.valor_estimado)}
          </Fato>
          <Fato rotulo="Local">{local || "—"}</Fato>
          <Fato rotulo="Modalidade">
            {l.modalidade_nome ?? "—"}
            {l.srp ? ", registro de preços" : ""}
          </Fato>
          <Fato rotulo="Propostas até" num>
            {formatarData(l.data_encerramento_proposta)}
          </Fato>
          <Fato rotulo="Aderência" num title={d.termos_encontrados.join(", ")}>
            {d.score}
          </Fato>
          <Fato rotulo="Preço mínimo do cliente" num>
            {d.preco_minimo != null ? formatarValor(d.preco_minimo) : "—"}
          </Fato>
        </dl>

        {d.notas_cliente && (
          <p className="text-sm italic text-muted-foreground">Cliente: “{d.notas_cliente}”</p>
        )}
        {d.status === "recusada" && d.motivo_recusa && <Aviso tom="erro">Recusou: “{d.motivo_recusa}”</Aviso>}
        {comOutro && (
          <Aviso tom="alerta">
            Esta licitação já está com <b>{comOutro}</b>. Um cliente por licitação.
          </Aviso>
        )}

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {a.podeEnviar && (
            <Button size="sm" disabled={a.pendente || lendo || comOutro != null} onClick={a.enviar}>
              <Send />
              {d.status === "recusada" ? "Reenviar ao cliente" : "Enviar ao cliente"}
            </Button>
          )}
          {a.proximoPasso && a.botaoEtapa(a.proximoPasso, "default")}
          {["proposta_enviada", "em_disputa", "ganhou"].includes(d.status) && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/disputas/${d.id}/proposta`}>
                <FileSpreadsheet />
                Proposta ajustada
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer />
            Salvar PDF
          </Button>
          {linkEdital && (
            <Button size="sm" variant="ghost" asChild>
              <a href={linkEdital} target="_blank" rel="noreferrer">
                <ExternalLink />
                Abrir edital
              </a>
            </Button>
          )}
          <span className="flex-1" />
          {a.destinos
            .filter((para) => para !== a.proximoPasso)
            .map((para) => a.botaoEtapa(para, ["descartada", "desistiu", "perdeu"].includes(para) ? "ghost" : "outline"))}
        </div>

        {a.saida && (
          <Aviso tom={a.saida.ok ? "sucesso" : "erro"} className="print:hidden">
            <p>{a.saida.mensagem}</p>
            {a.saida.link && <CopiarLink link={a.saida.link} />}
          </Aviso>
        )}

        {editalMudou && (
          <Aviso tom="alerta" className="print:hidden">
            O edital foi retificado no PNCP depois da leitura. Faça a análise do edital de novo.
          </Aviso>
        )}

        <Etapas status={d.status} />

        {a.podeEnviar && (
          <AntesDeEnviar
            passos={[
              { feito: !!d.analise_ia, rotulo: "Análise rápida", acao: () => setAba("resumo") },
              { feito: !!ficha, rotulo: "Análise do edital", acao: () => setAba("edital") },
              {
                feito: !!pendencias && pendencias.total === 0,
                rotulo: !ficha
                  ? "Documentos do cofre"
                  : pendencias && pendencias.total > 0
                    ? `Documentos do cofre (${pendencias.total} pendente${pendencias.total === 1 ? "" : "s"})`
                    : "Documentos do cofre em dia",
                acao: () => setAba("edital"),
              },
              { feito: false, rotulo: "Enviar ao cliente" },
            ]}
          />
        )}
      </div>

      {/* Abas (na tela) */}
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaDisputa)} className="space-y-4 print:hidden">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            {abas.map((x) => (
              <TabsTrigger key={x.id} value={x.id} className="[&_svg]:size-3.5">
                {x.icone}
                {x.rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="resumo" className="space-y-4">
          <Painel>
            {d.analise_ia ? (
              <div className="space-y-4">
                <Analise a={d.analise_ia} />
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={a.pendente} onClick={analiseRapida}>
                  {a.pendente ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Refazer análise rápida
                </Button>
              </div>
            ) : (
              <Chamada
                titulo="Análise rápida"
                texto="A IA lê os dados publicados no PNCP e diz se vale a pena, o que pedem e os riscos. Leva segundos."
              >
                <Button size="sm" variant="outline" disabled={a.pendente} onClick={analiseRapida}>
                  {a.pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {a.pendente ? "Analisando…" : "Fazer análise rápida"}
                </Button>
              </Chamada>
            )}
          </Painel>

          {!ficha && (
            <Painel>
              <Chamada
                titulo="Análise do edital"
                texto="Para ver documentos exigidos, atestados, data da sessão e prazos, a IA precisa ler o edital inteiro."
              >
                {botaoProfunda("Fazer análise profunda")}
              </Chamada>
            </Painel>
          )}

          {!["sugerida", "descartada"].includes(d.status) && (
            <Painel>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Notas internas</span>
                <Textarea
                  rows={3}
                  placeholder="O cliente não vê."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  onBlur={() => {
                    if (notas !== (d.notas_operador ?? "")) {
                      a.rodar(
                        () => salvarNotas(d.id, notas),
                        () => setD((x) => ({ ...x, notas_operador: notas }))
                      );
                    }
                  }}
                />
              </label>
            </Painel>
          )}
        </TabsContent>

        <TabsContent value="edital" className="space-y-4">
          {ficha ? (
            <>
              <FichaEdital
                linha={ficha}
                cofre={cofre}
                encerramento={l.data_encerramento_proposta}
                nomeCliente={nomeCliente}
                editalMudouDepois={editalMudou}
              />
              <div className="flex flex-wrap items-center gap-3">
                {botaoProfunda("Ler o edital de novo")}
                <span className="text-xs text-muted-foreground">Lido em {formatarData(ficha.gerado_em)}</span>
              </div>
            </>
          ) : (
            <Painel>
              <Chamada
                titulo="Análise profunda"
                texto="A IA baixa o edital e os anexos do PNCP e lê tudo: documentos de habilitação, atestados, data e plataforma da sessão, prazos, exigências da proposta e o que dá para contestar. Leva de 1 a 3 minutos."
              >
                {botaoProfunda("Fazer análise profunda", "default")}
              </Chamada>
            </Painel>
          )}
        </TabsContent>

        {abas.some((x) => x.id === "preco") && (
          <TabsContent value="preco">
            <PrecoReferencia d={d} />
          </TabsContent>
        )}
        {abas.some((x) => x.id === "roteiro") && (
          <TabsContent value="roteiro">
            <RoteiroDisputa d={d} ficha={ficha} />
          </TabsContent>
        )}
        {abas.some((x) => x.id === "lances") && (
          <TabsContent value="lances">
            <RegistroLances d={d} inicial={resultado} salvo={setResultado} />
          </TabsContent>
        )}
        {abas.some((x) => x.id === "contrato") && (
          <TabsContent value="contrato">
            <ContratoPainel d={d} inicial={contrato} valorPadrao={resultado?.nosso_lance ?? null} salvo={setContrato} />
          </TabsContent>
        )}
        {abas.some((x) => x.id === "recurso") && (
          <TabsContent value="recurso">
            <RecursoPainel d={d} />
          </TabsContent>
        )}
      </Tabs>

      {/* Relatório (só no PDF): o que foi analisado, tudo em sequência */}
      <div className="hidden space-y-6 print:block">
        <p className="text-xs text-muted-foreground">
          Relatório da Licitação Master · gerado em {formatarData(new Date(agora).toISOString())}
        </p>
        {d.analise_ia && (
          <section className="space-y-2">
            <Analise a={d.analise_ia} />
          </section>
        )}
        {ficha && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Análise do edital</h2>
            <FichaEdital
              linha={ficha}
              cofre={cofre}
              encerramento={l.data_encerramento_proposta}
              nomeCliente={nomeCliente}
              editalMudouDepois={editalMudou}
            />
          </section>
        )}
        {!d.analise_ia && !ficha && <p className="text-sm">Nenhuma análise feita ainda.</p>}
      </div>

      {a.dialogo}
    </div>
  );
}

/** As etapas da licitação, com a atual destacada: mostra quanto já andou. */
const ETAPAS: { rotulo: string; status: DisputaCompleta["status"][] }[] = [
  { rotulo: "Triagem", status: ["sugerida"] },
  { rotulo: "Com o cliente", status: ["aguardando_cliente", "recusada"] },
  { rotulo: "Preparação", status: ["aprovada", "em_preparacao"] },
  { rotulo: "Proposta enviada", status: ["proposta_enviada"] },
  { rotulo: "Sessão", status: ["em_disputa"] },
  { rotulo: "Resultado", status: ["ganhou", "perdeu", "desistiu"] },
];

function Etapas({ status }: { status: DisputaCompleta["status"] }) {
  const atual = ETAPAS.findIndex((e) => e.status.includes(status));
  if (atual < 0) return null; // descartada
  return (
    <div className="space-y-2 print:hidden">
      <div className="text-xs text-muted-foreground">
        <span>
          Etapa <b className="num font-semibold text-foreground">{atual + 1}</b> de {ETAPAS.length}
        </span>
      </div>
      <ol className="grid grid-cols-6 gap-1.5" aria-label="Etapas da licitação">
        {ETAPAS.map((e, i) => (
          <li key={e.rotulo} className="space-y-1.5" aria-current={i === atual ? "step" : undefined}>
            <span
              className={cn(
                "block h-1.5 rounded-full",
                i < atual ? "bg-primary/60" : i === atual ? "bg-primary" : "bg-muted"
              )}
            />
            <span
              className={cn(
                "hidden text-xs sm:block",
                i === atual ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {e.rotulo}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Na triagem: o que fazer antes de enviar, com a contagem do que já foi feito. */
function AntesDeEnviar({ passos }: { passos: { feito: boolean; rotulo: string; acao?: () => void }[] }) {
  const feitos = passos.filter((p) => p.feito).length;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center print:hidden">
      <p className="shrink-0 text-sm font-medium">
        Antes de enviar{" "}
        <span className="num font-normal text-muted-foreground">
          · {feitos} de {passos.length}
        </span>
      </p>
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {passos.map((p) => {
          const conteudo = (
            <>
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border text-[0.625rem]",
                  p.feito ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                )}
                aria-hidden
              >
                {p.feito ? "✓" : ""}
              </span>
              <span className={p.feito ? "text-muted-foreground" : ""}>{p.rotulo}</span>
            </>
          );
          return (
            <li key={p.rotulo}>
              {p.acao && !p.feito ? (
                <button type="button" onClick={p.acao} className="inline-flex items-center gap-2 hover:underline">
                  {conteudo}
                </button>
              ) : (
                <span className="inline-flex items-center gap-2">{conteudo}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Painel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-card p-4 sm:p-5", className)}>{children}</div>;
}

function Chamada({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{texto}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
