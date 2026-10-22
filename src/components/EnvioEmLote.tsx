"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import { enviarVarias } from "@/app/acoes";
import type { DisputaCompleta } from "@/lib/db";
import { formatarData, formatarValor, limparObjeto } from "@/lib/formato";
import CopiarLink from "./CopiarLink";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

/**
 * A barra que aparece quando há licitações marcadas na triagem, e a
 * conferência antes de enviar. O operador vê a lista inteira, com o que pede
 * atenção destacado, e só então confirma: nada sai sem esse clique.
 */
export default function EnvioEmLote({
  selecionadas,
  lidas,
  limpar,
  aoEnviar,
}: {
  selecionadas: DisputaCompleta[];
  lidas: Record<string, true>;
  limpar: () => void;
  aoEnviar: (ids: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  if (selecionadas.length === 0) return null;

  const clientes = new Set(selecionadas.map((d) => d.cliente_id)).size;
  const semEdital = selecionadas.filter((d) => !lidas[d.licitacao_id]).length;
  const naoVale = selecionadas.filter((d) => d.analise_ia?.veredito === "nao_vale").length;
  const semAnalise = selecionadas.filter((d) => !d.analise_ia).length;

  function enviar() {
    iniciar(async () => {
      try {
        const r = await enviarVarias(selecionadas.map((d) => d.id));
        setAberto(false);
        aoEnviar(r.enviadas);
        const titulo = `${r.enviadas.length} ${r.enviadas.length === 1 ? "enviada" : "enviadas"} aos clientes`;
        const corpo = (
          <div className="space-y-2">
            {r.falhas.length > 0 && (
              <p>
                {r.falhas.length} não {r.falhas.length === 1 ? "foi" : "foram"}: {r.falhas[0].mensagem}
              </p>
            )}
            {r.semWhatsapp.length > 0 && (
              <>
                <p>O WhatsApp não saiu para estes clientes. Mande o link à mão:</p>
                {r.semWhatsapp.map((s) => (
                  <div key={s.link} className="space-y-1">
                    <p className="text-xs font-medium">{s.cliente}</p>
                    <CopiarLink link={s.link} />
                  </div>
                ))}
              </>
            )}
            {r.falhas.length === 0 && r.semWhatsapp.length === 0 && <p>Cada cliente recebeu uma mensagem com as suas.</p>}
          </div>
        );
        const opcoes = { description: corpo, duration: r.semWhatsapp.length ? Infinity : 8000, closeButton: true };
        if (r.enviadas.length > 0) toast.success(titulo, opcoes);
        else toast.error("Nenhuma foi enviada", opcoes);
      } catch (e) {
        toast.error("O envio em lote falhou", { description: (e as Error).message });
      }
    });
  }

  return (
    <>
      <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 pl-4 shadow-lg">
        <p className="text-sm">
          <b className="num font-semibold">{selecionadas.length}</b> {selecionadas.length === 1 ? "selecionada" : "selecionadas"}
          <span className="text-muted-foreground">
            {" "}
            para {clientes} {clientes === 1 ? "cliente" : "clientes"}
          </span>
        </p>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={limpar}>
          <X />
          Limpar
        </Button>
        <Button size="sm" onClick={() => setAberto(true)}>
          <Send />
          Revisar e enviar
        </Button>
      </div>

      <AlertDialog open={aberto} onOpenChange={(v) => !pendente && setAberto(v)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enviar {selecionadas.length} {selecionadas.length === 1 ? "licitação" : "licitações"} para {clientes}{" "}
              {clientes === 1 ? "cliente" : "clientes"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cada cliente recebe uma mensagem só, com o link do portal para decidir e dar o preço mínimo.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(naoVale > 0 || semEdital > 0 || semAnalise > 0) && (
            <ul className="space-y-1 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              {naoVale > 0 && <li>{naoVale} com veredito da IA “não vale a pena”.</li>}
              {semAnalise > 0 && <li>{semAnalise} sem análise rápida.</li>}
              {semEdital > 0 && <li>{semEdital} sem o edital lido: o cliente não vê as exigências no portal.</li>}
            </ul>
          )}

          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border text-sm">
            {selecionadas.map((d) => (
              <li key={d.id} className="space-y-0.5 px-3 py-2">
                <p className="text-xs text-muted-foreground">{d.cliente.nome_fantasia || d.cliente.razao_social}</p>
                <p className="line-clamp-2 font-medium leading-snug">{limparObjeto(d.licitacao.objeto)}</p>
                <p className="num text-xs text-muted-foreground">
                  {[
                    formatarValor(d.licitacao.valor_estimado),
                    d.licitacao.data_encerramento_proposta ? `até ${formatarData(d.licitacao.data_encerramento_proposta)}` : null,
                    d.analise_ia?.veredito === "nao_vale" ? "IA: não vale" : null,
                    !lidas[d.licitacao_id] ? "edital não lido" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendente}>Voltar</AlertDialogCancel>
            <Button disabled={pendente} onClick={enviar}>
              {pendente ? <Loader2 className="animate-spin" /> : <Send />}
              {pendente ? "Enviando…" : `Enviar ${selecionadas.length}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
