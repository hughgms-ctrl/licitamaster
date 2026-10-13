"use client";

import { useState } from "react";
import type { Perfil, TermoPositivo } from "@/lib/scoring";
import {
  procurarAgora,
  sugerirTermosAgora,
  type SaidaBusca,
  type SaidaSugestao,
} from "@/app/filtros/acoes";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

/** Perfil ainda não salvo não tem id. */
type Rascunho = Omit<Perfil, "id"> & { id?: string };

interface Props {
  clienteId: string;
  /** descrição do cliente: o assistente de termos já começa com ela */
  contexto: string;
  perfis: Perfil[];
  /** quantas oportunidades no radar casaram com cada filtro */
  contagens: Record<string, number>;
}

const VAZIO: Omit<Rascunho, "cliente_id"> = {
  nome: "",
  ativo: true,
  termos_positivos: [{ termo: "", peso: 30 }],
  termos_negativos: [],
  ufs: [],
  valor_min: 1000,
  valor_max: null,
  score_minimo: 25,
  score_alerta: 60,
};

export default function Filtros({ clienteId, contexto, perfis, contagens }: Props) {
  const [lista, setLista] = useState<Perfil[]>(perfis);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<SaidaBusca | null>(null);

  function editar(p: Perfil) {
    setAviso(null);
    setRascunho(JSON.parse(JSON.stringify(p)));
  }

  function novo() {
    setAviso(null);
    setRascunho({ ...JSON.parse(JSON.stringify(VAZIO)), cliente_id: clienteId });
  }

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setAviso(null);
    try {
      // termo em branco é lixo de digitação, não intenção
      const limpo = {
        ...rascunho,
        nome: rascunho.nome.trim(),
        termos_positivos: rascunho.termos_positivos.filter((t) => t.termo.trim()),
        termos_negativos: rascunho.termos_negativos.filter((t) => t.trim()),
      };

      const res = await fetch("/api/perfis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limpo),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setAviso(corpo.erro ?? "Não deu para salvar.");
        return;
      }
      setLista((xs) => {
        const i = xs.findIndex((x) => x.id === corpo.id);
        return i >= 0 ? xs.map((x) => (x.id === corpo.id ? corpo : x)) : [...xs, corpo];
      });
      setRascunho(null);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(p: Perfil) {
    if (!confirm(`Apagar o perfil "${p.nome}"? As licitações que ele já sugeriu continuam na mesa.`))
      return;
    const res = await fetch(`/api/perfis?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (res.ok) {
      setLista((xs) => xs.filter((x) => x.id !== p.id));
      if (rascunho?.id === p.id) setRascunho(null);
    }
  }

  async function alternarAtivo(p: Perfil) {
    const alvo = { ...p, ativo: !p.ativo };
    setLista((xs) => xs.map((x) => (x.id === p.id ? alvo : x)));
    const res = await fetch("/api/perfis", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alvo),
    });
    if (!res.ok) setLista((xs) => xs.map((x) => (x.id === p.id ? p : x))); // desfaz
  }

  /** Varre o PNCP agora, sem esperar o cron. Ver o comentario em acoes.ts. */
  async function buscar() {
    setBuscando(true);
    setResultado(null);
    setAviso(null);
    try {
      setResultado(await procurarAgora());
    } catch (e) {
      setResultado({ ok: false, mensagem: (e as Error).message });
    } finally {
      setBuscando(false);
    }
  }

  async function semear() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/perfis?cliente_id=${encodeURIComponent(clienteId)}`, {
        method: "POST",
      });
      const corpo = await res.json();
      if (!res.ok) {
        setAviso(corpo.erro ?? "Não deu para adicionar os filtros prontos.");
        return;
      }
      if (corpo.criados === 0) {
        setAviso("Você já tem todos os filtros prontos.");
        return;
      }
      setLista((xs) => [...xs, ...(corpo.perfis ?? [])]);
      setAviso(`${corpo.criados} filtro(s) adicionado(s). Rode a coleta para eles valerem.`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="pagina">
      <nav className="rail" aria-label="Filtros salvos">
        <div className="rail-grupo">
          <p className="rail-titulo">Perfis de busca</p>
          {lista.map((p) => (
            <button
              key={p.id}
              className="rail-botao"
              aria-pressed={rascunho?.id === p.id}
              aria-label={`Editar filtro ${p.nome}${p.ativo ? "" : " (desligado)"}`}
              onClick={() => editar(p)}
            >
              <span className={p.ativo ? "" : "u-desligado"}>
                {p.nome}
                {!p.ativo && " (desligado)"}
              </span>
              <span className="rail-contagem">{contagens[p.id] ?? 0}</span>
            </button>
          ))}
          {lista.length === 0 && <p className="dica">Nenhum filtro ainda.</p>}
        </div>

        <div className="rail-grupo">
          <button className="btn btn-cheio" onClick={novo}>
            + Novo perfil
          </button>
          {/* Os modelos prontos herdados do radar são de TI; só aparecem
              para quem ainda não tem perfil, como atalho. */}
          {lista.length === 0 && (
            <button className="btn btn-cheio" onClick={semear} disabled={salvando}>
              Usar modelos de TI
            </button>
          )}
        </div>

        <div className="rail-grupo">
          <p className="rail-titulo">Buscar</p>
          <button
            className="btn btn-cheio btn-primario"
            onClick={buscar}
            disabled={buscando}
          >
            {buscando ? "Varrendo o PNCP…" : "Procurar agora"}
          </button>
          <p className="dica">
            Varre o PNCP agora e aplica os perfis ligados de TODOS os clientes. Leva de
            20s a alguns minutos, conforme o PNCP responde.
          </p>
        </div>
      </nav>

      <div>
        {/* sem rascunho aberto o aviso é sobre a lista (ex: semeadura).
            Com o editor aberto ele vai lá pra baixo, colado no botão que
            causou o erro — no topo da coluna ele fica fora da tela e some
            do campo de visão de quem acabou de clicar em Salvar. */}
        {aviso && !rascunho && <p className="aviso">{aviso}</p>}

        {buscando && (
          <p className="aviso">
            Varrendo o PNCP no Brasil inteiro… não feche a página. A API é lenta quando está
            sob carga, então isso pode levar alguns minutos.
          </p>
        )}

        {resultado && !buscando && (
          <div className={`aviso ${resultado.ok ? "" : "aviso-erro"}`}>
            <p style={{ margin: 0 }}>{resultado.mensagem}</p>
            {resultado.porCliente && Object.keys(resultado.porCliente).length > 0 && (
              <ul className="resultado-lista">
                {Object.entries(resultado.porCliente)
                  .sort((a, b) => b[1] - a[1])
                  .map(([nome, n]) => (
                    <li key={nome}>
                      <b>{n}</b> {nome}
                    </li>
                  ))}
              </ul>
            )}
            {resultado.detalhe && <p className="dica">{resultado.detalhe}</p>}
          </div>
        )}

        {!rascunho ? (
          <div className="vazio">
            <p>Cada perfil descreve um tipo de licitação que este cliente pode disputar.</p>
            <p className="dica">
              Um cliente pode ter vários (ex: &quot;Manutenção predial&quot; e &quot;Ar-condicionado&quot;),
              cada um com termos, estados e <b>score de alerta</b> próprios. A coleta pontua cada
              licitação contra todos e fica com o de maior score deste cliente. Comece pelo
              assistente de termos: ele já vem com a descrição do cliente.
            </p>
          </div>
        ) : (
          <Editor
            r={rascunho}
            contexto={contexto}
            set={setRascunho}
            aviso={aviso}
            key={rascunho.id ?? "novo"}
            onSalvar={salvar}
            onCancelar={() => setRascunho(null)}
            onApagar={
              rascunho.id ? () => apagar(lista.find((x) => x.id === rascunho.id)!) : undefined
            }
            onAlternar={
              rascunho.id
                ? () => {
                    const p = lista.find((x) => x.id === rascunho.id)!;
                    alternarAtivo(p);
                    setRascunho({ ...rascunho, ativo: !rascunho.ativo });
                  }
                : undefined
            }
            salvando={salvando}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Assistente de termos. Fica DENTRO do editor porque o resultado dele é uma
 * edição do filtro aberto: sugerir num canto e obrigar a copiar à mão no
 * outro seria transformar a ajuda em digitação.
 */
function Assistente({
  r,
  contexto,
  aplicar,
}: {
  r: Rascunho;
  contexto: string;
  aplicar: (s: NonNullable<SaidaSugestao["sugestao"]>, modo: "somar" | "substituir") => void;
}) {
  const [descricao, setDescricao] = useState(contexto);
  const [sementes, setSementes] = useState("");
  const [rodando, setRodando] = useState(false);
  const [saida, setSaida] = useState<SaidaSugestao | null>(null);

  async function pedir() {
    setRodando(true);
    setSaida(null);
    try {
      setSaida(
        await sugerirTermosAgora({
          descricao,
          sementes: sementes
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          termosAtuais: r.termos_positivos.filter((t) => t.termo.trim()),
        })
      );
    } catch (e) {
      setSaida({ ok: false, mensagem: (e as Error).message });
    } finally {
      setRodando(false);
    }
  }

  const s = saida?.sugestao;

  return (
    <div className="editor-secao assistente">
      <h3 className="editor-titulo">Assistente de termos</h3>
      <p className="dica">
        Ele varre o PNCP, lê os objetos <b>reais</b> das contratações abertas hoje e propõe
        termos com base em como os órgãos escrevem — não no que você chamaria. É a diferença
        entre procurar &quot;laje&quot; e descobrir que o edital diz &quot;vigota
        treliçada&quot;.
      </p>

      <label className="campo-rotulado">
        <span>O que o cliente vende ou presta</span>
        <textarea
          className="campo campo-area"
          rows={3}
          value={descricao}
          placeholder="ex: fabrico e entrego pré-moldados de concreto — blocos de vedação, lajes treliçadas, vigotas, meio-fio. Entrego num raio de 200km."
          onChange={(e) => setDescricao(e.target.value)}
        />
      </label>

      <label className="campo-rotulado">
        <span>Palavras de partida (separadas por vírgula)</span>
        <input
          className="campo"
          value={sementes}
          placeholder="bloco, laje, concreto"
          onChange={(e) => setSementes(e.target.value)}
        />
        <em className="dica">
          Só entram na amostra os objetos que contêm alguma delas. Prefira palavras gerais —
          se ninguém escreve exatamente a sua, a amostra volta vazia.
        </em>
      </label>

      <button className="btn btn-primario" onClick={pedir} disabled={rodando || !descricao.trim()}>
        {rodando ? "Lendo o PNCP e pensando…" : "Sugerir termos"}
      </button>

      {rodando && (
        <p className="dica">
          Varrendo o PNCP e mandando a amostra para a IA. Leva de 30s a 2 minutos.
        </p>
      )}

      {saida && !rodando && (
        <div className={`aviso ${saida.ok ? "" : "aviso-erro"}`}>
          <p style={{ margin: 0 }}>{saida.mensagem}</p>
        </div>
      )}

      {s && (
        <div className="sugestao">
          <p className="dica">{s.raciocinio}</p>

          {s.observacoes.length > 0 && (
            <ul className="resultado-lista">
              {s.observacoes.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}

          <h4 className="editor-titulo">Termos que pontuam ({s.termos_positivos.length})</h4>
          <div className="termos">
            {s.termos_positivos.map((t) => (
              <span className="termo" key={t.termo}>
                {t.termo} · {t.peso}
              </span>
            ))}
          </div>

          {s.termos_negativos.length > 0 && (
            <>
              <h4 className="editor-titulo">Termos que vetam ({s.termos_negativos.length})</h4>
              <div className="termos">
                {s.termos_negativos.map((t) => (
                  <span className="termo" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="acoes acoes-editor">
            <button className="btn btn-primario" onClick={() => aplicar(s, "somar")}>
              Somar aos meus termos
            </button>
            <button className="btn" onClick={() => aplicar(s, "substituir")}>
              Substituir os meus
            </button>
          </div>
          <p className="dica">
            Nada é salvo até você clicar em <b>Salvar perfil</b> lá embaixo.
          </p>
        </div>
      )}
    </div>
  );
}

function Editor({
  r,
  contexto,
  set,
  aviso,
  onSalvar,
  onCancelar,
  onApagar,
  onAlternar,
  salvando,
}: {
  r: Rascunho;
  contexto: string;
  set: (x: Rascunho) => void;
  aviso: string | null;
  onSalvar: () => void;
  onCancelar: () => void;
  onApagar?: () => void;
  onAlternar?: () => void;
  salvando: boolean;
}) {
  const mudar = (campo: Partial<Rascunho>) => set({ ...r, ...campo });

  // o que o servidor recusaria, dito aqui antes de você clicar e não
  // entender por que nada aconteceu
  const semNome = !r.nome.trim();
  const semTermo = r.termos_positivos.every((t) => !t.termo.trim());
  const alertaAbaixoDoMinimo = r.score_alerta < r.score_minimo;
  const impedimento = semNome
    ? "Dê um nome ao perfil."
    : semTermo
      ? "Escreva pelo menos um termo que pontua — sem isso o filtro nunca casaria nada."
      : alertaAbaixoDoMinimo
        ? "O score de alerta não pode ser menor que o mínimo: alertaria o que nem entra no radar."
        : null;

  function mudarTermo(i: number, t: Partial<TermoPositivo>) {
    const ts = r.termos_positivos.map((x, n) => (n === i ? { ...x, ...t } : x));
    mudar({ termos_positivos: ts });
  }

  return (
    <section className="editor">
      <div className="editor-topo">
        <input
          className="campo campo-titulo"
          value={r.nome}
          placeholder="Nome do perfil"
          onChange={(e) => mudar({ nome: e.target.value })}
          aria-label="Nome do perfil"
        />
        {onAlternar && (
          <button className="btn" aria-pressed={r.ativo} onClick={onAlternar}>
            {r.ativo ? "Ligado" : "Desligado"}
          </button>
        )}
      </div>

      <Secao
        titulo="Termos que pontuam"
        dica="Peso é quanto cada termo soma. Dois termos de peso 35 ou mais casando ganham +10 de bônus."
      >
        {r.termos_positivos.map((t, i) => (
          <div className="linha-termo" key={i}>
            <input
              className="campo"
              value={t.termo}
              placeholder="ex: desenvolvimento de sistema"
              onChange={(e) => mudarTermo(i, { termo: e.target.value })}
              aria-label={`Termo ${i + 1}`}
            />
            <input
              className="campo campo-peso"
              type="number"
              value={t.peso}
              min={0}
              max={100}
              onChange={(e) => mudarTermo(i, { peso: Number(e.target.value) })}
              aria-label={`Peso do termo ${i + 1}`}
            />
            <button
              className="btn btn-icone"
              aria-label={`Remover termo ${i + 1}`}
              onClick={() =>
                mudar({ termos_positivos: r.termos_positivos.filter((_, n) => n !== i) })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            mudar({ termos_positivos: [...r.termos_positivos, { termo: "", peso: 30 }] })
          }
        >
          + Termo
        </button>
      </Secao>

      <Secao
        titulo="Termos que vetam"
        dica="Veto, não desconto: se qualquer um casar, a licitação é descartada mesmo com score alto. Um por linha."
      >
        <textarea
          className="campo campo-area"
          value={r.termos_negativos.join("\n")}
          onChange={(e) => mudar({ termos_negativos: e.target.value.split("\n") })}
          rows={6}
          aria-label="Termos negativos, um por linha"
        />
        <p className="dica">{r.termos_negativos.filter((t) => t.trim()).length} termos de veto</p>
      </Secao>

      <Assistente
        r={r}
        contexto={contexto}
        aplicar={(sug, modo) => {
          const jaTem = new Set(
            (modo === "somar" ? r.termos_positivos : []).map((t) => t.termo.trim())
          );
          const positivos =
            modo === "substituir"
              ? sug.termos_positivos
              : [
                  ...r.termos_positivos.filter((t) => t.termo.trim()),
                  ...sug.termos_positivos.filter((t) => !jaTem.has(t.termo)),
                ];
          const negJa = new Set(modo === "somar" ? r.termos_negativos : []);
          const negativos =
            modo === "substituir"
              ? sug.termos_negativos
              : [...r.termos_negativos, ...sug.termos_negativos.filter((t) => !negJa.has(t))];
          mudar({ termos_positivos: positivos, termos_negativos: negativos });
        }}
      />

      <Secao titulo="Estados" dica="Nenhum selecionado = Brasil inteiro.">
        <div className="ufs">
          {UFS.map((sigla) => {
            const on = r.ufs.includes(sigla);
            return (
              <button
                key={sigla}
                className="btn btn-uf"
                aria-pressed={on}
                onClick={() =>
                  mudar({
                    ufs: on ? r.ufs.filter((u) => u !== sigla) : [...r.ufs, sigla],
                  })
                }
              >
                {sigla}
              </button>
            );
          })}
        </div>
        {r.ufs.length > 0 && (
          <button className="btn" onClick={() => mudar({ ufs: [] })}>
            Limpar — voltar para Brasil inteiro
          </button>
        )}
      </Secao>

      <Secao
        titulo="Cortes"
        dica="Valor 0 ou sigiloso nunca descarta — muito órgão marca o estimado como sigiloso."
      >
        <div className="grade-campos">
          <Campo
            rotulo="Valor mínimo (R$)"
            valor={r.valor_min}
            onChange={(v) => mudar({ valor_min: v })}
          />
          <Campo
            rotulo="Valor máximo (R$)"
            valor={r.valor_max}
            onChange={(v) => mudar({ valor_max: v })}
          />
          <Campo
            rotulo="Score mínimo"
            valor={r.score_minimo}
            onChange={(v) => mudar({ score_minimo: v ?? 0 })}
            dica="abaixo disso nem guarda"
          />
          <Campo
            rotulo="Score de alerta"
            valor={r.score_alerta}
            onChange={(v) => mudar({ score_alerta: v ?? 0 })}
            dica="acima disso te avisa no WhatsApp"
          />
        </div>
      </Secao>

      {(impedimento || aviso) && (
        <p className={`aviso ${impedimento ? "aviso-erro" : ""}`}>{impedimento ?? aviso}</p>
      )}

      <div className="acoes acoes-editor">
        <button
          className="btn btn-primario"
          onClick={onSalvar}
          disabled={salvando || impedimento != null}
        >
          {salvando ? "Salvando…" : "Salvar perfil"}
        </button>
        <button className="btn" onClick={onCancelar}>
          Cancelar
        </button>
        {onApagar && (
          <button className="btn btn-perigo" onClick={onApagar}>
            Apagar
          </button>
        )}
      </div>
    </section>
  );
}

function Secao({
  titulo,
  dica,
  children,
}: {
  titulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="editor-secao">
      <h3 className="editor-titulo">{titulo}</h3>
      {dica && <p className="dica">{dica}</p>}
      {children}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  dica,
}: {
  rotulo: string;
  valor: number | null;
  onChange: (v: number | null) => void;
  dica?: string;
}) {
  return (
    <label className="campo-rotulado">
      <span>{rotulo}</span>
      <input
        className="campo"
        type="number"
        value={valor ?? ""}
        placeholder="sem limite"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {dica && <em className="dica">{dica}</em>}
    </label>
  );
}
