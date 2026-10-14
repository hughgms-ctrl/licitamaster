import { db, type LicitacaoRow } from "./db";
import { BASE_PNCP_V1, getComRetentativa } from "./edital";

/**
 * Resultado oficial no PNCP: itens da contratação e, para os que já têm
 * resultado, o valor homologado e o fornecedor. Os campos vêm da API pública
 * de consulta do PNCP; tudo é lido de forma tolerante, porque órgãos
 * diferentes preenchem de jeitos diferentes.
 */

export interface ItemResultado {
  numero: number;
  descricao: string;
  estimado: number | null;
  homologado: number | null;
  fornecedor: string | null;
  cnpj: string | null;
}

export interface ResultadoPncp {
  licitacao_id: string;
  itens: ItemResultado[];
  valor_estimado: number | null;
  valor_homologado: number | null;
  tem_resultado: boolean;
  consultado_em?: string;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

function caminho(lic: Pick<LicitacaoRow, "orgao_cnpj" | "raw">): string | null {
  const raw = (lic.raw ?? {}) as { anoCompra?: number; sequencialCompra?: number };
  const cnpj = lic.orgao_cnpj?.replace(/\D/g, "");
  if (!cnpj || !raw.anoCompra || !raw.sequencialCompra) return null;
  return `${BASE_PNCP_V1}/orgaos/${cnpj}/compras/${raw.anoCompra}/${raw.sequencialCompra}`;
}

/** Consulta o PNCP e devolve o resultado (sem gravar). */
export async function consultarResultado(lic: LicitacaoRow): Promise<ResultadoPncp> {
  const base = caminho(lic);
  if (!base) throw new Error("Esta licitação não tem os dados para localizar o resultado no PNCP.");

  const res = await getComRetentativa(`${base}/itens?pagina=1&tamanhoPagina=500`, 30_000);
  if (res.status === 204 || res.status === 404) {
    return { licitacao_id: lic.numero_controle_pncp, itens: [], valor_estimado: lic.valor_estimado, valor_homologado: null, tem_resultado: false };
  }
  if (!res.ok) throw new Error(`PNCP ${res.status} ao listar os itens.`);
  const brutos = (await res.json()) as Record<string, unknown>[];
  const lista = Array.isArray(brutos) ? brutos : [];

  const itens: ItemResultado[] = [];
  for (const it of lista.slice(0, 300)) {
    const numero = num(it.numeroItem) ?? itens.length + 1;
    const estimado = num(it.valorTotal) ?? (num(it.valorUnitarioEstimado) != null && num(it.quantidade) != null ? num(it.valorUnitarioEstimado)! * num(it.quantidade)! : null);
    const item: ItemResultado = {
      numero,
      descricao: String(it.descricao ?? "").slice(0, 300),
      estimado,
      homologado: null,
      fornecedor: null,
      cnpj: null,
    };
    if (it.temResultado) {
      const r = await getComRetentativa(`${base}/itens/${numero}/resultados`, 20_000);
      if (r.ok) {
        const rs = (await r.json()) as Record<string, unknown>[];
        const primeiro = Array.isArray(rs) ? rs[0] : null;
        if (primeiro) {
          item.homologado =
            num(primeiro.valorTotalHomologado) ??
            (num(primeiro.valorUnitarioHomologado) != null && num(primeiro.quantidadeHomologada) != null
              ? num(primeiro.valorUnitarioHomologado)! * num(primeiro.quantidadeHomologada)!
              : null);
          item.fornecedor = (primeiro.nomeRazaoSocialFornecedor as string | undefined) ?? null;
          item.cnpj = (primeiro.niFornecedor as string | undefined) ?? null;
        }
      }
    }
    itens.push(item);
  }

  const comResultado = itens.filter((i) => i.homologado != null);
  const soma = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);
  return {
    licitacao_id: lic.numero_controle_pncp,
    itens,
    valor_estimado: itens.length ? soma(itens.map((i) => i.estimado)) || lic.valor_estimado : lic.valor_estimado,
    valor_homologado: comResultado.length ? soma(comResultado.map((i) => i.homologado)) : null,
    tem_resultado: comResultado.length > 0,
  };
}

export async function gravarResultado(r: ResultadoPncp): Promise<void> {
  const { error } = await db()
    .from("resultados_pncp")
    .upsert({ ...r, consultado_em: new Date().toISOString() }, { onConflict: "licitacao_id" });
  if (error) throw new Error(error.message);
}

/**
 * Rodada do agendador: licitações com prazo encerrado entre 5 e 120 dias,
 * sem resultado ainda e não consultadas nos últimos 3 dias. Poucas por vez,
 * para caber no tempo da função e não sobrecarregar o PNCP.
 */
export async function buscarResultadosPendentes(limite = 25): Promise<{ consultadas: number; comResultado: number; erros: number }> {
  const supabase = db();
  const agora = Date.now();
  const { data: candidatas } = await supabase
    .from("licitacoes")
    .select("*")
    .lte("data_encerramento_proposta", new Date(agora - 5 * 864e5).toISOString())
    .gte("data_encerramento_proposta", new Date(agora - 120 * 864e5).toISOString())
    .order("data_encerramento_proposta", { ascending: false })
    .limit(400);
  const ids = (candidatas ?? []).map((l) => l.numero_controle_pncp as string);
  const { data: feitos } = ids.length
    ? await supabase.from("resultados_pncp").select("licitacao_id, tem_resultado, consultado_em").in("licitacao_id", ids)
    : { data: [] };
  const pular = new Set(
    (feitos ?? [])
      .filter((f) => f.tem_resultado || agora - new Date(f.consultado_em as string).getTime() < 3 * 864e5)
      .map((f) => f.licitacao_id as string)
  );

  let consultadas = 0;
  let comResultado = 0;
  let erros = 0;
  for (const lic of ((candidatas ?? []) as LicitacaoRow[]).filter((l) => !pular.has(l.numero_controle_pncp)).slice(0, limite)) {
    try {
      const r = await consultarResultado(lic);
      await gravarResultado(r);
      consultadas++;
      if (r.tem_resultado) comResultado++;
    } catch {
      erros++;
    }
  }
  return { consultadas, comResultado, erros };
}
