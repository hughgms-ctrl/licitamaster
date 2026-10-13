"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, MessageSquareText } from "lucide-react";
import { marcarPreparo } from "@/app/(mesa)/clientes/acoes";
import { rotuloTipo, type DocumentoResumo } from "@/lib/documentos";
import {
  DOCUMENTOS_BASICOS,
  ITENS_MANUAIS,
  ROTULO_STATUS_PREPARO,
  estadoItem,
  progressoPreparo,
  situacaoDocBasico,
  type ItemManual,
  type Preparo as PreparoT,
  type SituacaoDoc,
  type StatusPreparo,
} from "@/lib/preparo";
import { formatarData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Badge } from "./ui/badge";
import { StatusDot, type Tom } from "./ui/status-dot";
import { Aviso } from "./ui/aviso";

const TOM_STATUS: Record<StatusPreparo, Tom> = {
  pendente: "perigo",
  cliente_informou: "alerta",
  feito: "sucesso",
  nao_se_aplica: "neutro",
};

const QUEM: Record<ItemManual["quem"], string> = {
  cliente: "Cliente faz",
  equipe: "Nossa equipe faz",
  juntos: "Fazemos juntos",
};

const DOC: Record<SituacaoDoc, { rotulo: string; tom: Tom }> = {
  ok: { rotulo: "No cofre", tom: "sucesso" },
  vence_logo: { rotulo: "Vence em breve", tom: "alerta" },
  vencido: { rotulo: "Vencido", tom: "perigo" },
  falta: { rotulo: "Falta enviar", tom: "perigo" },
};

/**
 * O que precisa estar pronto antes da primeira disputa. Os acessos e cadastros
 * a equipe marca; os documentos saem do cofre sozinhos.
 */
export default function Preparo({
  clienteId,
  preparo: inicial,
  documentos,
}: {
  clienteId: string;
  preparo: PreparoT;
  documentos: DocumentoResumo[];
}) {
  const [preparo, setPreparo] = useState<PreparoT>(inicial ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const p = progressoPreparo(preparo, documentos);
  const pct = Math.round((p.prontos / p.total) * 100);
  const grupos = [...new Set(ITENS_MANUAIS.map((i) => i.grupo))];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-[0.9375rem] font-semibold">
              {p.pronto ? "Pronto para disputar" : "Antes da primeira disputa"}
            </h3>
            <p className="text-sm text-muted-foreground">
              <span className="num font-medium text-foreground">
                {p.prontos} de {p.total}
              </span>{" "}
              itens obrigatórios prontos
              {p.aConferir > 0 && (
                <>
                  {" "}
                  · <span className="text-warning">{p.aConferir} para conferir</span>
                </>
              )}
            </p>
          </div>
          <StatusDot tom={p.pronto ? "sucesso" : p.aConferir ? "alerta" : "perigo"}>
            {p.pronto ? "Pode disputar" : "Ainda não pode disputar"}
          </StatusDot>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", p.pronto ? "bg-success" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          O cliente vê no portal o que é dele fazer, com instruções simples, e avisa quando terminar. Você confere e
          marca como feito.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {grupos.map((g) => (
        <section key={g} className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{g}</h4>
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {ITENS_MANUAIS.filter((i) => i.grupo === g).map((item) => (
              <LinhaManual
                key={item.id}
                item={item}
                estado={estadoItem(preparo, item.id)}
                salvar={async (status, nota) => {
                  setErro(null);
                  const antes = preparo;
                  setPreparo((x) => ({
                    ...x,
                    [item.id]: { status, nota, em: new Date().toISOString(), por: "equipe" },
                  }));
                  try {
                    await marcarPreparo(clienteId, item.id, status, nota);
                  } catch (e) {
                    setPreparo(antes);
                    setErro((e as Error).message);
                  }
                }}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">Documentos básicos</h4>
          <span className="text-xs text-muted-foreground">Atualizam sozinhos pelo cofre</span>
        </div>
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {DOCUMENTOS_BASICOS.map((d) => {
            const s = situacaoDocBasico(d.tipo, documentos);
            return (
              <div key={d.tipo} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <span className="w-40 shrink-0">
                  <StatusDot tom={DOC[s.situacao].tom}>{DOC[s.situacao].rotulo}</StatusDot>
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {rotuloTipo(d.tipo)}
                  {!d.obrigatorio && <span className="ml-2 text-xs font-normal text-muted-foreground">recomendado</span>}
                </span>
                {s.doc?.validade && (
                  <span className="num text-xs text-muted-foreground">
                    validade {s.doc.validade.split("-").reverse().join("/")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function LinhaManual({
  item,
  estado,
  salvar,
}: {
  item: ItemManual;
  estado: { status: StatusPreparo; nota?: string | null; em?: string; por?: string };
  salvar: (status: StatusPreparo, nota: string | null) => Promise<void>;
}) {
  const [nota, setNota] = useState(estado.nota ?? "");
  const [pendente, iniciar] = useTransition();
  const doCliente = estado.por === "cliente";

  return (
    <div className="space-y-2.5 px-4 py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{item.rotulo}</span>
            <Badge variant="secondary" className="font-normal">
              {QUEM[item.quem]}
            </Badge>
            {!item.obrigatorio && <span className="text-xs text-muted-foreground">opcional</span>}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{item.dica}</p>
          {item.link && (
            <a
              href={item.link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline dark:text-sidebar-primary"
            >
              <ExternalLink className="size-3" />
              {item.link.rotulo}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <span className="hidden sm:block">
            <StatusDot tom={TOM_STATUS[estado.status]}>{ROTULO_STATUS_PREPARO[estado.status]}</StatusDot>
          </span>
          <NativeSelect
            aria-label={`Situação de ${item.rotulo}`}
            className="w-44"
            value={estado.status}
            onChange={(e) => {
              const status = e.target.value as StatusPreparo;
              iniciar(() => salvar(status, nota || null));
            }}
          >
            {(Object.keys(ROTULO_STATUS_PREPARO) as StatusPreparo[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PREPARO[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {doCliente && estado.nota && (
        <p className="flex items-start gap-2 rounded-md bg-warning/5 px-3 py-2 text-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="text-muted-foreground">O cliente escreveu: </span>“{estado.nota}”
          </span>
        </p>
      )}
      <div className="flex items-center gap-2">
        {!doCliente && (
        <Input
          className="h-8 text-xs"
          placeholder="Nota interna (ex: SICAF nível III, falta o IV)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => {
            if (nota !== (estado.nota ?? "")) iniciar(() => salvar(estado.status, nota || null));
          }}
          aria-label={`Nota sobre ${item.rotulo}`}
        />
        )}
        {estado.em && (
          <span className="num ml-auto shrink-0 text-xs text-muted-foreground">
            {doCliente ? "cliente, " : ""}
            {formatarData(estado.em)}
          </span>
        )}
      </div>
    </div>
  );
}
