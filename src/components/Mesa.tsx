"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, Inbox, Loader2, RefreshCw, Search, Send, Sparkles, X } from "lucide-react";
import { procurarAgora } from "@/app/filtros/acoes";
import { analisar } from "@/app/acoes";
import type { AnaliseIA, DisputaCompleta, StatusDisputa } from "@/lib/db";
import { ROTULO_STATUS } from "@/lib/etapas";
import { formatarData, formatarValor, limparObjeto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { avisar, Prazo, rotuloVeredito, tomVeredito, useAcoesDisputa } from "./disputa-comum";
import { Cabecalho } from "./Cabecalho";
import { TOM_STATUS } from "./tons";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { StatusDot } from "./ui/status-dot";
import { StatStrip } from "./ui/stat-strip";
import { Aviso } from "./ui/aviso";
import { Vazio } from "./ui/vazio";

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

interface Props {
  disputas: DisputaCompleta[];
  clientes: { id: string; nome: string }[];
  /** licitação → nome do cliente que está com ela */
  exclusivas: Record<string, string>;
  ultimaColeta: { finalizado_em: string | null; erro: string | null } | null;
  /** licitações com o edital já lido (análise profunda) */
  lidas: Record<string, true>;
  /** disputas com o resultado da sessão já registrado */
  comResultado: Record<string, true>;
}

export default function Mesa({ disputas: iniciais, clientes, exclusivas, ultimaColeta, lidas, comResultado }: Props) {
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
              temFicha={!!lidas[d.licitacao_id]}
              temResultado={!!comResultado[d.id]}
            />
          ))}
        </div>
      )}
    </>
  );
}


/**
 * Um card por licitação. Clicar abre a página dela; aqui fora ficam só os
 * atalhos: enviar ou o próximo passo, o resumo da análise rápida, o edital e
 * descartar.
 */
function Item({
  d,
  agora,
  comOutro,
  atualizar,
  temFicha,
  temResultado,
}: {
  d: DisputaCompleta;
  agora: number;
  /** nome do outro cliente que já está com esta licitação, se houver */
  comOutro: string | null;
  atualizar: (id: string, campos: Partial<DisputaCompleta>) => void;
  temFicha: boolean;
  temResultado: boolean;
}) {
  const [abrirResumo, setAbrirResumo] = useState(false);
  const a = useAcoesDisputa(d, { temFicha, aoMudar: (c) => atualizar(d.id, c) });
  const l = d.licitacao;
  const nomeCliente = d.cliente.nome_fantasia || d.cliente.razao_social;
  const linkEdital = l.link_pncp ?? l.link_sistema_origem;
  const fatos = [
    formatarValor(l.valor_estimado),
    [l.municipio, l.uf].filter(Boolean).join("/"),
    l.modalidade_nome,
    l.data_encerramento_proposta ? `até ${formatarData(l.data_encerramento_proposta)}` : null,
    `aderência ${d.score}`,
  ].filter(Boolean);

  function resumo() {
    if (d.analise_ia) return setAbrirResumo((x) => !x);
    a.rodar(
      () => analisar(d.id),
      (s) => {
        const an = (s as typeof s & { analise?: AnaliseIA }).analise;
        if (an) atualizar(d.id, { analise_ia: an });
        setAbrirResumo(true);
      }
    );
  }

  return (
    <article className="relative flex gap-4 p-4 transition-colors hover:bg-accent/40 sm:p-5">
      <Prazo iso={l.data_encerramento_proposta} agora={agora} status={d.status} />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="min-w-0 truncate text-xs text-muted-foreground">{l.orgao_razao_social ?? "Órgão não informado"}</p>
          <Badge variant="secondary">{nomeCliente}</Badge>
          {d.status !== "sugerida" && (
            <StatusDot tom={TOM_STATUS[d.status]} pulsar={d.status === "em_disputa"}>
              {ROTULO_STATUS[d.status]}
            </StatusDot>
          )}
          {d.analise_ia && <StatusDot tom={tomVeredito(d.analise_ia.veredito)}>{rotuloVeredito(d.analise_ia.veredito)}</StatusDot>}
          {temFicha && <StatusDot tom="neutro">edital lido</StatusDot>}
          {!temResultado && ["ganhou", "perdeu"].includes(d.status) && (
            <StatusDot tom="alerta">Lances não registrados</StatusDot>
          )}
          {l.revisoes > 0 && <StatusDot tom="alerta">Edital retificado</StatusDot>}
        </div>

        <Link
          href={`/disputas/${d.id}`}
          className="line-clamp-2 text-[0.9375rem] font-medium leading-snug after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {limparObjeto(l.objeto)}
        </Link>

        <p className="num text-sm text-muted-foreground">
          {fatos.join(" · ")}
          {d.preco_minimo != null && (
            <>
              {" · "}
              <span className="text-foreground">mínimo do cliente {formatarValor(d.preco_minimo)}</span>
            </>
          )}
        </p>

        {comOutro && <p className="text-sm text-warning">Já está com {comOutro}. Um cliente por licitação.</p>}
        {d.status === "recusada" && d.motivo_recusa && (
          <p className="text-sm text-destructive">Recusou: “{d.motivo_recusa}”</p>
        )}

        {abrirResumo && d.analise_ia && (
          <div className="relative z-10 space-y-2 rounded-md bg-muted/60 p-3 text-sm">
            <p className="leading-relaxed">{d.analise_ia.resumo}</p>
            <Link href={`/disputas/${d.id}`} className="text-xs font-medium text-primary hover:underline dark:text-sidebar-primary">
              Ver análise completa
            </Link>
          </div>
        )}

        <div className="relative z-10 flex flex-wrap items-center gap-2 pt-1">
          {a.podeEnviar && (
            <Button size="sm" disabled={a.pendente || comOutro != null} onClick={a.enviar}>
              <Send />
              {d.status === "recusada" ? "Reenviar" : "Enviar ao cliente"}
            </Button>
          )}
          {a.proximoPasso && a.botaoEtapa(a.proximoPasso, "default")}
          <Button size="sm" variant="outline" disabled={a.pendente} aria-expanded={abrirResumo} onClick={resumo}>
            {a.pendente && !d.analise_ia ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {d.analise_ia ? (abrirResumo ? "Fechar resumo" : "Resumo") : a.pendente ? "Analisando…" : "Análise rápida"}
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
          {a.destinos.includes("descartada") && a.botaoEtapa("descartada", "ghost")}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </div>

        {a.saida && !a.saida.ok && (
          <Aviso tom="erro" className="relative z-10">
            {a.saida.mensagem}
          </Aviso>
        )}
      </div>
      {a.dialogo}
    </article>
  );
}
