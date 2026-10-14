import { AlertTriangle, Bot, Building2, Lightbulb, UserRound } from "lucide-react";
import { exigirOperadorPagina } from "@/lib/auth";
import { FASES, GLOSSARIO } from "@/lib/guia";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guia da disputa · Licitação Master" };

const QUEM = [
  {
    icone: Bot,
    titulo: "A IA",
    texto: "Encontra as licitações, dá nota de aderência, resume para o cliente, lê o edital inteiro e cruza o que ele pede com o cofre.",
  },
  {
    icone: Building2,
    titulo: "O cliente",
    texto: "Diz se quer participar e qual o menor preço que dá lucro. Mantém os documentos em dia e entrega se ganhar.",
  },
  {
    icone: UserRound,
    titulo: "Você",
    texto: "Decide o que mandar ao cliente, cadastra a proposta, dá os lances sem passar do piso e cuida da proposta final e dos documentos.",
  },
];

export default async function Guia() {
  await exigirOperadorPagina();
  return (
    <div className="max-w-4xl">
      <Cabecalho
        titulo="Guia da disputa"
        sub="Como uma licitação funciona, do começo ao fim, e o que fazer em cada fase. O mesmo roteiro aparece em cada disputa da mesa, para marcar."
      />

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        {QUEM.map(({ icone: Icone, titulo, texto }) => (
          <div key={titulo} className="space-y-2 rounded-lg border bg-card p-4">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icone className="size-4 text-primary dark:text-sidebar-primary" />
              {titulo}
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
          </div>
        ))}
      </section>

      <div className="mb-8 flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary dark:text-sidebar-primary" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-medium">Por onde começar</p>
          <p className="text-muted-foreground">
            Comece por dispensas eletrônicas: compras pequenas, com menos documentos e decisão em poucos dias. Faça as
            primeiras com alguém experiente revisando, e anote nas notas internas da disputa tudo que travou.
          </p>
        </div>
      </div>

      <div className="mb-8 space-y-2 rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">O método Sniper</p>
        <p className="leading-relaxed text-muted-foreground">
          O roteiro segue os 14 passos do método Sniper: poucas licitações, bem escolhidas, preparadas a fundo. A
          etiqueta &quot;Sniper&quot; em cada passo mostra a qual deles corresponde. Os passos 1 (achar oportunidades
          qualificadas) e 14 (buscar a próxima) a coleta e a triagem da mesa fazem todo dia.
        </p>
      </div>

      <ol className="space-y-6">
        {FASES.map((fase, i) => (
          <li key={fase.id} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex gap-4 border-b p-5">
              <span className="num flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="space-y-1">
                <h2 className="text-base font-semibold">{fase.titulo}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{fase.resumo}</p>
              </div>
            </div>
            <ul className="divide-y">
              {fase.passos.map((p) => (
                <li key={p.id} className="space-y-1.5 px-5 py-4 sm:pl-16">
                  <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
                    {p.titulo}
                    {p.sniper && (
                      <span className="num rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                        Sniper {p.sniper}
                      </span>
                    )}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{p.detalhe}</p>
                  {p.cuidado && (
                    <p className="flex items-start gap-1.5 text-sm leading-relaxed text-warning">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      {p.cuidado}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section className="mt-10 space-y-3">
        <h2 className="text-base font-semibold">Glossário</h2>
        <dl className="divide-y overflow-hidden rounded-lg border bg-card">
          {GLOSSARIO.map((g) => (
            <div key={g.termo} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="text-sm font-medium">{g.termo}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{g.significado}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Escrito para pregão e dispensa eletrônicos no Compras.gov.br (Lei 14.133/2021). Prazos e regras variam de edital
        para edital: na dúvida, vale o que está no edital. Para pedir a revisão de um analista, use o{" "}
        <a href="/revisao" className="underline">material para revisão</a>.
      </p>
    </div>
  );
}
