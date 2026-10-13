"use client";

import { useState } from "react";
import type { Perfil, TermoPositivo } from "@/lib/scoring";
import {
  procurarAgora,
  sugerirTermosAgora,
  type SaidaBusca,
  type SaidaSugestao,
} from "@/app/filtros/acoes";
import { Loader2, Plus, Radar, Search, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { Aviso } from "./ui/aviso";
import { Vazio } from "./ui/vazio";
import { Campo as CampoBase } from "./ui/campo";
import { useConfirmar } from "./ui/confirmar";

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
  const [confirmar, dialogo] = useConfirmar();

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
    if (
      !(await confirmar({
        titulo: `Apagar o perfil "${p.nome}"?`,
        texto: "As licitações que ele já sugeriu continuam na mesa.",
        confirmar: "Apagar",
        destrutivo: true,
      }))
    )
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
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Filtros salvos" className="space-y-4">
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-medium">Perfis</span>
            <Button size="sm" variant="ghost" onClick={novo}>
              <Plus />
              Novo
            </Button>
          </div>
          {lista.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum filtro ainda.</p>
          ) : (
            <div className="divide-y">
              {lista.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={rascunho?.id === p.id}
                  aria-label={`Editar filtro ${p.nome}${p.ativo ? "" : " (desligado)"}`}
                  onClick={() => editar(p)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    rascunho?.id === p.id && "bg-accent"
                  )}
                >
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", p.ativo ? "bg-success" : "bg-muted-foreground/40")}
                    aria-hidden="true"
                  />
                  <span className={cn("min-w-0 flex-1 truncate", !p.ativo && "text-muted-foreground")}>
                    {p.nome}
                    {!p.ativo && " (desligado)"}
                  </span>
                  <span className="num text-xs text-muted-foreground" title="Na triagem agora">
                    {contagens[p.id] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
          {/* Os modelos prontos herdados do radar são de TI; só aparecem
              para quem ainda não tem perfil, como atalho. */}
          {lista.length === 0 && (
            <div className="border-t p-2">
              <Button variant="outline" size="sm" className="w-full" onClick={semear} disabled={salvando}>
                Usar modelos de TI
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-lg border bg-card p-3">
          <Button className="w-full" variant="secondary" onClick={buscar} disabled={buscando}>
            {buscando ? <Loader2 className="animate-spin" /> : <Radar />}
            {buscando ? "Varrendo o PNCP…" : "Procurar agora"}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Varre o PNCP agora e aplica os perfis ligados de todos os clientes. Leva de 20s a alguns
            minutos, conforme o PNCP responde.
          </p>
        </div>
      </nav>

      <div className="min-w-0 space-y-4">
        {/* sem rascunho aberto o aviso é sobre a lista (ex: semeadura).
            Com o editor aberto ele vai lá pra baixo, colado no botão que
            causou o erro — no topo da coluna ele fica fora da tela e some
            do campo de visão de quem acabou de clicar em Salvar. */}
        {aviso && !rascunho && <Aviso>{aviso}</Aviso>}

        {buscando && (
          <Aviso titulo="Varrendo o PNCP no Brasil inteiro…">
            Não feche a página. A API é lenta quando está sob carga, então isso pode levar alguns minutos.
          </Aviso>
        )}

        {resultado && !buscando && (
          <Aviso tom={resultado.ok ? "sucesso" : "erro"}>
            <p>{resultado.mensagem}</p>
            {resultado.porCliente && Object.keys(resultado.porCliente).length > 0 && (
              <ul className="space-y-0.5">
                {Object.entries(resultado.porCliente)
                  .sort((a, b) => b[1] - a[1])
                  .map(([nome, n]) => (
                    <li key={nome}>
                      <b className="num">{n}</b> {nome}
                    </li>
                  ))}
              </ul>
            )}
            {resultado.detalhe && <p className="text-xs text-muted-foreground">{resultado.detalhe}</p>}
          </Aviso>
        )}

        {!rascunho ? (
          <Vazio icone={Search} titulo="Cada perfil descreve um tipo de licitação que este cliente pode disputar.">
            <p>
              Um cliente pode ter vários (ex: &quot;Manutenção predial&quot; e &quot;Ar-condicionado&quot;), cada um
              com termos, estados e score de alerta próprios. A coleta pontua cada licitação contra todos e
              fica com o de maior score deste cliente. Comece pelo assistente de termos: ele já vem com a
              descrição do cliente.
            </p>
            <Button size="sm" onClick={novo}>
              <Plus />
              Novo perfil
            </Button>
          </Vazio>
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
      {dialogo}
    </div>
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
    <Secao
      titulo={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 text-primary dark:text-sidebar-primary" />
          Assistente de termos
        </span>
      }
      dica="Ele varre o PNCP, lê os objetos reais das contratações abertas hoje e propõe termos com base em como os órgãos escrevem — não no que você chamaria. É a diferença entre procurar “laje” e descobrir que o edital diz “vigota treliçada”."
      className="bg-muted/30"
    >
      <CampoBase rotulo="O que o cliente vende ou presta">
        <Textarea
          rows={3}
          value={descricao}
          placeholder="ex: fabrico e entrego pré-moldados de concreto — blocos de vedação, lajes treliçadas, vigotas, meio-fio. Entrego num raio de 200km."
          onChange={(e) => setDescricao(e.target.value)}
        />
      </CampoBase>

      <CampoBase
        rotulo="Palavras de partida (separadas por vírgula)"
        dica="Só entram na amostra os objetos que contêm alguma delas. Prefira palavras gerais — se ninguém escreve exatamente a sua, a amostra volta vazia."
      >
        <Input value={sementes} placeholder="bloco, laje, concreto" onChange={(e) => setSementes(e.target.value)} />
      </CampoBase>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={pedir} disabled={rodando || !descricao.trim()}>
          {rodando ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {rodando ? "Lendo o PNCP e pensando…" : "Sugerir termos"}
        </Button>
        {rodando && (
          <p className="text-xs text-muted-foreground">Varrendo o PNCP e mandando a amostra para a IA. Leva de 30s a 2 minutos.</p>
        )}
      </div>

      {saida && !rodando && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}

      {s && (
        <div className="space-y-4 rounded-md border bg-card p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{s.raciocinio}</p>

          {s.observacoes.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed marker:text-muted-foreground/60">
              {s.observacoes.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Termos que pontuam ({s.termos_positivos.length})</h4>
            <div className="flex flex-wrap gap-1.5">
              {s.termos_positivos.map((t) => (
                <Badge key={t.termo} variant="secondary" className="font-normal">
                  {t.termo}
                  <span className="num text-muted-foreground">{t.peso}</span>
                </Badge>
              ))}
            </div>
          </div>

          {s.termos_negativos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Termos que vetam ({s.termos_negativos.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {s.termos_negativos.map((t) => (
                  <Badge key={t} variant="destructive" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button size="sm" onClick={() => aplicar(s, "somar")}>
              Somar aos meus termos
            </Button>
            <Button size="sm" variant="outline" onClick={() => aplicar(s, "substituir")}>
              Substituir os meus
            </Button>
            <p className="text-xs text-muted-foreground">Nada é salvo até você clicar em Salvar perfil lá embaixo.</p>
          </div>
        </div>
      )}
    </Secao>
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
    <section className="divide-y overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-3 p-4">
        <Input
          className="h-10 flex-1 text-base font-medium"
          value={r.nome}
          placeholder="Nome do perfil"
          onChange={(e) => mudar({ nome: e.target.value })}
          aria-label="Nome do perfil"
        />
        {onAlternar && (
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={r.ativo} onCheckedChange={onAlternar} aria-label="Perfil ligado" />
            {r.ativo ? "Ligado" : "Desligado"}
          </label>
        )}
      </div>

      <Secao
        titulo="Termos que pontuam"
        dica="Peso é quanto cada termo soma. Dois termos de peso 35 ou mais casando ganham +10 de bônus."
      >
        <div className="space-y-2">
          {r.termos_positivos.map((t, i) => (
            <div className="flex items-center gap-2" key={i}>
              <Input
                value={t.termo}
                placeholder="ex: desenvolvimento de sistema"
                onChange={(e) => mudarTermo(i, { termo: e.target.value })}
                aria-label={`Termo ${i + 1}`}
              />
              <Input
                className="num w-20 shrink-0 text-right"
                type="number"
                value={t.peso}
                min={0}
                max={100}
                onChange={(e) => mudarTermo(i, { peso: Number(e.target.value) })}
                aria-label={`Peso do termo ${i + 1}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                aria-label={`Remover termo ${i + 1}`}
                onClick={() => mudar({ termos_positivos: r.termos_positivos.filter((_, n) => n !== i) })}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mudar({ termos_positivos: [...r.termos_positivos, { termo: "", peso: 30 }] })}
        >
          <Plus />
          Termo
        </Button>
      </Secao>

      <Secao
        titulo="Termos que vetam"
        dica="Veto, não desconto: se qualquer um casar, a licitação é descartada mesmo com score alto. Um por linha."
      >
        <Textarea
          value={r.termos_negativos.join("\n")}
          onChange={(e) => mudar({ termos_negativos: e.target.value.split("\n") })}
          rows={6}
          aria-label="Termos negativos, um por linha"
        />
        <p className="text-xs text-muted-foreground">
          <span className="num">{r.termos_negativos.filter((t) => t.trim()).length}</span> termos de veto
        </p>
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

      <Secao
        titulo="Estados"
        dica="Nenhum selecionado = Brasil inteiro."
        acao={
          r.ufs.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => mudar({ ufs: [] })}>
              Limpar — voltar para Brasil inteiro
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9 xl:grid-cols-[repeat(14,minmax(0,1fr))]">
          {UFS.map((sigla) => {
            const on = r.ufs.includes(sigla);
            return (
              <button
                key={sigla}
                aria-pressed={on}
                onClick={() =>
                  mudar({
                    ufs: on ? r.ufs.filter((u) => u !== sigla) : [...r.ufs, sigla],
                  })
                }
                className={cn(
                  "h-8 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground dark:bg-transparent"
                )}
              >
                {sigla}
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao
        titulo="Cortes"
        dica="Valor 0 ou sigiloso nunca descarta — muito órgão marca o estimado como sigiloso."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Campo rotulo="Valor mínimo (R$)" valor={r.valor_min} onChange={(v) => mudar({ valor_min: v })} />
          <Campo rotulo="Valor máximo (R$)" valor={r.valor_max} onChange={(v) => mudar({ valor_max: v })} />
          <Campo
            rotulo="Score mínimo"
            valor={r.score_minimo}
            onChange={(v) => mudar({ score_minimo: v ?? 0 })}
            dica="Abaixo disso nem guarda."
          />
          <Campo
            rotulo="Score de alerta"
            valor={r.score_alerta}
            onChange={(v) => mudar({ score_alerta: v ?? 0 })}
            dica="Acima disso te avisa no WhatsApp."
          />
        </div>
      </Secao>

      <div className="space-y-3 bg-muted/30 p-4">
        {(impedimento || aviso) && <Aviso tom={impedimento ? "erro" : "info"}>{impedimento ?? aviso}</Aviso>}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSalvar} disabled={salvando || impedimento != null}>
            {salvando && <Loader2 className="animate-spin" />}
            {salvando ? "Salvando…" : "Salvar perfil"}
          </Button>
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <span className="flex-1" />
          {onApagar && (
            <Button variant="ghost-destructive" onClick={onApagar}>
              <Trash2 />
              Apagar
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Secao({
  titulo,
  dica,
  children,
  className,
  acao,
}: {
  titulo: React.ReactNode;
  dica?: string;
  children: React.ReactNode;
  className?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-3 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {dica && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{dica}</p>}
        </div>
        {acao}
      </div>
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
    <CampoBase rotulo={rotulo} dica={dica}>
      <Input
        className="num"
        type="number"
        value={valor ?? ""}
        placeholder="sem limite"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </CampoBase>
  );
}
