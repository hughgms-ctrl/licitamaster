import { ShieldCheck } from "lucide-react";
import { Cabecalho } from "@/components/Cabecalho";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Secao } from "@/components/ui/campo";
import { exigirOperadorPagina } from "@/lib/auth";
import FormIA from "@/components/FormIA";
import Equipe from "@/components/Equipe";
import { db } from "@/lib/db";
import { MODELOS_ANTHROPIC, MODELO_PADRAO, resumoConfigIA } from "@/lib/config-ia";
import { formatarData } from "@/lib/formato";
import { removerIA } from "./acoes";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  const eu = await exigirOperadorPagina();
  let atual = null;
  let falha: string | null = null;
  try {
    atual = await resumoConfigIA();
  } catch (e) {
    falha = (e as Error).message;
  }

  const membros = eu.papel === "admin"
    ? (((await db().from("operadores").select("email, nome, papel").order("created_at")).data ?? []) as {
        email: string;
        nome: string | null;
        papel: "admin" | "operador";
      }[])
    : null;

  return (
    <>
      <Cabecalho titulo="Configurações" sub="O motor de IA que lê licitações e editais, e quem entra na mesa." />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold">Inteligência artificial</h2>
          <FormIA
            modelosAnthropic={MODELOS_ANTHROPIC}
            modeloPadrao={MODELO_PADRAO}
            provedorAtual={atual?.provedor ?? "anthropic"}
            modeloAtual={atual?.modelo ?? null}
          />
          <div className="flex gap-3 rounded-lg border border-dashed p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              A chave é testada no provedor antes de ser salva e fica cifrada no banco (AES-256). A tela
              nunca mostra a chave inteira, só os últimos 4 caracteres. O uso é cobrado pelo provedor, na
              conta dona da chave.
            </p>
          </div>
        </section>

        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold">Situação</h2>
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            <Secao
              titulo="Em uso agora"
              acao={
                !falha && (
                  <StatusDot tom={!atual ? "alerta" : atual.ilegivel ? "perigo" : "sucesso"}>
                    {!atual ? "Sem chave" : atual.ilegivel ? "Chave ilegível" : "Funcionando"}
                  </StatusDot>
                )
              }
            >
              {falha ? (
                <Aviso tom="erro">
                  Não deu para ler a configuração: {falha}. Confira se a migration de configurações já foi
                  aplicada.
                </Aviso>
              ) : !atual ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nenhuma chave configurada. Sem ela, a coleta e a mesa funcionam, mas &quot;Analisar com
                  IA&quot;, a leitura de edital e o assistente de termos ficam desligados.
                </p>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Provedor</dt>
                      <dd className="font-medium">{atual.provedor === "anthropic" ? "Claude (Anthropic)" : "OpenAI"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Modelo</dt>
                      <dd className="truncate font-mono text-xs font-medium leading-5">{atual.modelo}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Chave</dt>
                      <dd className="num font-medium">terminada em {atual.finalChave}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Origem</dt>
                      <dd className="font-medium">
                        {atual.origem === "painel"
                          ? `Painel, ${formatarData(atual.atualizadoEm)}`
                          : "Variável de ambiente"}
                      </dd>
                    </div>
                  </dl>
                  {atual.ilegivel && (
                    <Aviso tom="erro">
                      A chave salva não pode mais ser lida (o segredo do servidor mudou). Cadastre de novo.
                    </Aviso>
                  )}
                  {atual.origem === "painel" && (
                    <form action={removerIA}>
                      <Button variant="ghost-destructive" size="sm" className="-ml-2">
                        Remover chave
                      </Button>
                    </form>
                  )}
                </>
              )}
            </Secao>
            {membros && <Equipe eu={eu.email} membros={membros} />}
          </div>
        </section>
      </div>
    </>
  );
}
