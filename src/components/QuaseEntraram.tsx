"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Loader2, SearchCheck } from "lucide-react";
import { trazerParaTriagem } from "@/app/acoes";
import { formatarData, formatarValor, limparObjeto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Aviso } from "./ui/aviso";
import { Vazio } from "./ui/vazio";

export interface LinhaQuase {
  numero_controle_pncp: string;
  score: number;
  termos: string[];
  tipo: "nota_baixa" | "termo_negativo" | "valor" | "area";
  motivo: string;
  objeto: string | null;
  orgao: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  valor_estimado: number | null;
  data_encerramento_proposta: string | null;
  link: string | null;
}

const ROTULO: Record<LinhaQuase["tipo"], string> = {
  nota_baixa: "Nota baixa",
  termo_negativo: "Termo negativo",
  valor: "Faixa de valor",
  area: "Fora da área",
};

/** O que mexer no perfil quando muitas de um tipo são do ramo do cliente. */
const DICA: Record<LinhaQuase["tipo"], string> = {
  nota_baixa: "casaram poucos termos. Se forem do ramo, baixe a nota mínima do perfil ou aumente o peso desses termos.",
  termo_negativo: "um termo negativo vetou. Se forem do ramo, tire o termo do perfil.",
  valor: "o valor está fora da faixa do perfil. Se o cliente aguenta, alargue a faixa.",
  area: "são de lugares fora da área do perfil. Se o cliente atende lá, inclua o estado ou a cidade.",
};

/**
 * Licitações que casaram termos do ramo do cliente mas ficaram de fora da
 * triagem. Serve para conferir se o perfil está apertado demais, e para
 * trazer na mão a que valer a pena.
 */
export default function QuaseEntraram({ clienteId, linhas: iniciais }: { clienteId: string; linhas: LinhaQuase[] }) {
  const [linhas, setLinhas] = useState(iniciais);
  const [filtro, setFiltro] = useState<LinhaQuase["tipo"] | "todos">("todos");

  const porTipo = useMemo(() => {
    const m = new Map<LinhaQuase["tipo"], number>();
    for (const l of linhas) m.set(l.tipo, (m.get(l.tipo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [linhas]);

  // Os vetos que mais cortaram: é ali que o perfil costuma estar errado.
  const vetos = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) if (l.tipo === "termo_negativo") m.set(l.motivo, (m.get(l.motivo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [linhas]);

  const visiveis = filtro === "todos" ? linhas : linhas.filter((l) => l.tipo === filtro);

  if (linhas.length === 0) {
    return (
      <Vazio icone={SearchCheck} titulo="Nada ficou de fora por pouco.">
        <p>
          A cada coleta, o que casa termos do ramo deste cliente mas não entra na triagem aparece aqui, com o motivo. Se a
          lista fica vazia por dias, o perfil não está deixando nada de bom para trás.
        </p>
      </Vazio>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
        <p className="leading-relaxed">
          <b className="num">{linhas.length}</b> {linhas.length === 1 ? "licitação aberta casou" : "licitações abertas casaram"}{" "}
          termos do ramo deste cliente e ficaram fora da triagem. Passe o olho: se várias forem boas, o perfil está apertado.
        </p>
        <ul className="space-y-1 text-muted-foreground">
          {porTipo.map(([tipo, n]) => (
            <li key={tipo}>
              <b className="num text-foreground">{n}</b> {ROTULO[tipo].toLowerCase()}: {DICA[tipo]}
            </li>
          ))}
        </ul>
        {vetos.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Vetos que mais cortaram: {vetos.map(([m, n]) => `${m.replace("termo negativo: ", "“")}” (${n})`).join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["todos", ...porTipo.map(([t]) => t)] as const).map((t) => (
          <Button key={t} size="sm" variant={filtro === t ? "default" : "outline"} onClick={() => setFiltro(t)}>
            {t === "todos" ? `Todas (${linhas.length})` : `${ROTULO[t]} (${porTipo.find(([x]) => x === t)?.[1]})`}
          </Button>
        ))}
      </div>

      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {visiveis.map((l) => (
          <Linha
            key={l.numero_controle_pncp}
            l={l}
            clienteId={clienteId}
            sair={() => setLinhas((xs) => xs.filter((x) => x.numero_controle_pncp !== l.numero_controle_pncp))}
          />
        ))}
      </ul>
    </div>
  );
}

function Linha({ l, clienteId, sair }: { l: LinhaQuase; clienteId: string; sair: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [trazida, setTrazida] = useState<string | null>(null);

  function trazer() {
    setErro(null);
    iniciar(async () => {
      try {
        const s = await trazerParaTriagem(l.numero_controle_pncp, clienteId);
        if (!s.ok) setErro(s.mensagem);
        else if (s.disputaId) setTrazida(s.disputaId);
        else sair();
      } catch (e) {
        setErro((e as Error).message);
      }
    });
  }

  return (
    <li className={cn("space-y-2 p-4", trazida && "bg-success/5")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{ROTULO[l.tipo]}</span>
        <span>{l.motivo}</span>
      </div>
      <p className="line-clamp-2 font-medium leading-snug">{limparObjeto(l.objeto ?? "")}</p>
      <p className="num text-sm text-muted-foreground">
        {[
          l.orgao,
          [l.municipio, l.uf].filter(Boolean).join("/"),
          formatarValor(l.valor_estimado),
          l.data_encerramento_proposta ? `até ${formatarData(l.data_encerramento_proposta)}` : "sem prazo",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {l.termos.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Casou: {l.termos.map((t) => `“${t}”`).join(", ")} (nota {l.score})
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {trazida ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/disputas/${trazida}`}>
              <ArrowUpRight />
              Na triagem: abrir
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled={pendente} onClick={trazer}>
            {pendente ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
            Trazer para a triagem
          </Button>
        )}
        {l.link && (
          <Button size="sm" variant="ghost" asChild>
            <a href={l.link} target="_blank" rel="noreferrer">
              <ExternalLink />
              Abrir no PNCP
            </a>
          </Button>
        )}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </li>
  );
}
