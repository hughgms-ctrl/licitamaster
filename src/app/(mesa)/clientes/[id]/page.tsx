import { notFound } from "next/navigation";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, type ClienteRow } from "@/lib/db";
import type { Perfil } from "@/lib/scoring";
import { urlPortal } from "@/lib/disputas";
import { formatarCnpj } from "@/lib/formato";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Cabecalho } from "@/components/Cabecalho";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FormCliente from "@/components/FormCliente";
import Filtros from "@/components/Filtros";
import CopiarLink from "@/components/CopiarLink";
import { regenerarLink, salvarCliente } from "../acoes";
import Cofre from "@/components/Cofre";
import Preparo from "@/components/Preparo";
import { progressoPreparo } from "@/lib/preparo";
import { listar as listarCofre } from "@/lib/cofre";
import { opApagar, opAtualizar, opLink, opPedirUpload, opRegistrar } from "../acoes-cofre";

export const dynamic = "force-dynamic";

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  await exigirOperadorPagina();
  const { id } = await params;
  const supabase = db();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle<ClienteRow>();
  if (!cliente) notFound();

  const [{ data: perfis }, { data: disputas }] = await Promise.all([
    supabase.from("perfis").select("*").eq("cliente_id", id).order("created_at"),
    supabase.from("disputas").select("perfil_id").eq("cliente_id", id).eq("status", "sugerida"),
  ]);
  const contagens: Record<string, number> = {};
  for (const d of disputas ?? []) {
    if (d.perfil_id) contagens[d.perfil_id] = (contagens[d.perfil_id] ?? 0) + 1;
  }

  const link = urlPortal(cliente.token_portal);

  const nPerfis = (perfis ?? []).length;
  const documentos = await listarCofre(id);
  // Abas montadas o tempo todo: trocar de aba não pode jogar fora um perfil
  // em edição nem um cadastro pela metade.
  const conteudo = "mt-5 data-[state=inactive]:hidden";
  const preparo = progressoPreparo(cliente.preparo, documentos);

  return (
    <>
      <Cabecalho
        antes={
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Clientes
          </Link>
        }
        titulo={cliente.nome_fantasia || cliente.razao_social}
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="num">
              {cliente.porte}, CNPJ {formatarCnpj(cliente.cnpj)}
            </span>
            <StatusDot tom={cliente.ativo ? "sucesso" : "neutro"}>{cliente.ativo ? "Ativo" : "Desligado"}</StatusDot>
            <StatusDot tom={preparo.pronto ? "sucesso" : preparo.aConferir ? "alerta" : "perigo"}>
              {preparo.pronto ? "Pronto para disputar" : `Preparação ${preparo.prontos}/${preparo.total}`}
            </StatusDot>
          </span>
        }
      />

      <Tabs defaultValue={preparo.pronto ? "perfis" : "preparo"}>
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            <TabsTrigger value="preparo">
              Preparação{" "}
              <span className={preparo.pronto ? "num text-xs text-success" : "num text-xs text-muted-foreground"}>
                {preparo.prontos}/{preparo.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="perfis">
              Perfis de busca <span className="num text-xs text-muted-foreground">{nPerfis}</span>
            </TabsTrigger>
            <TabsTrigger value="cofre">
              Cofre de documentos <span className="num text-xs text-muted-foreground">{documentos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="cadastro">Cadastro e portal</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preparo" forceMount className={conteudo}>
          <Preparo clienteId={id} preparo={cliente.preparo ?? {}} documentos={documentos} />
        </TabsContent>

        <TabsContent value="perfis" forceMount className={conteudo}>
          <Filtros
            clienteId={id}
            contexto={cliente.contexto}
            perfis={(perfis ?? []) as Perfil[]}
            contagens={contagens}
          />
        </TabsContent>

        <TabsContent value="cofre" forceMount className={conteudo}>
          <div className="rounded-lg border bg-card p-5">
            <Cofre
              documentos={documentos}
              modo="operador"
              pedirUpload={opPedirUpload.bind(null, id)}
              registrar={opRegistrar.bind(null, id)}
              link={opLink.bind(null, id)}
              atualizar={opAtualizar.bind(null, id)}
              apagar={opApagar.bind(null, id)}
            />
          </div>
        </TabsContent>

        <TabsContent value="cadastro" forceMount className={conteudo}>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <FormCliente acao={salvarCliente.bind(null, id)} cliente={cliente} rotulo="Salvar" />
            <section className="h-fit space-y-3 rounded-lg border bg-card p-5">
              <h3 className="text-[0.9375rem] font-semibold">Portal do cliente</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Por este link o cliente aprova licitações e informa o preço mínimo. Quem tiver o link
                entra. Se ele vazar, gere outro: o antigo para de funcionar na hora.
              </p>
              <CopiarLink link={link} />
              <form action={regenerarLink.bind(null, id)}>
                <Button variant="ghost-destructive" size="sm" className="-ml-2">
                  <RefreshCw />
                  Gerar link novo
                </Button>
              </form>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
