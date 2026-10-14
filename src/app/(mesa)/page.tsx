import Link from "next/link";
import { exigirOperadorPagina } from "@/lib/auth";
import { db, SELECT_DISPUTA_COMPLETA, type DisputaCompleta } from "@/lib/db";
import { STATUS_EXCLUSIVOS } from "@/lib/etapas";
import { Cabecalho } from "@/components/Cabecalho";
import { Aviso } from "@/components/ui/aviso";
import { Vazio } from "@/components/ui/vazio";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import Mesa from "@/components/Mesa";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// A análise rápida dos cards roda como server action desta página (chamada à IA).
export const maxDuration = 300;

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
  await exigirOperadorPagina();
  let sugeridas: DisputaCompleta[] = [];
  let andamento: DisputaCompleta[] = [];
  let encerradas: DisputaCompleta[] = [];
  let clientes: { id: string; nome: string }[] = [];
  let ultimaColeta: { finalizado_em: string | null; erro: string | null } | null = null;
  const lidas: Record<string, true> = {};
  const comResultado: Record<string, true> = {};
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

    // Só para os selos do card: qual edital já foi lido, qual sessão já tem
    // lances registrados. O conteúdo abre na página de cada licitação.
    const { data: fs } = await supabase.from("fichas_edital").select("licitacao_id").limit(5000);
    for (const f of fs ?? []) lidas[f.licitacao_id as string] = true;
    const comSessao = [...andamento, ...encerradas]
      .filter((d) => ["em_disputa", "ganhou", "perdeu", "desistiu"].includes(d.status))
      .map((d) => d.id)
      .slice(0, 300);
    if (comSessao.length) {
      // Se a tabela ainda não existir no banco, a mesa abre sem os selos.
      const { data: rs } = await supabase.from("resultados_disputa").select("disputa_id").in("disputa_id", comSessao);
      for (const r of rs ?? []) comResultado[r.disputa_id as string] = true;
    }
  } catch (e) {
    falha = (e as Error).message;
  }

  if (falha) {
    return (
      <>
        <Cabecalho titulo="Mesa" />
        <Aviso tom="erro" titulo="A mesa não conseguiu ler o banco.">
          <p>
            Confira <code className="font-mono text-xs">SUPABASE_URL</code> e{" "}
            <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> e se a migration em{" "}
            <code className="font-mono text-xs">supabase/migrations</code> já foi aplicada.
          </p>
          <p>
            <code className="break-all font-mono text-xs">{falha}</code>
          </p>
        </Aviso>
      </>
    );
  }

  if (clientes.length === 0) {
    return (
      <>
        <Cabecalho titulo="Mesa" />
        <Vazio icone={Building2} titulo="Nenhum cliente cadastrado.">
          <p>A coleta procura licitações para os perfis de busca dos clientes. Comece cadastrando o primeiro.</p>
          <Button asChild size="sm">
            <Link href="/clientes">
              <Plus />
              Cadastrar cliente
            </Link>
          </Button>
        </Vazio>
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
    <Mesa
      disputas={[...sugeridas, ...andamento, ...encerradas]}
      clientes={clientes}
      exclusivas={exclusivas}
      ultimaColeta={ultimaColeta}
      lidas={lidas}
      comResultado={comResultado}
    />
  );
}
