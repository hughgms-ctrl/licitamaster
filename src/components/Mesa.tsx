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
import { Checkbox } from "./ui/checkbox";
import EnvioEmLote from "./EnvioEmLote";

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
  triagem: "O que a coleta encontrou para os perfis dos clientes. A IA já analisa as melhores sozinha; as que valem a pena vêm primeiro. Você decide o que enviar.",
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
  const [uf, setUf] = useState("todos");
  const [cidade, setCidade] = useState("todas");
  const [busca, setBusca] = useState("");
  // `agora` congelado no carregamento: recalcular a cada render faria o
  // servidor e o navegador discordarem e o React reclamar de hidratação.
  const [agora] = useState(() => Date.now());
  // Seleção para o envio em lote (só na triagem).
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  useEffect(() => setSelecao(new Set()), [aba, cliente, uf, cidade]);

  // Estado e cidade saem das próprias licitações: só aparece o que existe.
  const ufsDisponiveis = useMemo(
    () => [...new Set(disputas.map((d) => d.licitacao.uf).filter((x): x is string => !!x))].sort(),
    [disputas]
  );
  const cidadesDisponiveis = useMemo(
    () =>
      [
        ...new Set(
          disputas
            .filter((d) => uf === "todos" || d.licitacao.uf === uf)
            .map((d) => (d.licitacao.municipio ? `${d.licitacao.municipio}/${d.licitacao.uf ?? ""}` : null))
            .filter((x): x is string => !!x)
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [disputas, uf]
  );
  const noLugar = (d: DisputaCompleta) =>
    (uf === "todos" || d.licitacao.uf === uf) &&
    (cidade === "todas" || `${d.licitacao.municipio}/${d.licitacao.uf ?? ""}` === cidade);

  const porAba = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const a of ABAS) {
      contagem[a.id] = disputas.filter(
        (d) => a.status.includes(d.status) && (cliente === "todos" || d.cliente_id === cliente) && noLugar(d)
      ).length;
    }
    return contagem;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputas, cliente, uf, cidade]);

  const visiveis = useMemo(() => {
    const status = ABAS.find((a) => a.id === aba)!.status;
    const termo = busca
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const lista = disputas.filter((d) => {
      if (!status.includes(d.status)) return false;
      if (cliente !== "todos" && d.cliente_id !== cliente) return false;
      if (!noLugar(d)) return false;
      if (!termo) return true;
      const texto = [d.licitacao.objeto, d.licitacao.orgao_razao_social, d.licitacao.municipio]
        .join(" ")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      return texto.includes(termo);
    });
    // Na triagem, o que a IA já disse que vale a pena vem primeiro; o que ela
    // disse que não vale vai para o fim. Dentro de cada grupo, a nota manda.
    if (aba === "triagem") {
      const peso = (d: DisputaCompleta) =>
        ({ vale_a_pena: 0, talvez: 1, nao_vale: 3 } as const)[d.analise_ia?.veredito ?? "talvez"] + (d.analise_ia ? 0 : 1.5);
      lista.sort((a, b) => peso(a) - peso(b) || b.score - a.score);
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputas, aba, cliente, busca, uf, cidade]);

  // Para o resumo do topo: o que fecha em 48h na triagem pede atenção hoje.
  const urgentes = useMemo(
    () =>
      disputas.filter((d) => {
        if (!["sugerida", "aguardando_cliente", "aprovada", "em_preparacao"].includes(d.status)) return false;
        if (cliente !== "todos" && d.cliente_id !== cliente) return false;
        if (!noLugar(d)) return false;
        const iso = d.licitacao.data_encerramento_proposta;
        if (!iso) return false;
        const h = (new Date(iso).getTime() - agora) / 36e5;
        return h >= 0 && h < 48;
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disputas, cliente, agora, uf, cidade]
  );

  function atualizar(id: string, campos: Partial<DisputaCompleta>) {
    setDisputas((xs) => xs.map((d) => (d.id === id ? { ...d, ...campos } : d)));
  }

  const horasDesdeColeta = ultimaColeta?.finalizado_em
    ? (agora - new Date(ultimaColeta.finalizado_em).getTime()) / 36e5
    : null;
  const coletaParada = horasDesdeColeta == null || horasDesdeColeta > 3;

  const comOutroDe = (d: DisputaCompleta) =>
    exclusivas[d.licitacao_id] &&
    !["aguardando_cliente", "aprovada", "em_preparacao", "proposta_enviada", "em_disputa", "ganhou"].includes(d.status)
      ? exclusivas[d.licitacao_id]
      : null;
  // Dá para enviar: está na triagem, ninguém mais está com ela e o prazo não fechou.
  const enviavel = (d: DisputaCompleta) =>
    d.status === "sugerida" &&
    !comOutroDe(d) &&
    !(d.licitacao.data_encerramento_proposta && new Date(d.licitacao.data_encerramento_proposta).getTime() < agora);
  const enviaveis = aba === "triagem" ? visiveis.filter(enviavel) : [];
  const valemAPena = enviaveis.filter((d) => d.analise_ia?.veredito === "vale_a_pena");
  const selecionadas = visiveis.filter((d) => selecao.has(d.id));
  function alternar(id: string) {
    setSelecao((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const filtrando = busca !== "" || cliente !== "todos" || uf !== "todos" || cidade !== "todas";

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

      <div className="mb-4 flex flex-col gap-3">
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
            className="sm:w-48"
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
          <NativeSelect
            aria-label="Estado"
            className="sm:w-36"
            value={uf}
            onChange={(e) => {
              setUf(e.target.value);
              setCidade("todas");
            }}
          >
            <option value="todos">Todos os estados</option>
            {ufsDisponiveis.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Cidade" className="sm:w-48" value={cidade} onChange={(e) => setCidade(e.target.value)}>
            <option value="todas">Todas as cidades</option>
            {cidadesDisponiveis.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
          <div className="relative sm:w-56">
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

      {enviaveis.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Selecionar:</span>
          {valemAPena.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setSelecao(new Set(valemAPena.map((d) => d.id)))}>
              As que valem a pena ({valemAPena.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelecao(new Set(enviaveis.map((d) => d.id)))}>
            Todas ({enviaveis.length})
          </Button>
        </div>
      )}

      {visiveis.length === 0 ? (
        filtrando ? (
          <Vazio icone={Search} titulo="Nada com esses filtros.">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBusca("");
                setCliente("todos");
                setUf("todos");
                setCidade("todas");
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
              comOutro={comOutroDe(d)}
              atualizar={atualizar}
              selecionado={aba === "triagem" && enviavel(d) ? selecao.has(d.id) : undefined}
              aoSelecionar={() => alternar(d.id)}
              temFicha={!!lidas[d.licitacao_id]}
              temResultado={!!comResultado[d.id]}
            />
          ))}
        </div>
      )}

      <EnvioEmLote
        selecionadas={selecionadas}
        lidas={lidas}
        limpar={() => setSelecao(new Set())}
        aoEnviar={(ids) => {
          const enviadas = new Set(ids);
          setDisputas((xs) => xs.map((d) => (enviadas.has(d.id) ? { ...d, status: "aguardando_cliente" } : d)));
          setSelecao(new Set());
        }}
      />
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
  selecionado,
  aoSelecionar,
}: {
  d: DisputaCompleta;
  agora: number;
  /** nome do outro cliente que já está com esta licitação, se houver */
  comOutro: string | null;
  atualizar: (id: string, campos: Partial<DisputaCompleta>) => void;
  temFicha: boolean;
  temResultado: boolean;
  /** undefined: este card não entra no envio em lote */
  selecionado?: boolean;
  aoSelecionar: () => void;
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
    <article
      className={cn(
        "relative flex gap-4 p-4 transition-colors hover:bg-accent/40 sm:p-5",
        selecionado && "bg-primary/5 hover:bg-primary/10"
      )}
    >
      {selecionado !== undefined && (
        <Checkbox
          checked={selecionado}
          onCheckedChange={aoSelecionar}
          aria-label="Selecionar para enviar em lote"
          className="relative z-10 mt-1 size-5"
        />
      )}
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
              <span className="text-foreground">
                mínimo do cliente {formatarValor(d.preco_minimo)}
                {d.lotes?.length ? ` em ${d.lotes.length} ${d.lotes.length === 1 ? "lote" : "lotes"}` : ""}
              </span>
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
