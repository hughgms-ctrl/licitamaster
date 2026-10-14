"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileCheck2, Loader2, Receipt, RefreshCw } from "lucide-react";
import { atualizarSituacoes, gerarCobranca, salvarPlano, type SaidaFinanceiro } from "@/app/(mesa)/financeiro/acoes";
import type { ClienteRow, DisputaCompleta } from "@/lib/db";
import { resumoContrato, type ContratoDisputa } from "@/lib/contrato";
import { SITUACAO } from "@/lib/asaas-rotulos";
import { brl } from "@/lib/proposta";
import { lerReais, reaisParaTexto } from "@/lib/resultado";
import { formatarData, limparObjeto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import ContratoPainel from "./ContratoPainel";
import CopiarLink from "./CopiarLink";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Aviso } from "./ui/aviso";
import { StatStrip } from "./ui/stat-strip";
import { StatusDot, type Tom } from "./ui/status-dot";
import { Vazio } from "./ui/vazio";
import { useConfirmar } from "./ui/confirmar";

export interface CobrancaLinha {
  id: string;
  cliente_id: string;
  tipo: "mensalidade" | "exito";
  referencia: string;
  valor: number;
  vencimento: string;
  link: string | null;
  situacao: string;
  created_at: string;
}

type Cliente = ClienteRow & { mensalidade?: number | null; percentual_exito?: number | null };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const emDias = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const CANCELADAS = new Set(["DELETED", "REFUNDED"]);
const TOM: Record<string, Tom> = { PENDING: "info", OVERDUE: "perigo", RECEIVED: "sucesso", CONFIRMED: "sucesso", RECEIVED_IN_CASH: "sucesso", emitida: "neutro" };

/**
 * O dinheiro dos dois lados: o que os órgãos pagam aos clientes (contratos)
 * e o que os clientes pagam à assessoria (mensalidade e êxito sobre o que
 * receberam). Nenhuma cobrança sai sem confirmação.
 */
export default function Financeiro({
  asaas,
  clientes,
  disputas,
  contratos: iniciais,
  lances,
  cobrancas,
}: {
  asaas: boolean;
  clientes: Cliente[];
  disputas: DisputaCompleta[];
  contratos: Record<string, ContratoDisputa>;
  lances: Record<string, number | null>;
  cobrancas: CobrancaLinha[];
}) {
  const [contratos, setContratos] = useState(iniciais);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<SaidaFinanceiro | null>(null);
  const [atualizando, iniciarAtualizar] = useTransition();

  const recebidoPorCliente = new Map<string, number>();
  let aReceberOrgaos = 0;
  for (const d of disputas) {
    const c = contratos[d.id];
    if (!c) continue;
    const r = resumoContrato(c);
    aReceberOrgaos += r.aReceber;
    recebidoPorCliente.set(d.cliente_id, (recebidoPorCliente.get(d.cliente_id) ?? 0) + r.recebido);
  }
  const validas = cobrancas.filter((c) => !CANCELADAS.has(c.situacao));
  const exitoCobrado = (id: string) => validas.filter((c) => c.cliente_id === id && c.tipo === "exito").reduce((s, c) => s + c.valor, 0);
  const exitoACobrar = (c: Cliente) =>
    Math.max(0, Math.round(((recebidoPorCliente.get(c.id) ?? 0) * (c.percentual_exito ?? 0)) / 100 * 100) / 100 - exitoCobrado(c.id));
  const totalExito = clientes.reduce((s, c) => s + exitoACobrar(c), 0);
  const emAberto = validas.filter((c) => ["PENDING", "OVERDUE", "emitida"].includes(c.situacao));

  return (
    <div className="space-y-8">
      <StatStrip
        itens={[
          { rotulo: "Órgãos devem aos clientes", valor: brl(aReceberOrgaos), detalhe: "faturado e não pago" },
          { rotulo: "Clientes já receberam", valor: brl([...recebidoPorCliente.values()].reduce((s, v) => s + v, 0)) },
          { rotulo: "Êxito a cobrar", valor: brl(totalExito), tom: totalExito > 0 ? "alerta" : undefined },
          {
            rotulo: "Cobranças em aberto",
            valor: emAberto.length,
            detalhe: brl(emAberto.reduce((s, c) => s + c.valor, 0)),
            tom: emAberto.some((c) => c.situacao === "OVERDUE") ? "perigo" : undefined,
          },
        ]}
      />

      {!asaas && (
        <Aviso tom="alerta" titulo="Asaas não configurado">
          As cobranças ficam só registradas aqui. Para gerar a fatura de verdade (boleto ou Pix), configure a variável
          ASAAS_API_KEY na Vercel com a chave da sua conta Asaas.
        </Aviso>
      )}
      {aviso && (
        <Aviso tom={aviso.ok ? "sucesso" : "erro"}>
          <p>{aviso.mensagem}</p>
          {aviso.link && <CopiarLink link={aviso.link} />}
        </Aviso>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Clientes</h2>
        {clientes.length === 0 ? (
          <Vazio titulo="Nenhum cliente ativo." />
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {clientes.map((c) => (
              <LinhaCliente
                key={c.id}
                c={c}
                recebido={recebidoPorCliente.get(c.id) ?? 0}
                exitoCobrado={exitoCobrado(c.id)}
                exitoACobrar={exitoACobrar(c)}
                ultimaMensalidade={validas.find((x) => x.cliente_id === c.id && x.tipo === "mensalidade")?.referencia ?? null}
                asaas={asaas}
                avisar={setAviso}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Contratos ganhos</h2>
        {disputas.length === 0 ? (
          <Vazio icone={FileCheck2} titulo="Nenhuma disputa ganha ainda." />
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {disputas.map((d) => {
              const c = contratos[d.id];
              const r = c ? resumoContrato(c) : null;
              return (
                <div key={d.id} className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {d.cliente.nome_fantasia || d.cliente.razao_social} · {d.licitacao.orgao_razao_social}
                      </p>
                      <p className="truncate text-sm font-medium">{limparObjeto(d.licitacao.objeto)}</p>
                    </div>
                    {r ? (
                      <span className="flex shrink-0 gap-4 text-xs text-muted-foreground">
                        <span>
                          Contratado <b className="num text-foreground">{c?.valor_contratado != null ? brl(c.valor_contratado) : "—"}</b>
                        </span>
                        <span>
                          Recebido <b className="num text-success">{brl(r.recebido)}</b>
                        </span>
                        <span>
                          A receber <b className={cn("num", r.aReceber > 0 ? "text-warning" : "text-foreground")}>{brl(r.aReceber)}</b>
                        </span>
                      </span>
                    ) : (
                      <StatusDot tom="alerta">Contrato não registrado</StatusDot>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setAberto(aberto === d.id ? null : d.id)}>
                      {aberto === d.id ? "Fechar" : c ? "Abrir" : "Registrar"}
                    </Button>
                  </div>
                  {aberto === d.id && (
                    <ContratoPainel
                      d={d}
                      inicial={c ?? null}
                      valorPadrao={lances[d.id] ?? null}
                      salvo={(novo) => setContratos((x) => ({ ...x, [d.id]: novo }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Cobranças</h2>
          {asaas && (
            <Button
              size="sm"
              variant="ghost"
              disabled={atualizando}
              onClick={() => iniciarAtualizar(async () => setAviso(await atualizarSituacoes()))}
            >
              {atualizando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Consultar situação no Asaas
            </Button>
          )}
        </div>
        {cobrancas.length === 0 ? (
          <Vazio icone={Receipt} titulo="Nenhuma cobrança ainda." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Referência</th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {cobrancas.map((x) => {
                  const c = clientes.find((y) => y.id === x.cliente_id);
                  return (
                    <tr key={x.id}>
                      <td className="px-4 py-2">{c ? c.nome_fantasia || c.razao_social : "—"}</td>
                      <td className="px-4 py-2">{x.tipo === "exito" ? "Êxito" : "Mensalidade"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{x.referencia}</td>
                      <td className="num px-4 py-2 text-right font-medium">{brl(x.valor)}</td>
                      <td className="num px-4 py-2">{x.vencimento.split("-").reverse().join("/")}</td>
                      <td className="px-4 py-2">
                        <StatusDot tom={TOM[x.situacao] ?? "neutro"}>{SITUACAO[x.situacao] ?? x.situacao}</StatusDot>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {x.link && (
                          <a href={x.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline dark:text-sidebar-primary">
                            <ExternalLink className="size-3.5" />
                            Fatura
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Êxito = porcentagem do plano sobre o que o cliente já recebeu dos órgãos (pagamentos registrados nos
          contratos), menos o êxito já cobrado. Cobranças canceladas ou estornadas no Asaas não contam.
        </p>
      </section>
    </div>
  );
}

function LinhaCliente({
  c,
  recebido,
  exitoCobrado,
  exitoACobrar,
  ultimaMensalidade,
  asaas,
  avisar,
}: {
  c: Cliente;
  recebido: number;
  exitoCobrado: number;
  exitoACobrar: number;
  ultimaMensalidade: string | null;
  asaas: boolean;
  avisar: (s: SaidaFinanceiro) => void;
}) {
  const [mensalidade, setMensalidade] = useState(reaisParaTexto(c.mensalidade ?? null));
  const [percentual, setPercentual] = useState(c.percentual_exito != null ? String(c.percentual_exito).replace(".", ",") : "");
  const [pendente, iniciar] = useTransition();
  const [confirmar, dialogo] = useConfirmar();
  const nome = c.nome_fantasia || c.razao_social;
  const agora = new Date();
  const refMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const mesNome = `${MESES[agora.getMonth()]}/${agora.getFullYear()}`;
  const mensalidadeN = lerReais(mensalidade);

  async function cobrar(tipo: "mensalidade" | "exito", valor: number, referencia: string, descricao: string) {
    const ok = await confirmar({
      titulo: `Cobrar ${brl(valor)} de ${nome}?`,
      texto: asaas
        ? `Cria uma fatura de verdade no Asaas, com vencimento em 7 dias (${emDias(7).split("-").reverse().join("/")}). O cliente pode pagar por boleto ou Pix.`
        : "O Asaas não está configurado: a cobrança fica só registrada aqui.",
      confirmar: asaas ? "Criar fatura" : "Registrar",
    });
    if (!ok) return;
    iniciar(async () => {
      try {
        avisar(await gerarCobranca({ clienteId: c.id, tipo, valor, vencimento: emDias(7), referencia, descricao }));
      } catch (e) {
        avisar({ ok: false, mensagem: (e as Error).message });
      }
    });
  }

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-2">
        <p className="font-medium">{nome}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Mensalidade</span>
            <Input className="num h-8 w-32" inputMode="decimal" placeholder="0,00" value={mensalidade} onChange={(e) => setMensalidade(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>% de êxito</span>
            <Input className="num h-8 w-20" inputMode="decimal" placeholder="0" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={pendente}
            onClick={() =>
              iniciar(async () =>
                avisar(await salvarPlano(c.id, mensalidadeN, percentual ? Number(percentual.replace(",", ".")) : null))
              )
            }
          >
            Salvar plano
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Recebeu dos órgãos <b className="num text-foreground">{brl(recebido)}</b> · êxito já cobrado{" "}
          <b className="num text-foreground">{brl(exitoCobrado)}</b>
          {ultimaMensalidade && <> · última mensalidade {ultimaMensalidade}</>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={pendente || !mensalidadeN || ultimaMensalidade === refMes}
          title={ultimaMensalidade === refMes ? "A mensalidade deste mês já foi cobrada" : undefined}
          onClick={() => cobrar("mensalidade", mensalidadeN!, refMes, `Mensalidade ${mesNome} - assessoria em licitações`)}
        >
          {pendente && <Loader2 className="animate-spin" />}
          Cobrar mensalidade de {mesNome}
        </Button>
        <Button
          size="sm"
          disabled={pendente || exitoACobrar <= 0}
          onClick={() =>
            cobrar("exito", exitoACobrar, `até ${formatarData(new Date().toISOString()).slice(0, 5)}`, `Êxito sobre contratos recebidos - assessoria em licitações`)
          }
        >
          Cobrar êxito {exitoACobrar > 0 ? brl(exitoACobrar) : ""}
        </Button>
      </div>
      {dialogo}
    </div>
  );
}
