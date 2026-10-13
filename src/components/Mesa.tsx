"use client";

import { useMemo, useState, useTransition } from "react";
import type { AnaliseIA, DisputaCompleta, StatusDisputa } from "@/lib/db";
import { ROTULO_STATUS, TRANSICOES_OPERADOR } from "@/lib/etapas";
import { formatarData, formatarValor, limparObjeto } from "@/lib/formato";
import { analisar, enviarAoCliente, mudarStatus, salvarNotas, type Saida } from "@/app/acoes";
import CopiarLink from "./CopiarLink";

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

interface Props {
  disputas: DisputaCompleta[];
  clientes: { id: string; nome: string }[];
  /** licitação → nome do cliente que está com ela */
  exclusivas: Record<string, string>;
  ultimaColeta: { finalizado_em: string | null; erro: string | null } | null;
}

export default function Mesa({ disputas: iniciais, clientes, exclusivas, ultimaColeta }: Props) {
  const [disputas, setDisputas] = useState(iniciais);
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

  // Resultado de ações que tiram a licitação da aba atual (enviar, mudar de
  // etapa). Não pode morar no item: o item some da lista no mesmo instante, e
  // junto sumiria a mensagem — inclusive o link do portal quando o WhatsApp
  // não saiu, que é a única forma de chegar ao cliente.
  const [aviso, setAviso] = useState<(Saida & { titulo: string }) | null>(null);

  function atualizar(id: string, campos: Partial<DisputaCompleta>) {
    setDisputas((xs) => xs.map((d) => (d.id === id ? { ...d, ...campos } : d)));
  }

  const horasDesdeColeta = ultimaColeta?.finalizado_em
    ? (agora - new Date(ultimaColeta.finalizado_em).getTime()) / 36e5
    : null;
  const coletaParada = horasDesdeColeta == null || horasDesdeColeta > 3;

  return (
    <>
      <div className="abas-faixa">
        <div className="abas" role="tablist" aria-label="Etapas">
          {ABAS.map((a) => (
            <button
              key={a.id}
              role="tab"
              className="aba"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
              <span className="aba-n">{porAba[a.id]}</span>
            </button>
          ))}
        </div>
        <p className={`coleta ${coletaParada ? "coleta-parada" : ""}`}>
          {ultimaColeta?.finalizado_em
            ? `Última coleta ${formatarData(ultimaColeta.finalizado_em)}`
            : "Nenhuma coleta ainda"}
          {ultimaColeta?.erro ? ", com erros" : ""}
        </p>
      </div>

      <main className="pagina">
        <aside className="rail" aria-label="Filtros da lista">
          <label className="campo-rotulado">
            <span>Cliente</span>
            <select className="campo" value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="todos">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo-rotulado">
            <span>Buscar</span>
            <input
              className="campo"
              type="search"
              placeholder="Objeto, órgão ou cidade"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <p className="dica">{AJUDA_ABA[aba]}</p>
        </aside>

        <section>
          {visiveis.length === 0 ? (
            <div className="vazio">
              {busca || cliente !== "todos" ? (
                <>
                  <p>Nada com esses filtros.</p>
                  <button
                    className="btn"
                    onClick={() => {
                      setBusca("");
                      setCliente("todos");
                    }}
                  >
                    Limpar filtros
                  </button>
                </>
              ) : aba === "triagem" ? (
                <>
                  <p>Triagem em dia.</p>
                  <p className="dica">
                    Novas licitações chegam a cada coleta. Se a triagem fica vazia por dias, os
                    perfis de busca dos clientes estão estreitos demais.
                  </p>
                </>
              ) : (
                <p>Nada nesta etapa agora.</p>
              )}
            </div>
          ) : (
            <div className="lista">
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
                  avisar={setAviso}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {aviso && (
        <div className={`toast ${aviso.ok ? "" : "toast-erro"}`} role="status">
          <div className="toast-texto">
            <p className="toast-titulo">{aviso.titulo}</p>
            <p>{aviso.mensagem}</p>
            {aviso.link && <CopiarLink link={aviso.link} />}
          </div>
          <button className="btn btn-discreto" onClick={() => setAviso(null)} aria-label="Fechar aviso">
            Fechar
          </button>
        </div>
      )}
    </>
  );
}

function Item({
  avisar,
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
  avisar: (a: Saida & { titulo: string }) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [saida, setSaida] = useState<Saida | null>(null);
  const [abrirAnalise, setAbrirAnalise] = useState(false);
  const [notas, setNotas] = useState(d.notas_operador ?? "");
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
    <article className="lic">
      <div className={`lic-prazo prazo-${prazo.nivel}`} title={formatarData(l.data_encerramento_proposta)}>
        <span className="lic-prazo-num">{prazo.num}</span>
        <span className="lic-prazo-rot">{prazo.rot}</span>
      </div>

      <div className="lic-corpo">
        <div className="lic-topo">
          <p className="lic-orgao">{l.orgao_razao_social ?? "Órgão não informado"}</p>
          <span className="chip-cliente">{nomeCliente}</span>
        </div>

        <p className="lic-objeto">{limparObjeto(l.objeto)}</p>

        <dl className="fatos">
          <div>
            <dt>Valor estimado</dt>
            <dd className="num">{formatarValor(l.valor_estimado)}</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>{local || "—"}</dd>
          </div>
          <div>
            <dt>Modalidade</dt>
            <dd>
              {l.modalidade_nome ?? "—"}
              {l.srp ? ", registro de preços" : ""}
            </dd>
          </div>
          <div>
            <dt>Propostas até</dt>
            <dd className="num">{formatarData(l.data_encerramento_proposta)}</dd>
          </div>
          <div>
            <dt>Aderência</dt>
            <dd className="num" title={d.termos_encontrados.join(", ")}>
              {d.score} de 100
            </dd>
          </div>
        </dl>

        {(d.status !== "sugerida" || l.revisoes > 0) && (
          <div className="selos">
            {d.status !== "sugerida" && (
              <span className={`selo selo-${d.status}`}>{ROTULO_STATUS[d.status]}</span>
            )}
            {l.revisoes > 0 && (
              <span className="selo selo-alerta">
                Edital retificado {l.revisoes === 1 ? "uma vez" : `${l.revisoes} vezes`}
              </span>
            )}
          </div>
        )}

        {d.preco_minimo != null && (
          <p className="piso">
            Preço mínimo do cliente <b className="num">{formatarValor(d.preco_minimo)}</b>
            {l.valor_estimado && l.valor_estimado > 0 && (
              <span className="piso-pct">
                {Math.round((d.preco_minimo / l.valor_estimado) * 100)}% do estimado
              </span>
            )}
            {d.notas_cliente && <span className="piso-nota">“{d.notas_cliente}”</span>}
          </p>
        )}
        {d.status === "recusada" && d.motivo_recusa && (
          <p className="piso piso-recusa">Recusou: “{d.motivo_recusa}”</p>
        )}
        {comOutro && (
          <p className="piso piso-recusa">
            Esta licitação já está com <b>{comOutro}</b>. Um cliente por licitação.
          </p>
        )}

        {abrirAnalise && d.analise_ia && <Analise a={d.analise_ia} />}

        <div className="acoes">
          {podeEnviar && (
            <button
              className="btn btn-primario"
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
              {d.status === "recusada" ? "Reenviar ao cliente" : "Enviar ao cliente"}
            </button>
          )}

          <button
            className="btn"
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
            {d.analise_ia
              ? abrirAnalise
                ? "Fechar análise"
                : `Análise: ${rotuloVeredito(d.analise_ia.veredito)}`
              : pendente
                ? "Analisando…"
                : "Analisar com IA"}
          </button>

          {destinos.map((para) => (
            <button
              key={para}
              className={`btn ${
                ["descartada", "desistiu", "perdeu"].includes(para)
                  ? "btn-discreto"
                  : !podeEnviar && para === proximoPasso
                    ? "btn-primario"
                    : ""
              }`}
              disabled={pendente}
              onClick={() => {
                if (
                  para === "desistiu" &&
                  !confirm(
                    "Desistir desta disputa? Se a proposta já foi enviada, desistir pode gerar penalidade ao cliente. Confira o edital."
                  )
                )
                  return;
                rodar(
                  () => mudarStatus(d.id, para),
                  () => {
                    avisar({
                      ok: true,
                      mensagem:
                        para === "sugerida"
                          ? "Voltou para a triagem."
                          : `Movida para "${ROTULO_STATUS[para]}".`,
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
            </button>
          ))}

          {(l.link_pncp || l.link_sistema_origem) && (
            <a
              className="link-edital"
              href={l.link_pncp ?? l.link_sistema_origem!}
              target="_blank"
              rel="noreferrer"
            >
              Abrir edital
            </a>
          )}
        </div>

        {saida && (
          <div className={`aviso ${saida.ok ? "" : "aviso-erro"}`} role="status">
            <p>{saida.mensagem}</p>
            {saida.link && <CopiarLink link={saida.link} />}
          </div>
        )}

        {!["sugerida", "descartada"].includes(d.status) && (
          <textarea
            className="campo campo-area notas"
            rows={2}
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
    </article>
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
  const cor = a.veredito === "vale_a_pena" ? "u-verde" : a.veredito === "nao_vale" ? "u-brasa" : "u-ambar";
  return (
    <div className="analise">
      <div className={`analise-veredito ${cor}`}>{rotuloVeredito(a.veredito)}</div>
      <p style={{ margin: 0 }}>{a.resumo}</p>
      <h4>O cliente vai ler</h4>
      <p style={{ margin: 0 }} className="dica">{a.resumo_cliente}</p>
      <Lista titulo="O que pedem" itens={a.o_que_pedem} />
      <Lista titulo="Riscos" itens={a.riscos} />
      <Lista titulo="Conferir no edital antes de enviar" itens={a.perguntas} />
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <>
      <h4>{titulo}</h4>
      <ul>
        {itens.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </>
  );
}
