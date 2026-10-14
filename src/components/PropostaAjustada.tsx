"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Scale } from "lucide-react";
import type { ClienteRow, DisputaCompleta } from "@/lib/db";
import type { FichaRow } from "@/lib/ficha";
import { formatarCnpj, limparObjeto } from "@/lib/formato";
import { lerReais } from "@/lib/resultado";
import {
  brl,
  distribuir,
  lerQuantidade,
  porExtenso,
  totalItem,
  totalProposta,
  type ItemProposta,
} from "@/lib/proposta";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Campo } from "./ui/campo";
import { Aviso } from "./ui/aviso";

type Modo = "global" | "item";

const DECLARACAO =
  "Declaramos que nos preços propostos estão incluídas todas as despesas necessárias à execução do objeto, " +
  "como tributos, encargos sociais e trabalhistas, fretes, seguros e quaisquer outros custos, e que atendemos " +
  "a todas as condições do edital e do termo de referência.";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Proposta readequada ao valor final, no formato que o pregoeiro pede depois
 * dos lances. A tela é para conferir e ajustar; o resultado sai pela
 * impressão do navegador (imprimir ou salvar em PDF).
 */
export default function PropostaAjustada({
  d,
  cliente,
  ficha,
  lanceFinal,
  dadosBancarios,
}: {
  d: DisputaCompleta;
  cliente: Pick<ClienteRow, "razao_social" | "nome_fantasia" | "cnpj" | "contato_nome" | "email" | "whatsapp">;
  ficha: FichaRow | null;
  lanceFinal: number | null;
  dadosBancarios: string | null;
}) {
  const l = d.licitacao;
  const f = ficha?.ficha;
  const criterio = f?.sessao.criterio_julgamento?.toLowerCase() ?? "";
  const itensFicha = f?.itens ?? [];

  const [modo, setModo] = useState<Modo>(
    itensFicha.length <= 1 || criterio.includes("global") || !criterio.includes("item") ? "global" : "item"
  );
  const [lance, setLance] = useState(lanceFinal ? reais(lanceFinal) : "");
  const [itens, setItens] = useState<ItemProposta[]>(() => {
    const base: ItemProposta[] = itensFicha.length
      ? itensFicha.map((it) => {
          const q = lerQuantidade(it.quantidade);
          return {
            descricao: it.descricao,
            quantidade: q.n,
            unidade: q.unidade,
            estimadoTotal: it.valor_estimado,
            unitario: it.valor_estimado ? Math.round((it.valor_estimado / q.n) * 100) / 100 : 0,
            incluir: true,
            marca: "",
          };
        })
      : [
          {
            descricao: limparObjeto(l.objeto),
            quantidade: 1,
            unidade: "serviço",
            estimadoTotal: l.valor_estimado,
            unitario: l.valor_estimado ?? 0,
            incluir: true,
            marca: "",
          },
        ];
    return lanceFinal ? distribuir(base, lanceFinal).itens : base;
  });
  const [sobra, setSobra] = useState(0);

  const hoje = new Date();
  const [cabecalho, setCabecalho] = useState({
    endereco: "",
    telefone: cliente.whatsapp ?? "",
    email: cliente.email ?? "",
    processo: l.processo ?? "",
    validade: f?.prazos.validade_proposta ?? "60 (sessenta) dias",
    prazo: f?.prazos.entrega_execucao ?? "",
    pagamento: f?.prazos.pagamento ?? "",
    banco: dadosBancarios ?? "",
    cidade: "",
    data: `${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`,
    representante: cliente.contato_nome ?? "",
    cpf: "",
    cargo: "Sócio-administrador",
  });
  const campo = (k: keyof typeof cabecalho) => ({
    value: cabecalho[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCabecalho((c) => ({ ...c, [k]: e.target.value })),
  });

  const total = totalProposta(itens);
  const lanceN = lerReais(lance);

  // O que o pregoeiro recusaria, dito antes de imprimir.
  const avisos = useMemo(() => {
    const xs: { tom: "erro" | "alerta"; texto: string }[] = [];
    if (!f) xs.push({ tom: "alerta", texto: "O edital ainda não foi lido. Os itens abaixo são só o objeto da licitação: confira a lista de itens no edital." });
    const somaFicha = itensFicha.reduce((s, i) => s + (i.valor_estimado ?? 0), 0);
    if (f && l.valor_estimado && somaFicha > 0 && Math.abs(somaFicha - l.valor_estimado) / l.valor_estimado > 0.02) {
      xs.push({
        tom: "alerta",
        texto: `A soma dos itens da ficha (${brl(somaFicha)}) não bate com o valor estimado da licitação (${brl(l.valor_estimado)}). Pode faltar item, ou a ficha anotou valores unitários. Confira com o edital.`,
      });
    }
    if (modo === "global" && lanceN && Math.round(total * 100) !== Math.round(lanceN * 100)) {
      xs.push({ tom: "erro", texto: `O total da proposta (${brl(total)}) está diferente do lance final (${brl(lanceN)}).` });
    }
    if (sobra) xs.push({ tom: "alerta", texto: `Sobraram ${brl(Math.abs(sobra))} que não couberam em nenhum unitário. Ajuste um item à mão.` });
    const acima = itens.filter((i) => i.incluir && i.estimadoTotal && totalItem(i) > i.estimadoTotal + 0.005);
    if (acima.length) {
      xs.push({
        tom: "erro",
        texto: `${acima.length === 1 ? "1 item está" : `${acima.length} itens estão`} acima do valor estimado pelo órgão. Costuma ser motivo de desclassificação.`,
      });
    }
    if (d.preco_minimo && total > 0 && total < d.preco_minimo) {
      xs.push({ tom: "erro", texto: `O total está abaixo do preço mínimo do cliente (${brl(d.preco_minimo)}).` });
    }
    const vazios = [
      !cabecalho.endereco.trim() && "endereço",
      !cabecalho.cidade.trim() && "cidade",
      !cabecalho.representante.trim() && "nome do representante",
      !cabecalho.cpf.trim() && "CPF do representante",
      !cabecalho.banco.trim() && "dados bancários",
    ].filter(Boolean);
    if (vazios.length) xs.push({ tom: "alerta", texto: `Preencha antes de imprimir: ${vazios.join(", ")}.` });
    return xs;
  }, [f, itensFicha, l.valor_estimado, modo, lanceN, total, sobra, itens, d.preco_minimo, cabecalho]);

  function mudarItem(k: number, campos: Partial<ItemProposta>) {
    setItens((xs) => xs.map((x, n) => (n === k ? { ...x, ...campos } : x)));
  }

  return (
    <div className="space-y-6 print:space-y-0">
      {/* barra de trabalho: não sai na impressão */}
      <div className="space-y-4 print:hidden">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Mesa
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Proposta ajustada</h1>
            <p className="text-sm text-muted-foreground">
              Readequada ao valor final, para enviar ao pregoeiro. Confira, ajuste e imprima ou salve em PDF.
            </p>
          </div>
          <Button onClick={() => window.print()}>
            <Printer />
            Imprimir ou salvar PDF
          </Button>
        </div>

        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[14rem_14rem_auto] sm:items-end">
          <Campo rotulo="Como ajustar">
            <NativeSelect value={modo} onChange={(e) => setModo(e.target.value as Modo)}>
              <option value="global">Lance global: distribuir</option>
              <option value="item">Por item: valor de cada um</option>
            </NativeSelect>
          </Campo>
          {modo === "global" ? (
            <>
              <Campo rotulo="Lance final (total)">
                <Input className="num" inputMode="decimal" placeholder="ex: 189.300,00" value={lance} onChange={(e) => setLance(e.target.value)} />
              </Campo>
              <div>
                <Button
                  variant="outline"
                  disabled={!lanceN}
                  onClick={() => {
                    const r = distribuir(itens, lanceN!);
                    setItens(r.itens);
                    setSobra(r.sobra);
                  }}
                >
                  <Scale />
                  Distribuir entre os itens
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Digite na tabela o valor unitário final de cada item que o cliente ganhou e desmarque os que ele não disputou.
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-3">
            A distribuição aplica o mesmo desconto a todos os itens, na proporção do valor estimado. Se o edital tiver um
            modelo de proposta em anexo, siga a ordem e as colunas dele.
          </p>
        </div>

        {avisos.map((a) => (
          <Aviso key={a.texto} tom={a.tom}>
            {a.texto}
          </Aviso>
        ))}
      </div>

      {/* o documento: papel branco nos dois temas */}
      <article className="mx-auto max-w-[210mm] rounded-lg border bg-white p-8 text-[13px] leading-relaxed text-zinc-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-1 border-b border-zinc-300 pb-4 print:pb-3">
          <p className="text-base font-semibold uppercase tracking-wide">{cliente.razao_social}</p>
          <p className="num">CNPJ {formatarCnpj(cliente.cnpj)}</p>
          <Linha placeholder="Endereço completo (rua, número, bairro, cidade/UF, CEP)" {...campo("endereco")} />
          <div className="flex flex-wrap gap-x-6">
            <span className="flex items-baseline gap-1">
              Telefone: <Linha className="w-40" placeholder="(27) 99999-9999" {...campo("telefone")} />
            </span>
            <span className="flex items-baseline gap-1">
              E-mail: <Linha className="w-64" placeholder="email@empresa.com.br" {...campo("email")} />
            </span>
          </div>
        </header>

        <section className="space-y-1 py-5 print:py-3">
          <p>
            Ao(À) <b>{l.orgao_razao_social ?? "órgão"}</b>
          </p>
          <p>
            {l.modalidade_nome ?? "Licitação"}
            {l.srp ? ", registro de preços" : ""} · Processo{" "}
            <Linha className="inline-block w-48" placeholder="nº do processo" {...campo("processo")} />
          </p>
          <p className="text-zinc-600">Controle PNCP: {l.numero_controle_pncp}</p>
          <p>
            <b>Objeto:</b> {limparObjeto(l.objeto)}
          </p>
        </section>

        <h2 className="pb-2 text-center text-sm font-bold uppercase tracking-wider">Proposta de preços readequada</h2>
        <p className="pb-4">
          Apresentamos nossa proposta de preços ajustada ao valor final obtido na fase de lances, conforme as condições
          do edital:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-zinc-100 text-left">
                <th className="w-6 border border-zinc-300 p-1.5 print:hidden" aria-label="Incluir" />
                <th className="w-10 border border-zinc-300 p-1.5">Item</th>
                <th className="border border-zinc-300 p-1.5">Descrição</th>
                <th className="w-28 border border-zinc-300 p-1.5">Marca/modelo</th>
                <th className="w-16 border border-zinc-300 p-1.5 text-right">Qtd.</th>
                <th className="w-20 border border-zinc-300 p-1.5">Unid.</th>
                <th className="w-28 border border-zinc-300 p-1.5 text-right">Valor unitário</th>
                <th className="w-28 border border-zinc-300 p-1.5 text-right">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, k) => (
                <tr key={k} className={cn(!it.incluir && "text-zinc-400 print:hidden")}>
                  <td className="border border-zinc-300 p-1.5 text-center print:hidden">
                    <input
                      type="checkbox"
                      aria-label={`Incluir item ${k + 1}`}
                      checked={it.incluir}
                      onChange={(e) => mudarItem(k, { incluir: e.target.checked })}
                      className="accent-violet-600"
                    />
                  </td>
                  <td className="num border border-zinc-300 p-1.5 text-center">{k + 1}</td>
                  <td className="border border-zinc-300 p-1.5">{it.descricao}</td>
                  <td className="border border-zinc-300 p-1.5">
                    <Linha placeholder="—" value={it.marca} onChange={(e) => mudarItem(k, { marca: e.target.value })} />
                  </td>
                  <td className="border border-zinc-300 p-1.5 text-right">
                    <NumeroCampo valor={it.quantidade} casas={0} onValor={(v) => mudarItem(k, { quantidade: v || 1 })} />
                  </td>
                  <td className="border border-zinc-300 p-1.5">
                    <Linha value={it.unidade} onChange={(e) => mudarItem(k, { unidade: e.target.value })} />
                  </td>
                  <td className="border border-zinc-300 p-1.5 text-right">
                    <NumeroCampo valor={it.unitario} casas={2} onValor={(v) => mudarItem(k, { unitario: v })} />
                  </td>
                  <td className="num border border-zinc-300 p-1.5 text-right font-medium">{brl(totalItem(it))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-100 font-semibold">
                <td className="border border-zinc-300 p-1.5 print:hidden" />
                <td colSpan={6} className="border border-zinc-300 p-1.5 text-right">
                  Valor global da proposta
                </td>
                <td className="num border border-zinc-300 p-1.5 text-right">{brl(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="pt-2">
          Valor global: <b className="num">{brl(total)}</b> ({porExtenso(total)}).
        </p>

        <section className="space-y-1.5 pt-5 print:pt-3">
          <Condicao rotulo="Validade da proposta" {...campo("validade")} />
          <Condicao rotulo="Prazo de entrega ou execução" {...campo("prazo")} placeholder="conforme o edital" />
          <Condicao rotulo="Condições de pagamento" {...campo("pagamento")} placeholder="conforme o edital" />
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-semibold">Dados bancários:</span>
            <Linha placeholder="Banco, agência e conta em nome da empresa" {...campo("banco")} />
          </div>
        </section>

        <p className="pt-5 print:pt-3">{DECLARACAO}</p>

        <footer className="space-y-10 pt-8 [break-inside:avoid] print:space-y-8 print:pt-5">
          <p className="flex flex-wrap items-baseline gap-1">
            <Linha className="w-48" placeholder="Cidade/UF" {...campo("cidade")} />, <Linha className="w-56" {...campo("data")} />.
          </p>
          <div className="mx-auto w-80 max-w-full space-y-0.5 border-t border-zinc-500 pt-1 text-center">
            <Linha className="text-center font-semibold" placeholder="Nome do representante legal" {...campo("representante")} />
            <p className="flex items-baseline justify-center gap-1">
              CPF <Linha className="w-40 text-center" placeholder="000.000.000-00" {...campo("cpf")} />
            </p>
            <Linha className="text-center" {...campo("cargo")} />
            <p>{cliente.razao_social}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function reais(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Campo de texto na tela; no papel vira só o texto, que pode quebrar de linha. */
function Linha({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <input
        {...props}
        className={cn(
          "w-full min-w-0 border-b border-dashed border-zinc-300 bg-transparent px-0.5 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none print:hidden",
          className
        )}
      />
      <span className={cn("hidden whitespace-pre-wrap print:inline", className?.includes("text-center") && "print:block")}>
        {String(props.value ?? "")}
      </span>
    </>
  );
}

function Condicao({ rotulo, ...props }: { rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 font-semibold">{rotulo}:</span>
      <Linha {...props} />
    </div>
  );
}

/** Número no formato brasileiro, editável; reformata ao sair do campo. */
function NumeroCampo({ valor, casas, onValor }: { valor: number; casas: number; onValor: (v: number) => void }) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas === 0 ? 3 : casas });
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      inputMode="decimal"
      className="num w-full min-w-0 border-b border-dashed border-zinc-300 bg-transparent text-right text-zinc-900 focus:border-violet-500 focus:outline-none print:border-0"
      value={texto ?? fmt(valor)}
      onFocus={() => setTexto(fmt(valor))}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const t = (texto ?? "").replace(/[^\d.,]/g, "");
        const v = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/\.(?=\d{3}(\D|$))/g, ""));
        if (Number.isFinite(v) && v >= 0) onValor(Math.round(v * 10 ** casas) / 10 ** casas);
        setTexto(null);
      }}
    />
  );
}
