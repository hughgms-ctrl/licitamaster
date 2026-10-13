import { notFound } from "next/navigation";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, type ClienteRow } from "@/lib/db";
import type { Perfil } from "@/lib/scoring";
import { urlPortal } from "@/lib/disputas";
import { formatarCnpj } from "@/lib/formato";
import Topo from "@/components/Topo";
import FormCliente from "@/components/FormCliente";
import Filtros from "@/components/Filtros";
import CopiarLink from "@/components/CopiarLink";
import { regenerarLink, salvarCliente } from "../acoes";
import Cofre from "@/components/Cofre";
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

  return (
    <>
      <Topo
        titulo={cliente.nome_fantasia || cliente.razao_social}
        sub={`${cliente.porte}, CNPJ ${formatarCnpj(cliente.cnpj)}`}
        atual="clientes"
      />
      <main className="pagina pagina-duas">
        <section>
          <FormCliente acao={salvarCliente.bind(null, id)} cliente={cliente} rotulo="Salvar" />
        </section>
        <section>
          <div className="editor">
            <div className="editor-secao">
              <h3 className="editor-titulo">Portal do cliente</h3>
              <p className="dica">
                Por este link o cliente aprova licitações e informa o preço mínimo. Quem tiver o
                link entra. Se ele vazar, gere outro: o antigo para de funcionar na hora.
              </p>
              <CopiarLink link={link} />
              <form action={regenerarLink.bind(null, id)} style={{ marginTop: 10 }}>
                <button className="btn btn-perigo" style={{ marginLeft: 0 }}>
                  Gerar link novo
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
      <h2 className="secao-titulo secao-larga">Cofre de documentos</h2>
      <main className="pagina pagina-uma">
        <section className="editor">
          <Cofre
            documentos={await listarCofre(id)}
            modo="operador"
            pedirUpload={opPedirUpload.bind(null, id)}
            registrar={opRegistrar.bind(null, id)}
            link={opLink.bind(null, id)}
            atualizar={opAtualizar.bind(null, id)}
            apagar={opApagar.bind(null, id)}
          />
        </section>
      </main>
      <h2 className="secao-titulo secao-larga">Perfis de busca</h2>
      <Filtros
        clienteId={id}
        contexto={cliente.contexto}
        perfis={(perfis ?? []) as Perfil[]}
        contagens={contagens}
      />
    </>
  );
}
