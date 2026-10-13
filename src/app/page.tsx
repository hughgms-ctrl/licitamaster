import Link from "next/link";
import { db, SELECT_DISPUTA_COMPLETA, type DisputaCompleta } from "@/lib/db";
import { STATUS_EXCLUSIVOS } from "@/lib/etapas";
import Topo from "@/components/Topo";
import Mesa from "@/components/Mesa";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Etapas que aparecem na mesa sem limite de data: o trabalho em andamento. */
const EM_ANDAMENTO = [
  "aguardando_cliente",
  "recusada",
  "aprovada",
  "em_preparacao",
  "proposta_enviada",
  "em_disputa",
];
const ENCERRADOS = ["ganhou", "perdeu", "desistiu", "descartada"];

export default async function Home() {
  let sugeridas: DisputaCompleta[] = [];
  let andamento: DisputaCompleta[] = [];
  let encerradas: DisputaCompleta[] = [];
  let clientes: { id: string; nome: string }[] = [];
  let ultimaColeta: { finalizado_em: string | null; erro: string | null } | null = null;
  let falha: string | null = null;

  try {
    const supabase = db();
    const agora = new Date().toISOString();
    const trintaDias = new Date(Date.now() - 30 * 864e5).toISOString();
    // licitacao:licitacoes!inner para poder filtrar pelo prazo da licitação
    const selectComPrazo = SELECT_DISPUTA_COMPLETA.replace(
      "licitacao:licitacoes(*)",
      "licitacao:licitacoes!inner(*)"
    );

    const [sug, and, enc, cls, runs] = await Promise.all([
      // Triagem: só o que ainda dá tempo de disputar, do melhor score para baixo.
      supabase
        .from("disputas")
        .select(selectComPrazo)
        .eq("status", "sugerida")
        .gte("licitacao.data_encerramento_proposta", agora)
        .order("score", { ascending: false })
        .limit(400),
      supabase
        .from("disputas")
        .select(SELECT_DISPUTA_COMPLETA)
        .in("status", EM_ANDAMENTO)
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("disputas")
        .select(SELECT_DISPUTA_COMPLETA)
        .in("status", ENCERRADOS)
        .gte("updated_at", trintaDias)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase.from("clientes").select("id, razao_social, nome_fantasia").order("razao_social"),
      supabase
        .from("sync_runs")
        .select("finalizado_em, erro")
        .not("finalizado_em", "is", null)
        .order("id", { ascending: false })
        .limit(1),
    ]);

    for (const r of [sug, and, enc, cls]) if (r.error) throw new Error(r.error.message);
    sugeridas = (sug.data ?? []) as unknown as DisputaCompleta[];
    andamento = (and.data ?? []) as unknown as DisputaCompleta[];
    encerradas = (enc.data ?? []) as unknown as DisputaCompleta[];
    clientes = (cls.data ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.razao_social }));
    ultimaColeta = runs.data?.[0] ?? null;
  } catch (e) {
    falha = (e as Error).message;
  }

  if (falha) {
    return (
      <>
        <Topo titulo="Licitação Master" sub="mesa de operação" atual="mesa" />
        <main className="pagina pagina-uma">
          <div className="erro">
            <strong>A mesa não conseguiu ler o banco.</strong>
            <p>
              Confira <code>SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code> e se o{" "}
              a migration em <code>supabase/migrations</code> já foi aplicada.
            </p>
            <p>
              <code>{falha}</code>
            </p>
          </div>
        </main>
      </>
    );
  }

  if (clientes.length === 0) {
    return (
      <>
        <Topo titulo="Licitação Master" sub="mesa de operação" atual="mesa" />
        <main className="pagina pagina-uma">
          <div className="vazio">
            <p>Nenhum cliente cadastrado.</p>
            <p className="dica">
              A coleta procura licitações para os perfis de busca dos clientes. Comece{" "}
              <Link href="/clientes">cadastrando o primeiro</Link>.
            </p>
          </div>
        </main>
      </>
    );
  }

  // Licitação → cliente que está com ela (regra de exclusividade). A mesa usa
  // para avisar e travar o "Enviar" antes de você tentar; o banco trava de
  // qualquer forma.
  const exclusivas: Record<string, string> = {};
  for (const d of [...andamento, ...encerradas]) {
    if ((STATUS_EXCLUSIVOS as string[]).includes(d.status)) {
      exclusivas[d.licitacao_id] = d.cliente.nome_fantasia || d.cliente.razao_social;
    }
  }

  return (
    <>
      <Topo titulo="Licitação Master" sub="mesa de operação" atual="mesa" />
      <Mesa
        disputas={[...sugeridas, ...andamento, ...encerradas]}
        clientes={clientes}
        exclusivas={exclusivas}
        ultimaColeta={ultimaColeta}
      />
    </>
  );
}
