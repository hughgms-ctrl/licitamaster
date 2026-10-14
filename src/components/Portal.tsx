"use client";

import { useState, useTransition } from "react";
import type { StatusDisputa } from "@/lib/db";
import { formatarData, formatarValor, tempoRestante } from "@/lib/formato";
import { responder, type SaidaPortal } from "@/app/c/[token]/acoes";
import { Calculator, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import CalculadoraPreco from "./CalculadoraPreco";
import { cn } from "@/lib/utils";
import { Marca } from "./Marca";
import { SeletorTema } from "./SeletorTema";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Campo } from "./ui/campo";
import { Aviso } from "./ui/aviso";
import { StatusDot, type Tom } from "./ui/status-dot";

export interface CartaoPortal {
  id: string;
  status: StatusDisputa;
  /** resumo em linguagem simples, quando a análise já rodou */
  resumo: string | null;
  objeto: string;
  orgao: string | null;
  local: string;
  modalidade: string | null;
  valorEstimado: number | null;
  encerramento: string | null;
  link: string | null;
  precoMinimo: number | null;
  /** o que o edital exige, para o cliente decidir sabendo (só nas que esperam decisão) */
  exigencias?: ExigenciasCliente | null;
}

export interface ExigenciasCliente {
  /** documentos que faltam, vencidos ou que vencem antes da sessão */
  documentos: { rotulo: string; situacao: "falta" | "vencido" | "vence_antes" }[];
  /** quantos documentos exigidos já estão em dia no cofre */
  documentosProntos: number;
  tecnicas: string[];
  visita: string | null;
  amostra: string | null;
  garantia: string | null;
  entrega: string | null;
  sessao: string | null;
}

/** Como o cliente lê cada etapa. Sem jargão de licitação. */
const ETAPA_CLIENTE: Partial<Record<StatusDisputa, { texto: string; tom: Tom }>> = {
  aprovada: { texto: "Aprovada — vamos preparar a proposta", tom: "primario" },
  em_preparacao: { texto: "Preparando proposta e documentos", tom: "primario" },
  proposta_enviada: { texto: "Proposta enviada — aguardando a sessão", tom: "info" },
  em_disputa: { texto: "Em disputa agora", tom: "alerta" },
  ganhou: { texto: "Ganhamos!", tom: "sucesso" },
  perdeu: { texto: "Não foi desta vez", tom: "perigo" },
};

export default function Portal({
  token,
  empresa,
  contato,
  cartoes: iniciais,
  declaracao,
  cofre,
  preparo,
  assessoriaPct,
}: {
  /** taxa de êxito da assessoria, para a calculadora de preço já vir preenchida */
  assessoriaPct?: number | null;
  cofre?: React.ReactNode;
  preparo?: React.ReactNode;
  token: string;
  empresa: string;
  contato: string | null;
  cartoes: CartaoPortal[];
  declaracao: string;
}) {
  const [cartoes, setCartoes] = useState(iniciais);
  const [agora] = useState(() => Date.now());

  const decidir = cartoes.filter((c) => c.status === "aguardando_cliente");
  const andamento = cartoes.filter((c) =>
    ["aprovada", "em_preparacao", "proposta_enviada", "em_disputa"].includes(c.status)
  );
  const resultados = cartoes.filter((c) => ["ganhou", "perdeu"].includes(c.status));

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-16">
      <header className="space-y-5 pb-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Marca />
          <SeletorTema compacto />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">{contato ? `Olá, ${contato.split(" ")[0]}` : "Olá"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{empresa}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {decidir.length === 0
              ? "Nenhuma licitação esperando você. Avisamos no WhatsApp quando aparecer a próxima."
              : decidir.length === 1
                ? "Uma licitação está esperando a sua decisão."
                : `${decidir.length} licitações estão esperando a sua decisão.`}
          </p>
        </div>
      </header>

      <div className="space-y-8">
        {preparo}

        {decidir.length > 0 && (
          <Secao titulo="Para você decidir" n={decidir.length}>
            {decidir.map((c) => (
              <Decisao
                key={c.id}
                c={c}
                token={token}
                agora={agora}
                declaracao={declaracao}
                assessoriaPct={assessoriaPct}
                resolvida={(status, preco) =>
                  setCartoes((xs) =>
                    xs.map((x) => (x.id === c.id ? { ...x, status, precoMinimo: preco ?? x.precoMinimo } : x))
                  )
                }
              />
            ))}
          </Secao>
        )}

        {andamento.length > 0 && (
          <Secao titulo="Em andamento" n={andamento.length}>
            <div className="divide-y overflow-hidden rounded-lg border bg-card">
              {andamento.map((c) => (
                <Resumo key={c.id} c={c} />
              ))}
            </div>
          </Secao>
        )}

        {resultados.length > 0 && (
          <Secao titulo="Resultados" n={resultados.length}>
            <div className="divide-y overflow-hidden rounded-lg border bg-card">
              {resultados.map((c) => (
                <Resumo key={c.id} c={c} />
              ))}
            </div>
          </Secao>
        )}

        {cofre && (
          <Secao titulo="Documentos da empresa">
            <p className="-mt-1 text-sm leading-relaxed text-muted-foreground">
              Certidões e documentos que usamos para inscrever a sua empresa. Mantenha em dia: certidão
              vencida tira a empresa da disputa.
            </p>
            <div className="rounded-lg border bg-card p-4">{cofre}</div>
          </Secao>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, n, children }: { titulo: string; n?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {titulo}
        {n != null && <span className="num text-xs font-normal text-muted-foreground">{n}</span>}
      </h2>
      {children}
    </section>
  );
}

function Cabecalho({ c }: { c: CartaoPortal }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{c.orgao ?? "Órgão público"}</p>
      <p className="text-[0.9375rem] font-medium leading-snug">{c.resumo || c.objeto}</p>
      {c.resumo && (
        <details className="group text-sm">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            Texto oficial do edital
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{c.objeto}</p>
        </details>
      )}
    </div>
  );
}

function Resumo({ c }: { c: CartaoPortal }) {
  const etapa = ETAPA_CLIENTE[c.status];
  return (
    <article className="space-y-3 p-4">
      <Cabecalho c={c} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {etapa && (
          <StatusDot tom={etapa.tom} pulsar={c.status === "em_disputa"}>
            {etapa.texto}
          </StatusDot>
        )}
        {c.precoMinimo != null && (
          <span className="text-xs text-muted-foreground">
            Seu mínimo <b className="num font-semibold text-foreground">{formatarValor(c.precoMinimo)}</b>
          </span>
        )}
      </div>
    </article>
  );
}

function Decisao({
  c,
  token,
  agora,
  declaracao,
  resolvida,
  assessoriaPct,
}: {
  c: CartaoPortal;
  token: string;
  agora: number;
  declaracao: string;
  assessoriaPct?: number | null;
  resolvida: (status: StatusDisputa, preco?: number) => void;
}) {
  const [modo, setModo] = useState<"inicio" | "sim" | "nao">("inicio");
  const [preco, setPreco] = useState("");
  const [calcular, setCalcular] = useState(false);
  const [notas, setNotas] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [saida, setSaida] = useState<SaidaPortal | null>(null);
  const [pendente, iniciar] = useTransition();

  const valorPreco = lerReais(preco);
  const pctEstimado =
    valorPreco && c.valorEstimado && c.valorEstimado > 0
      ? Math.round((valorPreco / c.valorEstimado) * 100)
      : null;

  function enviar(resposta: Parameters<typeof responder>[2]) {
    setSaida(null);
    iniciar(async () => {
      const s = await responder(token, c.id, resposta);
      setSaida(s);
      if (s.ok) {
        resolvida(
          resposta.decisao === "sim" ? "aprovada" : "recusada",
          resposta.decisao === "sim" ? resposta.precoMinimo : undefined
        );
      }
    });
  }

  return (
    <article className="space-y-4 rounded-lg border border-primary/40 bg-card p-4 ring-1 ring-primary/10 sm:p-5">
      <Cabecalho c={c} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-muted/50 p-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Valor estimado pelo órgão</dt>
          <dd className="num font-semibold">{formatarValor(c.valorEstimado)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Decidir até</dt>
          <dd className="num font-semibold">{formatarData(c.encerramento)}</dd>
          <dd className="text-xs text-warning">{tempoRestante(c.encerramento, agora)}</dd>
        </div>
        {c.local && (
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted-foreground">Local de entrega</dt>
            <dd className="font-medium">{c.local}</dd>
          </div>
        )}
      </dl>

      {c.exigencias && <Exigencias e={c.exigencias} />}

      {modo === "inicio" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" className="h-12" onClick={() => setModo("sim")}>
            Quero participar
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={() => setModo("nao")}>
            Não quero
          </Button>
        </div>
      )}

      {modo === "sim" && (
        <div className="space-y-4 border-t pt-4">
          <Campo
            rotulo="Seu preço mínimo (R$)"
            dica="O menor valor total que ainda dá lucro. Nunca oferecemos menos que isso."
          >
            <Input
              className="num h-12 text-lg font-semibold"
              inputMode="decimal"
              placeholder="ex: 48.500,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              autoFocus
            />
          </Campo>
          {pctEstimado != null && <Medidor pct={pctEstimado} />}
          {calcular ? (
            <CalculadoraPreco
              className="rounded-md border p-3"
              estimado={c.valorEstimado}
              assessoriaPct={assessoriaPct}
              rotuloUsar="Usar este valor"
              usar={(v) => {
                setPreco(v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                setCalcular(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCalcular(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline dark:text-sidebar-primary"
            >
              <Calculator className="size-4" />
              Não sabe o valor? Calcule a partir do seu custo
            </button>
          )}
          <Campo rotulo="Observações (opcional)">
            <Textarea
              rows={2}
              placeholder="ex: consigo entregar em 15 dias; preciso de frete à parte"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Campo>
          <label className="flex items-start gap-3 rounded-md border p-3 text-sm leading-relaxed">
            <Checkbox checked={confirmo} onCheckedChange={(v) => setConfirmo(v === true)} className="mt-0.5" />
            <span>{declaracao}</span>
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              size="lg"
              className="h-12"
              disabled={pendente || !valorPreco || !confirmo}
              onClick={() => enviar({ decisao: "sim", precoMinimo: valorPreco!, notas, confirmo })}
            >
              {pendente && <Loader2 className="animate-spin" />}
              {pendente ? "Enviando…" : "Aprovar participação"}
            </Button>
            <Button size="lg" variant="ghost" className="h-12" disabled={pendente} onClick={() => setModo("inicio")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {modo === "nao" && (
        <div className="space-y-4 border-t pt-4">
          <Campo rotulo="Por quê? (opcional, ajuda a gente a acertar as próximas)">
            <Textarea
              rows={2}
              placeholder="ex: não atendemos essa cidade; agenda cheia neste mês"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Campo>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              size="lg"
              variant="destructive"
              className="h-12"
              disabled={pendente}
              onClick={() => enviar({ decisao: "nao", motivo })}
            >
              {pendente && <Loader2 className="animate-spin" />}
              {pendente ? "Enviando…" : "Confirmar: não participar"}
            </Button>
            <Button size="lg" variant="ghost" className="h-12" disabled={pendente} onClick={() => setModo("inicio")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}

      {c.link && (
        <a
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          href={c.link}
          target="_blank"
          rel="noreferrer noopener"
        >
          <ExternalLink className="size-3.5" />
          Ver o edital completo
        </a>
      )}
    </article>
  );
}

const SITUACAO_DOC = { falta: "você ainda não enviou", vencido: "vencido", vence_antes: "vence antes da disputa" };

/**
 * O que o edital pede da empresa, em linguagem simples, antes do "Quero
 * participar". A declaração que ele marca ao aprovar fala destas exigências.
 */
function Exigencias({ e }: { e: ExigenciasCliente }) {
  const extras = [
    e.entrega && `Prazo: ${e.entrega}`,
    e.visita && `Visita ao local: ${e.visita}`,
    e.amostra && `Amostra: ${e.amostra}`,
    e.garantia && `Garantia: ${e.garantia}`,
  ].filter((x): x is string => !!x);
  if (!e.documentos.length && !e.tecnicas.length && !extras.length) return null;
  return (
    <section className="space-y-3 rounded-md border p-3">
      <h3 className="text-sm font-semibold">O que vão pedir da sua empresa</h3>

      {e.documentos.length > 0 ? (
        <div className="space-y-1.5">
          <StatusDot tom="perigo">
            {e.documentos.length === 1 ? "1 documento pendente" : `${e.documentos.length} documentos pendentes`}
          </StatusDot>
          <ul className="list-disc space-y-0.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground/60">
            {e.documentos.map((d) => (
              <li key={d.rotulo}>
                {d.rotulo} <span className="text-muted-foreground">({SITUACAO_DOC[d.situacao]})</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Precisam estar em dia até a disputa{e.sessao ? ` (${e.sessao})` : ""}. Envie em &quot;Documentos da empresa&quot;, no fim
            da página.
          </p>
        </div>
      ) : (
        e.documentosProntos > 0 && <StatusDot tom="sucesso">Documentos da empresa em dia para esta licitação</StatusDot>
      )}

      {e.tecnicas.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Comprovar experiência e qualificação</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground/60">
            {e.tecnicas.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {extras.length > 0 && (
        <ul className="space-y-0.5 text-sm leading-relaxed text-muted-foreground">
          {extras.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Onde o preço mínimo cai em relação ao valor estimado pelo órgão.
 *
 * A pergunta que o dono da empresa tem na cabeça ao digitar o piso é "esse
 * número é competitivo?". Abaixo do estimado há espaço para disputar; acima,
 * o órgão costuma desclassificar a proposta. O medidor responde enquanto ele
 * digita, sem precisar fazer conta.
 */
function Medidor({ pct }: { pct: number }) {
  // escala de 0 a 130% do estimado; a marca de 100% fica fixa
  const posicao = Math.min(100, (pct / 130) * 100);
  const marca100 = (100 / 130) * 100;
  const acima = pct > 100;
  const apertado = !acima && pct >= 95;
  return (
    <div
      className={cn(
        "space-y-2.5 rounded-md border p-3",
        acima ? "border-destructive/30 bg-destructive/5" : apertado ? "border-warning/30 bg-warning/5" : "border-success/30 bg-success/5"
      )}
    >
      <div className="relative h-2" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-muted" />
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-success/30" style={{ width: `${marca100}%` }} />
        <div className="absolute -top-1 h-4 w-px bg-foreground/50" style={{ left: `${marca100}%` }} />
        <div
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow transition-[left]",
            acima ? "bg-destructive" : apertado ? "bg-warning" : "bg-success"
          )}
          style={{ left: `${posicao}%` }}
        />
      </div>
      <div className="relative h-3.5 text-[0.6875rem] leading-none text-muted-foreground" aria-hidden="true">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${marca100}%` }}>
          estimado
        </span>
      </div>
      <p className="text-sm leading-relaxed">
        {acima
          ? `Seu mínimo está ${pct - 100}% acima do valor estimado. O órgão costuma desclassificar propostas acima do estimado. Vale rever o custo.`
          : pct >= 95
            ? `Seu mínimo é ${pct}% do valor estimado. Sobra pouco espaço para disputar preço.`
            : `Seu mínimo é ${pct}% do valor estimado. Há espaço para disputar.`}
      </p>
    </div>
  );
}

/**
 * "48.500,00", "48500", "48500.5", "R$ 48.500" → número. Ponto é milhar no
 * Brasil; só vira decimal quando não há vírgula e sobram 1-2 casas depois dele.
 */
function lerReais(t: string): number | null {
  const s = t.replace(/[^\d.,]/g, "");
  if (!s) return null;
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/\.\d{1,2}$/.test(s)) n = Number(s);
  else n = Number(s.replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
