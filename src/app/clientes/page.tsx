import Link from "next/link";
import { db, type ClienteRow } from "@/lib/db";
import { formatarCnpj } from "@/lib/formato";
import Topo from "@/components/Topo";
import FormCliente from "@/components/FormCliente";
import { criarCliente } from "./acoes";

export const dynamic = "force-dynamic";

export default async function Clientes() {
  const supabase = db();
  const [{ data: clientes, error }, { data: disputas }] = await Promise.all([
    supabase.from("clientes").select("*").order("razao_social"),
    supabase.from("disputas").select("cliente_id, status"),
  ]);

  // por cliente: quantas sugestões na mesa, quantas em andamento, quantas ganhas
  const placar = new Map<string, { sugeridas: number; andamento: number; ganhas: number }>();
  for (const d of disputas ?? []) {
    const p = placar.get(d.cliente_id) ?? { sugeridas: 0, andamento: 0, ganhas: 0 };
    if (d.status === "sugerida") p.sugeridas++;
    else if (d.status === "ganhou") p.ganhas++;
    else if (!["descartada", "recusada", "perdeu", "desistiu"].includes(d.status)) p.andamento++;
    placar.set(d.cliente_id, p);
  }

  return (
    <>
      <Topo titulo="Clientes" sub="As empresas em nome de quem você disputa." atual="clientes" />
      <main className="pagina pagina-duas">
        <section>
          {error && <p className="aviso aviso-erro">{error.message}</p>}
          {(clientes ?? []).length === 0 ? (
            <div className="vazio">
              <p>Cadastre o primeiro cliente.</p>
              <p className="dica">
                Depois do cadastro, monte o perfil de busca dele. É o perfil que diz à coleta quais
                licitações procurar.
              </p>
            </div>
          ) : (
            <div className="lista lista-clientes">
              {(clientes as ClienteRow[]).map((c) => {
                const p = placar.get(c.id) ?? { sugeridas: 0, andamento: 0, ganhas: 0 };
                return (
                  <Link key={c.id} href={`/clientes/${c.id}`} className="cliente-linha">
                    <span className="cliente-nome">
                      {c.nome_fantasia || c.razao_social}
                      {!c.ativo && <span className="selo selo-descartada">Desligado</span>}
                    </span>
                    <span className="cliente-doc">
                      {c.porte}, CNPJ {formatarCnpj(c.cnpj)}
                    </span>
                    <span className="cliente-numeros">
                      <span><b className="num">{p.sugeridas}</b> na triagem</span>
                      <span><b className="num">{p.andamento}</b> em andamento</span>
                      <span className="u-verde"><b className="num">{p.ganhas}</b> ganhas</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        <section>
          <h2 className="secao-titulo">Novo cliente</h2>
          <FormCliente acao={criarCliente} rotulo="Cadastrar cliente" />
        </section>
      </main>
    </>
  );
}
