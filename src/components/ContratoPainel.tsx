"use client";

import { useState, useTransition } from "react";
import { FileCheck2, Loader2, Plus, Trash2 } from "lucide-react";
import { salvarContrato } from "@/app/acoes";
import type { DisputaCompleta } from "@/lib/db";
import { ROTULO_EVENTO, resumoContrato, type ContratoDisputa, type EventoContrato, type TipoEvento } from "@/lib/contrato";
import { brl } from "@/lib/proposta";
import { lerReais, reaisParaTexto } from "@/lib/resultado";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Campo } from "./ui/campo";
import { Aviso } from "./ui/aviso";
import { StatusDot } from "./ui/status-dot";

const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/**
 * Depois de ganhar: o contrato e o que acontece com ele até o dinheiro
 * entrar. É daqui que sai a base da cobrança por êxito.
 */
export default function ContratoPainel({
  d,
  inicial,
  valorPadrao,
  salvo,
}: {
  d: DisputaCompleta;
  inicial: ContratoDisputa | null;
  /** o lance vencedor registrado, quando houver */
  valorPadrao: number | null;
  salvo: (c: ContratoDisputa) => void;
}) {
  const [numero, setNumero] = useState(inicial?.numero ?? "");
  const [valor, setValor] = useState(reaisParaTexto(inicial?.valor_contratado ?? valorPadrao));
  const [assinado, setAssinado] = useState(inicial?.assinado_em ?? "");
  const [vigencia, setVigencia] = useState(inicial?.vigencia_fim ?? "");
  const [eventos, setEventos] = useState<EventoContrato[]>(inicial?.eventos ?? []);
  const [obs, setObs] = useState(inicial?.observacao ?? "");
  const [novo, setNovo] = useState<{ tipo: TipoEvento; data: string; valor: string; descricao: string }>({
    tipo: "empenho",
    data: hoje(),
    valor: "",
    descricao: "",
  });
  const [saida, setSaida] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const contrato = { valor_contratado: lerReais(valor), eventos };
  const r = resumoContrato(contrato);
  const vence = vigencia ? (new Date(`${vigencia}T23:59:59-03:00`).getTime() - Date.now()) / 864e5 : null;

  function salvar(lista = eventos) {
    setSaida(null);
    const c = {
      numero: numero || null,
      valor_contratado: lerReais(valor),
      assinado_em: assinado || null,
      vigencia_fim: vigencia || null,
      eventos: lista,
      observacao: obs || null,
    };
    iniciar(async () => {
      try {
        const s = await salvarContrato(d.id, c);
        setSaida(s);
        if (s.ok) salvo({ ...c, disputa_id: d.id, updated_at: new Date().toISOString() });
      } catch (e) {
        setSaida({ ok: false, mensagem: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-background/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-medium">
          <FileCheck2 className="size-4 text-muted-foreground" />
          Contrato
        </span>
        {vence != null && (
          <StatusDot tom={vence < 0 ? "neutro" : vence < 30 ? "alerta" : "sucesso"}>
            {vence < 0 ? "Vigência encerrada" : `Vigente até ${dataBr(vigencia)}`}
          </StatusDot>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Campo rotulo="Nº do contrato ou ata">
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="ex: 047/2026" />
        </Campo>
        <Campo rotulo="Valor contratado">
          <Input className="num" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo rotulo="Assinado em">
          <Input type="date" value={assinado} onChange={(e) => setAssinado(e.target.value)} />
        </Campo>
        <Campo rotulo="Vigência até">
          <Input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
        </Campo>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-muted/50 p-3 sm:grid-cols-5">
        {[
          ["Empenhado", r.empenhado],
          ["Entregue", r.entregue],
          ["Faturado", r.faturado],
          ["Recebido", r.recebido],
          ["A receber", r.aReceber],
        ].map(([rotulo, v]) => (
          <div key={rotulo as string}>
            <dt className="text-xs text-muted-foreground">{rotulo}</dt>
            <dd className={rotulo === "A receber" && (v as number) > 0 ? "num font-semibold text-warning" : "num font-semibold"}>
              {brl(v as number)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <p className="font-medium">Acontecimentos</p>
        {eventos.length === 0 ? (
          <p className="text-muted-foreground">Nada registrado ainda. Comece pelo empenho: sem ele, não entregue.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {[...eventos]
              .sort((a, b) => a.data.localeCompare(b.data))
              .map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="num w-20 shrink-0 text-xs text-muted-foreground">{dataBr(e.data)}</span>
                  <span className="w-36 shrink-0 font-medium">{ROTULO_EVENTO[e.tipo]}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.descricao}</span>
                  <span className="num shrink-0 font-medium">{e.valor != null ? brl(e.valor) : "—"}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label="Remover"
                    onClick={() => {
                      const lista = eventos.filter((x) => x.id !== e.id);
                      setEventos(lista);
                      salvar(lista);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
          </ul>
        )}
        <div className="grid gap-2 rounded-md border border-dashed p-2 sm:grid-cols-[11rem_9rem_9rem_1fr_auto]">
          <NativeSelect aria-label="Tipo" value={novo.tipo} onChange={(e) => setNovo((n) => ({ ...n, tipo: e.target.value as TipoEvento }))}>
            {(Object.keys(ROTULO_EVENTO) as TipoEvento[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_EVENTO[t]}
              </option>
            ))}
          </NativeSelect>
          <Input aria-label="Data" type="date" value={novo.data} onChange={(e) => setNovo((n) => ({ ...n, data: e.target.value }))} />
          <Input aria-label="Valor" className="num" inputMode="decimal" placeholder="Valor" value={novo.valor} onChange={(e) => setNovo((n) => ({ ...n, valor: e.target.value }))} />
          <Input aria-label="Descrição" placeholder="ex: NE 2026NE000123, NF 456" value={novo.descricao} onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))} />
          <Button
            variant="outline"
            disabled={pendente || !novo.data}
            onClick={() => {
              const lista = [
                ...eventos,
                { id: crypto.randomUUID(), tipo: novo.tipo, data: novo.data, valor: lerReais(novo.valor), descricao: novo.descricao || null },
              ];
              setEventos(lista);
              setNovo({ tipo: novo.tipo, data: hoje(), valor: "", descricao: "" });
              salvar(lista);
            }}
          >
            <Plus />
            Adicionar
          </Button>
        </div>
      </div>

      <Campo rotulo="Observação">
        <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex: entregas mensais até o dia 10" />
      </Campo>

      {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}
      <Button size="sm" disabled={pendente} onClick={() => salvar()}>
        {pendente && <Loader2 className="animate-spin" />}
        Salvar contrato
      </Button>
    </div>
  );
}
