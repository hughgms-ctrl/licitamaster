"use client";

import { useState, useTransition } from "react";
import { Gavel, Loader2, Pencil, Plus, X } from "lucide-react";
import { salvarResultado } from "@/app/acoes";
import type { DisputaCompleta } from "@/lib/db";
import { formatarData, formatarValor } from "@/lib/formato";
import { lerReais, reaisParaTexto, type ResultadoDisputa } from "@/lib/resultado";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Campo } from "./ui/campo";
import { Aviso } from "./ui/aviso";

interface Linha {
  nome: string;
  lance: string;
}

/**
 * Registro da sessão de lances. A disputa acontece no portal do governo; aqui
 * fica o que importa para a próxima: por quanto se ganhou, quem ganhou e onde
 * o cliente ficou. É isso que, com volume, vira inteligência de preço.
 */
export default function RegistroLances({
  d,
  inicial,
  salvo,
}: {
  d: DisputaCompleta;
  inicial: ResultadoDisputa | null;
  salvo: (r: ResultadoDisputa) => void;
}) {
  const ganhou = d.status === "ganhou";
  const nomeCliente = d.cliente.nome_fantasia || d.cliente.razao_social;
  const [editando, setEditando] = useState(!inicial);
  const [nosso, setNosso] = useState(reaisParaTexto(inicial?.nosso_lance));
  const [posicao, setPosicao] = useState(inicial?.posicao?.toString() ?? (ganhou ? "1" : ""));
  const [participantes, setParticipantes] = useState(inicial?.participantes?.toString() ?? "");
  const [vencedor, setVencedor] = useState(inicial?.vencedor_nome ?? "");
  const [lanceVencedor, setLanceVencedor] = useState(reaisParaTexto(inicial?.vencedor_lance));
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial?.concorrentes.length
      ? inicial.concorrentes.map((c) => ({ nome: c.nome, lance: reaisParaTexto(c.lance) }))
      : [{ nome: "", lance: "" }]
  );
  const [obs, setObs] = useState(inicial?.observacao ?? "");
  const [saida, setSaida] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const nossoN = lerReais(nosso);
  const vencedorN = ganhou ? nossoN : lerReais(lanceVencedor);
  const piso = d.preco_minimo;
  const estimado = d.licitacao.valor_estimado;

  if (!editando && inicial) {
    return (
      <div className="space-y-3 rounded-md border bg-background/40 p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-medium">
            <Gavel className="size-4 text-muted-foreground" />
            Resultado da sessão
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            <Pencil />
            Editar
          </Button>
        </div>
        <Resumo r={inicial} piso={piso} estimado={estimado} />
        {inicial.concorrentes.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {inicial.concorrentes.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{c.nome || "Concorrente sem nome"}</span>
                <span className="num font-medium">{c.lance ? formatarValor(c.lance) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
        {inicial.observacao && <p className="leading-relaxed text-muted-foreground">{inicial.observacao}</p>}
        {inicial.updated_at && (
          <p className="text-xs text-muted-foreground">
            Registrado {inicial.registrado_por ? `por ${inicial.registrado_por} ` : ""}em {formatarData(inicial.updated_at)}
          </p>
        )}
      </div>
    );
  }

  function salvar() {
    setSaida(null);
    const r = {
      nosso_lance: nossoN,
      posicao: posicao ? Number(posicao) : null,
      participantes: participantes ? Number(participantes) : null,
      vencedor_nome: ganhou ? nomeCliente : vencedor || null,
      vencedor_lance: vencedorN,
      concorrentes: linhas
        .filter((l) => l.nome.trim() || l.lance.trim())
        .map((l) => ({ nome: l.nome.trim(), lance: lerReais(l.lance) })),
      observacao: obs || null,
    };
    iniciar(async () => {
      try {
        const s = await salvarResultado(d.id, r);
        setSaida(s);
        if (s.ok) {
          salvo({ ...r, disputa_id: d.id, licitacao_id: d.licitacao_id, updated_at: new Date().toISOString() });
          setEditando(false);
        }
      } catch (e) {
        setSaida({ ok: false, mensagem: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-background/40 p-4 text-sm">
      <div className="space-y-1">
        <span className="inline-flex items-center gap-2 font-medium">
          <Gavel className="size-4 text-muted-foreground" />
          Registrar a sessão de lances
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Copie do portal os lances finais, ganhando ou perdendo. Com o tempo, isso mostra por quanto se ganha cada tipo
          de licitação.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo={`Último lance de ${nomeCliente}`}>
          <Input className="num" inputMode="decimal" placeholder="ex: 189.300,00" value={nosso} onChange={(e) => setNosso(e.target.value)} />
        </Campo>
        <Campo rotulo="Posição final">
          <Input className="num" type="number" min={1} placeholder="ex: 1" value={posicao} onChange={(e) => setPosicao(e.target.value)} />
        </Campo>
        <Campo rotulo="Participantes">
          <Input className="num" type="number" min={1} placeholder="ex: 3" value={participantes} onChange={(e) => setParticipantes(e.target.value)} />
        </Campo>
      </div>

      {!ganhou && (
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <Campo rotulo="Quem ganhou">
            <Input placeholder="Nome da empresa vencedora" value={vencedor} onChange={(e) => setVencedor(e.target.value)} />
          </Campo>
          <Campo rotulo="Lance vencedor">
            <Input className="num" inputMode="decimal" placeholder="ex: 176.000,00" value={lanceVencedor} onChange={(e) => setLanceVencedor(e.target.value)} />
          </Campo>
        </div>
      )}

      {nossoN && (
        <Resumo
          r={{ nosso_lance: nossoN, vencedor_lance: vencedorN, posicao: posicao ? Number(posicao) : null, participantes: participantes ? Number(participantes) : null, vencedor_nome: ganhou ? nomeCliente : vencedor }}
          piso={piso}
          estimado={estimado}
        />
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Outros concorrentes (último lance de cada)</p>
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Empresa"
              value={l.nome}
              aria-label={`Concorrente ${i + 1}`}
              onChange={(e) => setLinhas((xs) => xs.map((x, n) => (n === i ? { ...x, nome: e.target.value } : x)))}
            />
            <Input
              className="num w-40 shrink-0"
              inputMode="decimal"
              placeholder="Lance"
              value={l.lance}
              aria-label={`Lance do concorrente ${i + 1}`}
              onChange={(e) => setLinhas((xs) => xs.map((x, n) => (n === i ? { ...x, lance: e.target.value } : x)))}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              aria-label={`Remover concorrente ${i + 1}`}
              onClick={() => setLinhas((xs) => (xs.length === 1 ? [{ nome: "", lance: "" }] : xs.filter((_, n) => n !== i)))}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setLinhas((xs) => [...xs, { nome: "", lance: "" }])}>
          <Plus />
          Concorrente
        </Button>
      </div>

      <Campo rotulo="Observação (opcional)">
        <Textarea
          rows={2}
          placeholder={ganhou ? "ex: pregoeiro tentou negociar, mantivemos o valor" : "ex: desclassificados por atestado incompatível"}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
      </Campo>

      {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pendente || !nossoN} onClick={salvar}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar resultado
        </Button>
        {inicial && (
          <Button size="sm" variant="ghost" disabled={pendente} onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Os números que importam: lance final, distância do vencedor, folga sobre o piso. */
function Resumo({
  r,
  piso,
  estimado,
}: {
  r: Pick<ResultadoDisputa, "nosso_lance" | "vencedor_lance" | "posicao" | "participantes" | "vencedor_nome">;
  piso: number | null;
  estimado: number | null;
}) {
  const nosso = r.nosso_lance;
  const venc = r.vencedor_lance;
  const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const brl = (x: number) => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const terceiro =
    r.posicao === 1
      ? nosso && estimado
        ? pct((estimado - nosso) / estimado)
        : "—"
      : nosso && venc
        ? `+${pct((nosso - venc) / venc)}`
        : "—";
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-muted/50 p-3 sm:grid-cols-4">
      <div>
        <dt className="text-xs text-muted-foreground">Nosso lance</dt>
        <dd className="num font-semibold">{nosso ? formatarValor(nosso) : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Posição</dt>
        <dd className="num font-semibold">
          {r.posicao ? `${r.posicao}º` : "—"}
          {r.participantes ? ` de ${r.participantes}` : ""}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">{r.posicao === 1 ? "Abaixo do estimado" : "Distância do vencedor"}</dt>
        <dd className="num font-semibold">
          {terceiro}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Folga sobre o piso</dt>
        <dd className={nosso && piso && nosso < piso ? "num font-semibold text-destructive" : "num font-semibold"}>
          {nosso && piso ? brl(nosso - piso) : "—"}
        </dd>
      </div>
    </dl>
  );
}
