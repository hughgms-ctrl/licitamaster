"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  ExternalLink,
  FileSearch,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { procurarAgora } from "@/app/filtros/acoes";
import type { AnaliseIA, DisputaCompleta, StatusDisputa } from "@/lib/db";
import { ROTULO_STATUS, TRANSICOES_OPERADOR } from "@/lib/etapas";
import { formatarData, formatarValor, limparObjeto } from "@/lib/formato";
import { analisar, enviarAoCliente, lerEditalAcao, mudarStatus, salvarNotas, type Saida } from "@/app/acoes";
import type { FichaRow } from "@/lib/ficha";
import type { DocumentoResumo } from "@/lib/documentos";
import { cn } from "@/lib/utils";
import FichaEdital from "./FichaEdital";
import RoteiroDisputa from "./RoteiroDisputa";
import { ETAPAS_COM_GUIA } from "@/lib/guia";
import CopiarLink from "./CopiarLink";
import { Cabecalho } from "./Cabecalho";
import { TOM_STATUS } from "./tons";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
import { StatusDot } from "./ui/status-dot";
import { StatStrip } from "./ui/stat-strip";
import { Aviso } from "./ui/aviso";
import { Vazio } from "./ui/vazio";
import { useConfirmar } from "./ui/confirmar";

/**
 * As abas seguem o caminho da disputa. Cada uma é uma pergunta diferente:
 *   Triagem      — isto serve para algum cliente?
 *   Com o cliente — ele já respondeu?
 *   Preparação   — a proposta e a habilitação estão prontas?
 *   Disputa      — como está a sessão?
 *   Resultado    — o que ganhamos e perdemos (últimos 30 dias)
 */
const ABAS: { id: string; rotulo: string; status: StatusDisputa[] }[] = [
  { id: "triagem", rotulo: "Triagem", status: ["sugerida"] },
  { id: "cliente", rotulo: "Com o cliente", status: ["aguardando_cliente", "recusada"] },
  { id: "preparacao", rotulo: "Preparação", status: ["aprovada", "em_preparacao"] },
  { id: "disputa", rotulo: "Disputa", status: ["proposta_enviada", "em_disputa"] },
  { id: "resultado", rotulo: "Resultado", status: ["ganhou", "perdeu", "desistiu"] },
  { id: "descartadas", rotulo: "Descartadas", status: ["descartada"] },
];

/** Uma linha sobre o que fazer em cada aba. */
const AJUDA_ABA: Record<string, string> = {
  triagem: "O que a coleta encontrou para os perfis dos clientes. Analise e envie ao cliente só o que vale a pena.",
  cliente: "Esperando o cliente decidir no portal. Ele recebeu o link pelo WhatsApp.",
  preparacao: "Aprovadas com preço mínimo. Monte a proposta e confira a habilitação.",
  disputa: "Propostas enviadas e sessões em andamento.",
  resultado: "Resultados dos últimos 30 dias.",
  descartadas: "O que você tirou da triagem nos últimos 30 dias.",
};

/** Rótulo do botão que leva a cada etapa. */
const ACAO_PARA: Partial<Record<StatusDisputa, string>> = {
  descartada: "Descartar",
  sugerida: "Voltar para a triagem",
  em_preparacao: "Começar preparação",
  proposta_enviada: "Proposta enviada",
  em_disputa: "Sessão aberta",
  ganhou: "Ganhou",
  perdeu: "Perdeu",
  desistiu: "Desistir",
};

type AvisoMesa = Saida & { titulo: string };

/**
 * Resultado de ações que tiram a licitação da aba atual (enviar, mudar de
 * etapa). Não pode morar no item: o item some da lista no mesmo instante, e
 * junto sumiria a mensagem — inclusive o link do portal quando o WhatsApp
 * não saiu, que é a única forma de chegar ao cliente. Com link, o aviso fica
 * na tela até ser fechado.
 */
function avisar(a: AvisoMesa) {
  const corpo = (
    <div className="space-y-2">
      <p>{a.mensagem}</p>
      {a.link && <CopiarLink link={a.link} />}
    </div>
  );
  const opcoes = { description: corpo, duration: a.link ? Infinity : 6000, closeButton: true };
  if (a.ok) toast.success(a.titulo, opcoes);
  else toast.error(a.titulo, opcoes);
}

interface Props {
  disputas: DisputaCompleta[];
  clientes: { id: string; nome: string }[];
  /** licitação → nome do cliente que está com ela */
  exclusivas: Record<string, string>;
  ultimaColeta: { finalizado_em: string | null; erro: string | null } | null;
  /** licitação → ficha do edital já lida */
  fichas: Record<string, FichaRow>;
  /** cliente → documentos do cofre */
  cofres: Record<string, DocumentoResumo[]>;
}

export default function Mesa({ disputas: iniciais, clientes, exclusivas, ultimaColeta, fichas, cofres }: Props) {
  const [disputas, setDisputas] = useState(iniciais);
  // Depois de "Buscar agora" a página recarrega os dados do servidor; sem
  // isto a lista continuaria mostrando o estado de antes da busca.
  useEffect(() => setDisputas(iniciais), [iniciais]);
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const [aba, setAba] = useState("triagem");
  const [cliente, setCliente] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  // `agora` congelado no carregamento: recalcular a cada render faria o
  // servidor e o navegador discordarem e o React reclamar de hidratação.
  const [agora] = useState(() => Date.now());

  const porAba = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const a of ABAS) {
      contagem[a.id] = disputas.filter(
        (d) => a.status.includes(d.status) && (cliente === "todos" || d.cliente_id === cliente)
      ).length;
    }
    return contagem;
  }, [disputas, cliente]);

  const visiveis = useMemo(() => {
    const status = ABAS.find((a) => a.id === aba)!.status;
    const termo = busca
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    return disputas.filter((d) => {
      if (!status.includes(d.status)) return false;
      if (cliente !== "todos" && d.cliente_id !== cliente) return false;
      if (!termo) return true;
      const texto = [d.licitacao.objeto, d.licitacao.orgao_razao_social, d.licitacao.municipio]
        .join(" ")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      return texto.includes(termo);
    });
  }, [disputas, aba, cliente, busca]);

  // Para o resumo do topo: o que fecha em 48h na triagem pede atenção hoje.
  const urgentes = useMemo(
    () =>
      disputas.filter((d) => {
        if (!["sugerida", "aguardando_cliente", "aprovada", "em_preparacao"].includes(d.status)) return false;
        if (cliente !== "todos" && d.cliente_id !== cliente) return false;
        const iso = d.licitacao.data_encerramento_proposta;
        if (!iso) return false;
        const h = (new Date(iso).getTime() - agora) / 36e5;
        return h >= 0 && h < 48;
      }).length,
    [disputas, cliente, agora]
  );

  function atualizar(id: string, campos: Partial<DisputaCompleta>) {
    setDisputas((xs) => xs.map((d) => (d.id === id ? { ...d, ...campos } : d)));
  }

  const horasDesdeColeta = ultimaColeta?.finalizado_em
    ? (agora - new Date(ultimaColeta.finalizado_em).getTime()) / 36e5
    : null;
  const coletaParada = horasDesdeColeta == null || horasDesdeColeta > 3;

  const filtrando = busca !== "" || cliente !== "todos";

  return (
    <>
      <Cabecalho
        titulo="Mesa"
        sub={
          <StatusDot tom={ultimaColeta?.erro ? "perigo" : coletaParada ? "alerta" : "sucesso"}>
            {ultimaColeta?.finalizado_em
              ? `Última coleta ${formatarData(ultimaColeta.finalizado_em)}`
              : "Nenhuma coleta ainda"}
            {ultimaColeta?.erro ? ", com erros" : coletaParada && ultimaColeta?.finalizado_em ? ", parada há mais de 3h" : ""}
          </StatusDot>
        }
        acoes={
          <Button
            disabled={buscando}
            onClick={async () => {
              setBuscando(true);
              try {
                const r = await procurarAgora();
                avisar({ ok: r.ok, mensagem: r.mensagem, titulo: "Busca no PNCP" });
                router.refresh();
              } catch (e) {
                avisar({ ok: false, mensagem: (e as Error).message, titulo: "Busca no PNCP" });
              } finally {
                setBuscando(false);
              }
            }}
          >
            {buscando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {buscando ? "Buscando no PNCP…" : "Buscar agora"}
          </Button>
        }
      />

      <StatStrip
        className="mb-6"
        itens={[
          { rotulo: "Na triagem", valor: porAba.triagem },
          {
            rotulo: "Fecham em 48h",
            valor: urgentes,
            tom: urgentes > 0 ? "alerta" : undefined,
            detalhe: "triagem até preparação",
          },
          { rotulo: "Com o cliente", valor: porAba.cliente },
          { rotulo: "Em preparação", valor: porAba.preparacao },
          { rotulo: "Em disputa", valor: porAba.disputa },
          {
            rotulo: "Ganhas em 30 dias",
            valor: disputas.filter((d) => d.status === "ganhou" && (cliente === "todos" || d.cliente_id === cliente)).length,
            tom: "sucesso",
          },
        ]}
      />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div role="tablist" aria-label="Etapas" className="-mx-1 flex overflow-x-auto px-1 pb-1 xl:pb-0">
          <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
            {ABAS.map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  aba === a.id && "bg-card text-foreground shadow-sm dark:bg-accent dark:shadow-none"
                )}
              >
                {a.rotulo}
                <span
                  className={cn(
                    "num rounded px-1.5 text-xs",
                    aba === a.id ? "bg-primary/10 text-primary dark:text-sidebar-primary" : "text-muted-foreground"
                  )}
                >
                  {porAba[a.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect
            aria-label="Cliente"
            className="sm:w-56"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
          >
            <option value="todos">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </NativeSelect>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Buscar"
              placeholder="Objeto, órgão ou cidade"
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">{AJUDA_ABA[aba]}</p>

      {visiveis.length === 0 ? (
        filtrando ? (
          <Vazio icone={Search} titulo="Nada com esses filtros.">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBusca("");
                setCliente("todos");
              }}
            >
              <X />
              Limpar filtros
            </Button>
          </Vazio>
        ) : aba === "triagem" ? (
          <Vazio icone={Inbox} titulo="Triagem em dia.">
            <p>
              Novas licitações chegam a cada coleta. Se a triagem fica vazia por dias, os perfis de busca
              dos clientes estão estreitos demais.
            </p>
          </Vazio>
        ) : (
          <Vazio icone={Inbox} titulo="Nada nesta etapa agora." />
        )
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {visiveis.map((d) => (
            <Item
              key={d.id}
              d={d}
              agora={agora}
              comOutro={
                exclusivas[d.licitacao_id] &&
                !["aguardando_cliente", "aprovada", "em_preparacao", "proposta_enviada", "em_disputa", "ganhou"].includes(d.status)
                  ? exclusivas[d.licitacao_id]
                  : null
              }
              atualizar={atualizar}
              fichaInicial={fichas[d.licitacao_id] ?? null}
              cofre={cofres[d.cliente_id] ?? []}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Item({
  fichaInicial,
  cofre,
  d,
  agora,
  comOutro,
  atualizar,
}: {
  d: DisputaCompleta;
  agora: number;
  /** nome do outro cliente que já está com esta licitação, se houver */
  comOutro: string | null;
  atualizar: (id: string, campos: Partial<DisputaCompleta>) => void;
  fichaInicial: FichaRow | null;
  cofre: DocumentoResumo[];
}) {
  const [pendente, iniciar] = useTransition();
  const [saida, setSaida] = useState<Saida | null>(null);
  const [abrirAnalise, setAbrirAnalise] = useState(false);
  const [ficha, setFicha] = useState<FichaRow | null>(fichaInicial);
  const [abrirFicha, setAbrirFicha] = useState(false);
  const [abrirGuia, setAbrirGuia] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [notas, setNotas] = useState(d.notas_operador ?? "");
  const [confirmar, dialogo] = useConfirmar();
  const l = d.licitacao;
  const nomeCliente = d.cliente.nome_fantasia || d.cliente.razao_social;

  function rodar(fn: () => Promise<Saida>, depois?: (s: Saida) => void) {
    setSaida(null);
    iniciar(async () => {
      try {
        const s = await fn();
        setSaida(s);
        if (s.ok) depois?.(s);
      } catch (e) {
        setSaida({ ok: false, mensagem: (e as Error).message });
      }
    });
  }

  const destinos = TRANSICOES_OPERADOR[d.status];
  const podeEnviar = d.status === "sugerida" || d.status === "recusada";
  // O passo adiante desta etapa ganha o destaque; voltar e desistir ficam discretos.
  const proximoPasso = destinos.find((x) => !["descartada", "desistiu", "perdeu", "sugerida"].includes(x));

  const prazo = calcularPrazo(l.data_encerramento_proposta, agora, d.status);
  const local = [l.municipio, l.uf].filter(Boolean).join("/");

  return (
    <article className="flex gap-4 p-4 sm:p-5">
      <div
        className={cn(
          "flex w-14 shrink-0 flex-col sm:w-[4.5rem] items-center justify-center self-start rounded-md border px-1 py-2 text-center",
          prazo.nivel === "critico" && "border-destructive/30 bg-destructive/10 text-destructive",
          prazo.nivel === "atencao" && "border-warning/30 bg-warning/10 text-warning",
          prazo.nivel === "ok" && "border-success/25 bg-success/10 text-success",
          prazo.nivel === "neutro" && "bg-muted/60 text-muted-foreground"
        )}
        title={formatarData(l.data_encerramento_proposta)}
      >
        <span className="num text-lg font-semibold leading-none tracking-tight">{prazo.num}</span>
        <span className="mt-1 text-[0.6875rem] leading-tight opacity-80">{prazo.rot}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{l.orgao_razao_social ?? "Órgão não informado"}</p>
            <Badge variant="secondary">{nomeCliente}</Badge>
            {d.status !== "sugerida" && (
              <StatusDot tom={TOM_STATUS[d.status]} pulsar={d.status === "em_disputa"}>
                {ROTULO_STATUS[d.status]}
              </StatusDot>
            )}
            {l.revisoes > 0 && (
              <StatusDot tom="alerta">Edital retificado {l.revisoes === 1 ? "uma vez" : `${l.revisoes} vezes`}</StatusDot>
            )}
          </div>
          <p className="line-clamp-3 text-[0.9375rem] font-medium leading-snug">{limparObjeto(l.objeto)}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 xl:grid-cols-5">
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
            <span className="inline-flex items-center gap-2">
              {d.score}
              <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    d.score >= 60 ? "bg-success" : d.score >= 35 ? "bg-warning" : "bg-muted-foreground/50"
                  )}
                  style={{ width: `${Math.min(100, d.score)}%` }}
                />
              </span>
            </span>
          </Fato>
        </dl>

        {(d.preco_minimo != null || (d.status === "recusada" && d.motivo_recusa) || comOutro) && (
          <div className="space-y-2">
            {d.preco_minimo != null && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Preço mínimo do cliente</span>
                <b className="num font-semibold">{formatarValor(d.preco_minimo)}</b>
                {l.valor_estimado && l.valor_estimado > 0 && (
                  <span className="num text-xs text-muted-foreground">
                    {Math.round((d.preco_minimo / l.valor_estimado) * 100)}% do estimado
                  </span>
                )}
                {d.notas_cliente && <span className="basis-full italic text-muted-foreground">“{d.notas_cliente}”</span>}
              </div>
            )}
            {d.status === "recusada" && d.motivo_recusa && (
              <Aviso tom="erro">Recusou: “{d.motivo_recusa}”</Aviso>
            )}
            {comOutro && (
              <Aviso tom="alerta">
                Esta licitação já está com <b>{comOutro}</b>. Um cliente por licitação.
              </Aviso>
            )}
          </div>
        )}

        {abrirGuia && <RoteiroDisputa d={d} ficha={ficha} />}
        {abrirAnalise && d.analise_ia && <Analise a={d.analise_ia} />}
        {abrirFicha && ficha && (
          <FichaEdital
            linha={ficha}
            cofre={cofre}
            encerramento={d.licitacao.data_encerramento_proposta}
            nomeCliente={nomeCliente}
            editalMudouDepois={
              !!ficha.versao_pncp &&
              !!d.licitacao.data_atualizacao_pncp &&
              new Date(d.licitacao.data_atualizacao_pncp) > new Date(ficha.versao_pncp)
            }
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {podeEnviar && (
            <Button
              size="sm"
              disabled={pendente || comOutro != null}
              title={comOutro ? `Já está com ${comOutro}` : undefined}
              onClick={() =>
                rodar(
                  () => enviarAoCliente(d.id),
                  (s) => {
                    avisar({ ...s, titulo: limparObjeto(l.objeto).slice(0, 90) });
                    atualizar(d.id, { status: "aguardando_cliente" });
                  }
                )
              }
            >
              <Send />
              {d.status === "recusada" ? "Reenviar ao cliente" : "Enviar ao cliente"}
            </Button>
          )}

          {destinos
            .filter((para) => !podeEnviar && para === proximoPasso)
            .map((para) => (
              botaoEtapa(para, "default")
            ))}

          <Button
            size="sm"
            variant="outline"
            disabled={pendente}
            aria-expanded={d.analise_ia ? abrirAnalise : undefined}
            onClick={() =>
              d.analise_ia
                ? setAbrirAnalise((x) => !x)
                : rodar(
                    () => analisar(d.id),
                    (s) => {
                      const a = (s as Saida & { analise?: AnaliseIA }).analise;
                      if (a) atualizar(d.id, { analise_ia: a });
                      setAbrirAnalise(true);
                    }
                  )
            }
          >
            {pendente && !d.analise_ia ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {d.analise_ia
              ? abrirAnalise
                ? "Fechar análise"
                : `Análise: ${rotuloVeredito(d.analise_ia.veredito)}`
              : pendente
                ? "Analisando…"
                : "Analisar com IA"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={lendo}
            aria-expanded={ficha ? abrirFicha : undefined}
            onClick={async () => {
              if (ficha) return setAbrirFicha((x) => !x);
              setLendo(true);
              setSaida(null);
              try {
                const s = await lerEditalAcao(d.id);
                setSaida({ ok: s.ok, mensagem: s.mensagem });
                if (s.ficha) {
                  setFicha(s.ficha);
                  setAbrirFicha(true);
                }
              } catch (e) {
                setSaida({ ok: false, mensagem: (e as Error).message });
              } finally {
                setLendo(false);
              }
            }}
          >
            {lendo ? <Loader2 className="animate-spin" /> : ficha ? <FileText /> : <FileSearch />}
            {lendo
              ? "Lendo o edital… (1 a 3 min)"
              : ficha
                ? abrirFicha
                  ? "Fechar ficha"
                  : "Ficha do edital"
                : "Ler edital"}
          </Button>

          {ETAPAS_COM_GUIA.includes(d.status) && (
            <Button size="sm" variant="outline" aria-expanded={abrirGuia} onClick={() => setAbrirGuia((x) => !x)}>
              <BookOpen />
              {abrirGuia ? "Fechar roteiro" : "Roteiro da disputa"}
            </Button>
          )}

          {(l.link_pncp || l.link_sistema_origem) && (
            <Button size="sm" variant="ghost" asChild>
              <a href={l.link_pncp ?? l.link_sistema_origem!} target="_blank" rel="noreferrer">
                <ExternalLink />
                Abrir edital
              </a>
            </Button>
          )}

          <span className="flex-1" />

          {destinos
            .filter((para) => podeEnviar || para !== proximoPasso)
            .map((para) => (
              botaoEtapa(para, ["descartada", "desistiu", "perdeu"].includes(para) ? "ghost" : "outline")
            ))}
        </div>

        {saida && (
          <Aviso tom={saida.ok ? "sucesso" : "erro"}>
            <p>{saida.mensagem}</p>
            {saida.link && <CopiarLink link={saida.link} />}
          </Aviso>
        )}

        {!["sugerida", "descartada"].includes(d.status) && (
          <Textarea
            rows={2}
            className="min-h-0 bg-muted/40 text-sm dark:bg-muted/40"
            aria-label="Notas internas"
            placeholder="Notas internas. O cliente não vê."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => {
              if (notas !== (d.notas_operador ?? "")) {
                rodar(
                  () => salvarNotas(d.id, notas),
                  () => atualizar(d.id, { notas_operador: notas })
                );
              }
            }}
          />
        )}
      </div>
      {dialogo}
    </article>
  );

  function botaoEtapa(para: StatusDisputa, variante: "default" | "outline" | "ghost") {
    return (
      <Button
        key={para}
        size="sm"
        variant={variante}
        className={cn(variante === "ghost" && "text-muted-foreground")}
        disabled={pendente}
        onClick={async () => {
          if (
            para === "desistiu" &&
            !(await confirmar({
              titulo: "Desistir desta disputa?",
              texto:
                "Se a proposta já foi enviada, desistir pode gerar penalidade ao cliente. Confira o edital.",
              confirmar: "Desistir",
              destrutivo: true,
            }))
          )
            return;
          rodar(
            () => mudarStatus(d.id, para),
            () => {
              avisar({
                ok: true,
                mensagem: para === "sugerida" ? "Voltou para a triagem." : `Movida para "${ROTULO_STATUS[para]}".`,
                titulo: limparObjeto(l.objeto).slice(0, 90),
              });
              atualizar(d.id, { status: para });
            }
          );
        }}
      >
        {d.status === "aguardando_cliente" && para === "sugerida"
          ? "Cancelar envio"
          : (ACAO_PARA[para] ?? ROTULO_STATUS[para])}
      </Button>
    );
  }
}

function Fato({
  rotulo,
  children,
  num,
  title,
}: {
  rotulo: string;
  children: React.ReactNode;
  num?: boolean;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("font-medium sm:truncate", num && "num")}>{children}</dd>
    </div>
  );
}

/**
 * A coluna de prazo. Antes da proposta, conta o tempo que resta; depois, a
 * contagem não serve para nada e o espaço mostra onde a disputa está.
 */
function calcularPrazo(
  iso: string | null,
  agora: number,
  status: StatusDisputa
): { num: string; rot: string; nivel: "critico" | "atencao" | "ok" | "neutro" } {
  if (status === "ganhou") return { num: "✓", rot: "ganhou", nivel: "ok" };
  const posProposta = ["proposta_enviada", "em_disputa", "perdeu", "desistiu"].includes(status);
  if (posProposta) return { num: "—", rot: "proposta enviada", nivel: "neutro" };
  if (!iso) return { num: "—", rot: "sem prazo", nivel: "neutro" };
  const horas = (new Date(iso).getTime() - agora) / 36e5;
  if (horas < 0) return { num: "—", rot: "prazo fechou", nivel: "neutro" };
  if (horas < 1) {
    return { num: `${Math.max(1, Math.round(horas * 60))}min`, rot: "para fechar", nivel: "critico" };
  }
  if (horas < 48) {
    return { num: `${Math.floor(horas)}h`, rot: "para fechar", nivel: horas < 24 ? "critico" : "atencao" };
  }
  const dias = Math.floor(horas / 24);
  return { num: `${dias}d`, rot: "para fechar", nivel: dias < 3 ? "atencao" : "ok" };
}

function rotuloVeredito(v: AnaliseIA["veredito"]) {
  return v === "vale_a_pena" ? "vale a pena" : v === "nao_vale" ? "não vale" : "talvez";
}

function Analise({ a }: { a: AnaliseIA }) {
  const tom = a.veredito === "vale_a_pena" ? "sucesso" : a.veredito === "nao_vale" ? "perigo" : "alerta";
  return (
    <div className="space-y-4 rounded-md border bg-background/40 p-4 text-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <span className="font-medium">Análise da IA</span>
        <StatusDot tom={tom}>{rotuloVeredito(a.veredito)}</StatusDot>
      </div>
      <p className="leading-relaxed">{a.resumo}</p>
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground">O cliente vai ler</h4>
        <p className="leading-relaxed text-muted-foreground">{a.resumo_cliente}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Lista titulo="O que pedem" itens={a.o_que_pedem} />
        <Lista titulo="Riscos" itens={a.riscos} />
        <Lista titulo="Conferir no edital antes de enviar" itens={a.perguntas} />
      </div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">{titulo}</h4>
      <ul className="list-disc space-y-1 pl-4 leading-relaxed marker:text-muted-foreground/60">
        {itens.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
