"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { enviarAoCliente, mudarStatus, type Saida } from "@/app/acoes";
import type { AnaliseIA, DisputaCompleta, StatusDisputa } from "@/lib/db";
import { ROTULO_STATUS, TRANSICOES_OPERADOR } from "@/lib/etapas";
import { limparObjeto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import CopiarLink from "./CopiarLink";
import { Button } from "./ui/button";
import { StatusDot } from "./ui/status-dot";
import { useConfirmar } from "./ui/confirmar";

/**
 * O que a Mesa (cards) e a página da licitação compartilham: as ações de
 * etapa, o prazo, a análise rápida.
 */

/** Rótulo do botão que leva a cada etapa. */
export const ACAO_PARA: Partial<Record<StatusDisputa, string>> = {
  descartada: "Descartar",
  sugerida: "Voltar para a triagem",
  em_preparacao: "Começar preparação",
  proposta_enviada: "Marcar proposta enviada",
  em_disputa: "Marcar sessão aberta",
  ganhou: "Ganhou",
  perdeu: "Perdeu",
  desistiu: "Desistir",
};

export type AvisoMesa = Saida & { titulo: string };

/**
 * Resultado de ações que mudam a licitação de etapa. Vai num aviso flutuante
 * porque na Mesa o card some da aba no mesmo instante; com o link do portal
 * (quando o WhatsApp não saiu), o aviso fica até ser fechado.
 */
export function avisar(a: AvisoMesa) {
  const corpo = (
    <div className="space-y-2">
      <p>{a.mensagem}</p>
      {a.link && <CopiarLink link={a.link} />}
    </div>
  );
  const opcoes = { description: corpo, duration: a.link ? Infinity : 6000, closeButton: true };
  if (a.ok) toast.success(a.titulo, opcoes);
  else toast.error(a.titulo, opcoes);
}

/**
 * Enviar ao cliente e mudar de etapa, com as confirmações. `temFicha` decide
 * se o envio pergunta antes (sem análise profunda o cliente não vê as
 * exigências no portal).
 */
export function useAcoesDisputa(
  d: DisputaCompleta,
  { temFicha, aoMudar }: { temFicha: boolean; aoMudar: (campos: Partial<DisputaCompleta>) => void }
) {
  const [pendente, iniciar] = useTransition();
  const [saida, setSaida] = useState<Saida | null>(null);
  const [confirmar, dialogo] = useConfirmar();
  const titulo = limparObjeto(d.licitacao.objeto).slice(0, 90);

  const destinos = TRANSICOES_OPERADOR[d.status];
  const podeEnviar = d.status === "sugerida" || d.status === "recusada";
  // O passo adiante desta etapa ganha o destaque; voltar e desistir ficam discretos.
  const proximoPasso = podeEnviar
    ? undefined
    : destinos.find((x) => !["descartada", "desistiu", "perdeu", "sugerida"].includes(x));

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

  async function enviar() {
    if (
      !temFicha &&
      !(await confirmar({
        titulo: "Enviar sem a análise profunda?",
        texto:
          "O edital ainda não foi lido. O cliente não vai ver no portal os documentos e atestados que vão exigir dele, e você não confere antes se falta algo no cofre.",
        confirmar: "Enviar assim mesmo",
      }))
    )
      return;
    rodar(
      () => enviarAoCliente(d.id),
      (s) => {
        avisar({ ...s, titulo });
        aoMudar({ status: "aguardando_cliente" });
      }
    );
  }

  async function mudar(para: StatusDisputa) {
    if (
      para === "desistiu" &&
      !(await confirmar({
        titulo: "Desistir desta disputa?",
        texto: "Se a proposta já foi enviada, desistir pode gerar penalidade ao cliente. Confira o edital.",
        confirmar: "Desistir",
        destrutivo: true,
      }))
    )
      return;
    rodar(
      () => mudarStatus(d.id, para),
      () => {
        avisar({
          ok: true,
          mensagem: para === "sugerida" ? "Voltou para a triagem." : `Movida para "${ROTULO_STATUS[para]}".`,
          titulo,
        });
        aoMudar({ status: para });
      }
    );
  }

  function botaoEtapa(para: StatusDisputa, variante: "default" | "outline" | "ghost", className?: string) {
    return (
      <Button
        key={para}
        size="sm"
        variant={variante}
        className={cn(variante === "ghost" && "text-muted-foreground", className)}
        disabled={pendente}
        onClick={() => mudar(para)}
      >
        {d.status === "aguardando_cliente" && para === "sugerida"
          ? "Cancelar envio"
          : (ACAO_PARA[para] ?? ROTULO_STATUS[para])}
      </Button>
    );
  }

  return { pendente, saida, setSaida, rodar, enviar, botaoEtapa, destinos, podeEnviar, proximoPasso, dialogo };
}

/**
 * O prazo. Antes da proposta, conta o tempo que resta; depois, a contagem não
 * serve para nada e o espaço mostra onde a disputa está.
 */
export function calcularPrazo(
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

export function Prazo({ iso, agora, status, className }: { iso: string | null; agora: number; status: StatusDisputa; className?: string }) {
  const prazo = calcularPrazo(iso, agora, status);
  return (
    <div
      className={cn(
        "flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-md border px-1 py-2 text-center sm:w-[4.5rem]",
        prazo.nivel === "critico" && "border-destructive/30 bg-destructive/10 text-destructive",
        prazo.nivel === "atencao" && "border-warning/30 bg-warning/10 text-warning",
        prazo.nivel === "ok" && "border-success/25 bg-success/10 text-success",
        prazo.nivel === "neutro" && "bg-muted/60 text-muted-foreground",
        className
      )}
    >
      <span className="num text-lg font-semibold leading-none tracking-tight">{prazo.num}</span>
      <span className="mt-1 text-[0.6875rem] leading-tight opacity-80">{prazo.rot}</span>
    </div>
  );
}

export function rotuloVeredito(v: AnaliseIA["veredito"]) {
  return v === "vale_a_pena" ? "vale a pena" : v === "nao_vale" ? "não vale" : "talvez";
}

export function tomVeredito(v: AnaliseIA["veredito"]) {
  return v === "vale_a_pena" ? "sucesso" : v === "nao_vale" ? "perigo" : "alerta";
}

/** A análise rápida inteira. */
export function Analise({ a, className }: { a: AnaliseIA; className?: string }) {
  return (
    <div className={cn("space-y-4 text-sm", className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <span className="font-medium">Análise rápida</span>
        <StatusDot tom={tomVeredito(a.veredito)}>{rotuloVeredito(a.veredito)}</StatusDot>
      </div>
      <p className="leading-relaxed">{a.resumo}</p>
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground">O cliente vai ler</h4>
        <p className="leading-relaxed text-muted-foreground">{a.resumo_cliente}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3 print:grid-cols-1">
        <Lista titulo="O que pedem" itens={a.o_que_pedem} />
        <Lista titulo="Riscos" itens={a.riscos} />
        <Lista titulo="Conferir no edital" itens={a.perguntas} />
      </div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <div className="space-y-1.5 break-inside-avoid">
      <h4 className="text-xs font-medium text-muted-foreground">{titulo}</h4>
      <ul className="list-disc space-y-1 pl-4 leading-relaxed marker:text-muted-foreground/60">
        {itens.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function Fato({
  rotulo,
  children,
  num,
  title,
}: {
  rotulo: string;
  children: React.ReactNode;
  num?: boolean;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("font-medium sm:truncate print:whitespace-normal", num && "num")}>{children}</dd>
    </div>
  );
}
