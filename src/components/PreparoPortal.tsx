"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, FileSignature, Loader2 } from "lucide-react";
import { ptInformarPreparo } from "@/app/c/[token]/acoes";
import { rotuloTipo, type DocumentoResumo } from "@/lib/documentos";
import {
  DOCUMENTOS_BASICOS,
  ITENS_MANUAIS,
  estadoItem,
  progressoPreparo,
  situacaoDocBasico,
  type ItemManual,
  type Preparo,
} from "@/lib/preparo";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Aviso } from "./ui/aviso";
import { StatusDot } from "./ui/status-dot";

/**
 * "Para sua empresa começar": só o que é do cliente fazer, em linguagem de
 * dono de empresa. Some quando tudo estiver pronto.
 */
export default function PreparoPortal({
  token,
  preparo: inicial,
  documentos,
}: {
  token: string;
  preparo: Preparo;
  documentos: DocumentoResumo[];
}) {
  const [preparo, setPreparo] = useState<Preparo>(inicial ?? {});
  const p = progressoPreparo(preparo, documentos);
  if (p.pronto) return null;

  const itens = ITENS_MANUAIS.filter((i) => i.instrucao && i.quem !== "equipe");
  const docsFaltando = DOCUMENTOS_BASICOS.filter((d) => {
    const s = situacaoDocBasico(d.tipo, documentos).situacao;
    return d.obrigatorio && (s === "falta" || s === "vencido");
  });
  const pct = Math.round((p.prontos / p.total) * 100);

  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Para sua empresa começar a disputar</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Uma vez só. Depois disso, cada licitação é só dizer se quer participar e o seu preço mínimo.
        </p>
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="num text-xs text-muted-foreground">
            {p.prontos} de {p.total}
          </span>
        </div>
      </div>

      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {itens.map((item) => (
          <Passo
            key={item.id}
            item={item}
            token={token}
            status={estadoItem(preparo, item.id).status}
            informado={(nota) =>
              setPreparo((x) => ({ ...x, [item.id]: { status: "cliente_informou", nota, por: "cliente" } }))
            }
          />
        ))}
        {docsFaltando.length > 0 && (
          <div className="space-y-2 p-4">
            <StatusDot tom="perigo">Documentos que faltam</StatusDot>
            <ul className="list-disc space-y-0.5 pl-5 text-sm marker:text-muted-foreground/60">
              {docsFaltando.map((d) => (
                <li key={d.tipo}>
                  {rotuloTipo(d.tipo)}
                  {situacaoDocBasico(d.tipo, documentos).situacao === "vencido" && (
                    <span className="text-destructive"> (vencido)</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Envie em &quot;Documentos da empresa&quot;, no fim desta página.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Passo({
  item,
  token,
  status,
  informado,
}: {
  item: ItemManual;
  token: string;
  status: string;
  informado: (nota: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const feito = status === "feito" || status === "nao_se_aplica";
  const aguardando = status === "cliente_informou";
  const pedeTexto = item.id === "dados_bancarios";

  return (
    <div className={cn("space-y-3 p-4", feito && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug">{item.rotulo}</p>
        {feito ? (
          <StatusDot tom="sucesso">Pronto</StatusDot>
        ) : aguardando ? (
          <StatusDot tom="alerta">Conferindo</StatusDot>
        ) : (
          <StatusDot tom="perigo">Falta</StatusDot>
        )}
      </div>
      {!feito && (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">{item.instrucao}</p>
          {item.id === "representante" && (
            <a
              href={`/c/${token}/procuracao`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline dark:text-sidebar-primary"
            >
              <FileSignature className="size-3.5" />
              Abrir a procuração pronta
            </a>
          )}
          {item.link && (
            <a
              href={item.link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline dark:text-sidebar-primary"
            >
              <ExternalLink className="size-3.5" />
              {item.link.rotulo}
            </a>
          )}
          {!aguardando &&
            (aberto ? (
              <div className="space-y-2">
                <Textarea
                  rows={pedeTexto ? 3 : 2}
                  placeholder={pedeTexto ? "Banco, agência e conta" : "Quer contar algo? (opcional)"}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  autoFocus
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button
                    disabled={pendente || (pedeTexto && !nota.trim())}
                    onClick={() =>
                      iniciar(async () => {
                        setErro(null);
                        const s = await ptInformarPreparo(token, item.id, nota);
                        if (s.ok) informado(nota.trim() || null);
                        else setErro(s.mensagem);
                      })
                    }
                  >
                    {pendente && <Loader2 className="animate-spin" />}
                    Enviar
                  </Button>
                  <Button variant="ghost" disabled={pendente} onClick={() => setAberto(false)}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setAberto(true)}>
                <Check />
                {pedeTexto ? "Informar dados" : "Já fiz"}
              </Button>
            ))}
          {aguardando && (
            <p className="text-xs text-muted-foreground">Recebemos o seu aviso. Vamos conferir e avisamos se faltar algo.</p>
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </>
      )}
    </div>
  );
}
