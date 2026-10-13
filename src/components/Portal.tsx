"use client";

import { useState, useTransition } from "react";
import type { StatusDisputa } from "@/lib/db";
import { formatarData, formatarValor, tempoRestante } from "@/lib/formato";
import { responder, type SaidaPortal } from "@/app/c/[token]/acoes";

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
}

/** Como o cliente lê cada etapa. Sem jargão de licitação. */
const ETAPA_CLIENTE: Partial<Record<StatusDisputa, { texto: string; classe: string }>> = {
  aprovada: { texto: "Aprovada — vamos preparar a proposta", classe: "" },
  em_preparacao: { texto: "Preparando proposta e documentos", classe: "" },
  proposta_enviada: { texto: "Proposta enviada — aguardando a sessão", classe: "" },
  em_disputa: { texto: "Em disputa agora", classe: "u-ambar" },
  ganhou: { texto: "Ganhamos!", classe: "u-verde" },
  perdeu: { texto: "Não foi desta vez", classe: "u-brasa" },
};

export default function Portal({
  token,
  empresa,
  contato,
  cartoes: iniciais,
  declaracao,
  cofre,
}: {
  cofre?: React.ReactNode;
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
    <div className="portal">
      <header className="portal-topo">
        <p className="portal-ola">{contato ? `Olá, ${contato.split(" ")[0]}` : "Olá"}</p>
        <h1 className="portal-empresa">{empresa}</h1>
        <p className="portal-intro">
          {decidir.length === 0
            ? "Nenhuma licitação esperando você. Avisamos no WhatsApp quando aparecer a próxima."
            : decidir.length === 1
              ? "Uma licitação está esperando a sua decisão."
              : `${decidir.length} licitações estão esperando a sua decisão.`}
        </p>
      </header>

      {decidir.length > 0 && (
      <section className="portal-secao">
        <h2 className="portal-titulo">Para você decidir</h2>
        {decidir.map((c) => (
            <Decisao
              key={c.id}
              c={c}
              token={token}
              agora={agora}
              declaracao={declaracao}
              resolvida={(status, preco) =>
                setCartoes((xs) =>
                  xs.map((x) => (x.id === c.id ? { ...x, status, precoMinimo: preco ?? x.precoMinimo } : x))
                )
              }
            />
          ))}
      </section>
      )}

      {andamento.length > 0 && (
        <section className="portal-secao">
          <h2 className="portal-titulo">Em andamento</h2>
          {andamento.map((c) => (
            <Resumo key={c.id} c={c} />
          ))}
        </section>
      )}

      {resultados.length > 0 && (
        <section className="portal-secao">
          <h2 className="portal-titulo">Resultados</h2>
          {resultados.map((c) => (
            <Resumo key={c.id} c={c} />
          ))}
        </section>
      )}

      {cofre && (
        <section className="portal-secao">
          <h2 className="portal-titulo">Documentos da empresa</h2>
          <p className="dica">
            Certidões e documentos que usamos para inscrever a sua empresa. Mantenha em dia: certidão
            vencida tira a empresa da disputa.
          </p>
          <div className="portal-cartao">{cofre}</div>
        </section>
      )}
    </div>
  );
}

function Cabecalho({ c }: { c: CartaoPortal }) {
  return (
    <>
      <p className="lic-orgao">{c.orgao ?? "Órgão público"}</p>
      <p className="portal-resumo">{c.resumo || c.objeto}</p>
      {c.resumo && (
        <details className="portal-detalhe">
          <summary>Texto oficial do edital</summary>
          <p>{c.objeto}</p>
        </details>
      )}
    </>
  );
}

function Resumo({ c }: { c: CartaoPortal }) {
  const etapa = ETAPA_CLIENTE[c.status];
  return (
    <article className="portal-cartao">
      <Cabecalho c={c} />
      <dl className="fatos">
        <div>
          <dt>Situação</dt>
          <dd className={etapa?.classe}>{etapa?.texto}</dd>
        </div>
        {c.precoMinimo != null && (
          <div>
            <dt>Seu preço mínimo</dt>
            <dd className="num">{formatarValor(c.precoMinimo)}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function Decisao({
  c,
  token,
  agora,
  declaracao,
  resolvida,
}: {
  c: CartaoPortal;
  token: string;
  agora: number;
  declaracao: string;
  resolvida: (status: StatusDisputa, preco?: number) => void;
}) {
  const [modo, setModo] = useState<"inicio" | "sim" | "nao">("inicio");
  const [preco, setPreco] = useState("");
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
    <article className="portal-cartao portal-cartao-decidir">
      <Cabecalho c={c} />
      <dl className="fatos">
        <div>
          <dt>Valor estimado pelo órgão</dt>
          <dd className="num">{formatarValor(c.valorEstimado)}</dd>
        </div>
        {c.local && (
          <div>
            <dt>Local de entrega</dt>
            <dd>{c.local}</dd>
          </div>
        )}
        <div>
          <dt>Decidir até</dt>
          <dd className="num">
            {formatarData(c.encerramento)}
            <span className="fatos-sub">{tempoRestante(c.encerramento, agora)}</span>
          </dd>
        </div>
      </dl>

      {modo === "inicio" && (
        <div className="portal-botoes">
          <button className="btn btn-primario btn-grande" onClick={() => setModo("sim")}>
            Quero participar
          </button>
          <button className="btn btn-grande" onClick={() => setModo("nao")}>
            Não quero
          </button>
        </div>
      )}

      {modo === "sim" && (
        <div className="portal-form">
          <label className="campo-rotulado">
            <span>Seu preço mínimo (R$)</span>
            <input
              className="campo campo-grande"
              inputMode="decimal"
              placeholder="ex: 48.500,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              autoFocus
            />
            <em className="dica">
              O menor valor total que ainda dá lucro. Nunca oferecemos menos que isso.
            </em>
          </label>
          {pctEstimado != null && <Medidor pct={pctEstimado} />}
          <label className="campo-rotulado">
            <span>Observações (opcional)</span>
            <textarea
              className="campo campo-area"
              rows={2}
              placeholder="ex: consigo entregar em 15 dias; preciso de frete à parte"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </label>
          <label className="linha-check">
            <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
            <span>{declaracao}</span>
          </label>
          <div className="portal-botoes">
            <button
              className="btn btn-primario btn-grande"
              disabled={pendente || !valorPreco || !confirmo}
              onClick={() =>
                enviar({ decisao: "sim", precoMinimo: valorPreco!, notas, confirmo })
              }
            >
              {pendente ? "Enviando…" : "Aprovar participação"}
            </button>
            <button className="btn btn-grande" disabled={pendente} onClick={() => setModo("inicio")}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {modo === "nao" && (
        <div className="portal-form">
          <label className="campo-rotulado">
            <span>Por quê? (opcional, ajuda a gente a acertar as próximas)</span>
            <textarea
              className="campo campo-area"
              rows={2}
              placeholder="ex: não atendemos essa cidade; agenda cheia neste mês"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <div className="portal-botoes">
            <button
              className="btn btn-grande btn-perigo-cheio"
              disabled={pendente}
              onClick={() => enviar({ decisao: "nao", motivo })}
            >
              {pendente ? "Enviando…" : "Confirmar: não participar"}
            </button>
            <button className="btn btn-grande" disabled={pendente} onClick={() => setModo("inicio")}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {saida && <p className={`aviso ${saida.ok ? "" : "aviso-erro"}`}>{saida.mensagem}</p>}

      {c.link && (
        <a className="link-edital" href={c.link} target="_blank" rel="noreferrer noopener">
          Ver o edital completo
        </a>
      )}
    </article>
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
  return (
    <div className={`medidor ${acima ? "medidor-acima" : ""}`}>
      <div className="medidor-trilho" aria-hidden="true">
        <div className="medidor-faixa" style={{ width: `${marca100}%` }} />
        <div className="medidor-marca" style={{ left: `${marca100}%` }} />
        <div className="medidor-ponto" style={{ left: `${posicao}%` }} />
      </div>
      <p className="medidor-texto">
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
