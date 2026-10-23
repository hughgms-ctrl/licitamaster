import type { SupabaseClient } from "@supabase/supabase-js";
import { prioridade } from "./prioridade";

/**
 * Licitações que venceram sem decisão: ficaram na triagem até o prazo
 * fechar, sem ninguém enviar ao cliente nem descartar. É a perda que não
 * aparece em lugar nenhum; aqui ela vira número, por cliente.
 */

export interface VencidaLinha {
  id: string;
  cliente_id: string;
  score: number;
  analise_ia: { veredito?: string | null } | null;
  cliente: { razao_social: string; nome_fantasia: string | null } | null;
  licitacao: {
    objeto: string | null;
    orgao_razao_social: string | null;
    uf: string | null;
    municipio: string | null;
    valor_estimado: number | null;
    data_encerramento_proposta: string | null;
  };
}

export interface ResumoVencidas {
  total: number;
  porCliente: { clienteId: string; nome: string; total: number; valeAPena: number; notaAlta: number; valor: number }[];
  /** as que mais doem: prioridade mais alta entre as perdidas */
  piores: VencidaLinha[];
}

/** Nota a partir da qual a vencida conta como "nota alta". */
export const NOTA_ALTA = 70;

export async function carregarVencidas(supabase: SupabaseClient, dias = 30): Promise<ResumoVencidas> {
  const agora = new Date().toISOString();
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const linhas: VencidaLinha[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await supabase
      .from("disputas")
      .select(
        "id, cliente_id, score, analise_ia, cliente:clientes(razao_social, nome_fantasia), licitacao:licitacoes!inner(objeto, orgao_razao_social, uf, municipio, valor_estimado, data_encerramento_proposta)"
      )
      .eq("status", "sugerida")
      .lt("licitacao.data_encerramento_proposta", agora)
      .gte("licitacao.data_encerramento_proposta", desde)
      .order("id")
      .range(de, de + 999);
    if (error || !data) break;
    linhas.push(...(data as unknown as VencidaLinha[]));
    if (data.length < 1000) break;
  }

  const por = new Map<string, ResumoVencidas["porCliente"][number]>();
  for (const l of linhas) {
    const c =
      por.get(l.cliente_id) ??
      { clienteId: l.cliente_id, nome: l.cliente?.nome_fantasia || l.cliente?.razao_social || "—", total: 0, valeAPena: 0, notaAlta: 0, valor: 0 };
    c.total++;
    if (l.analise_ia?.veredito === "vale_a_pena") c.valeAPena++;
    if (l.score >= NOTA_ALTA) c.notaAlta++;
    c.valor += l.licitacao.valor_estimado ?? 0;
    por.set(l.cliente_id, c);
  }

  // Prioridade sem a urgência (o prazo já passou para todas).
  const peso = (l: VencidaLinha) => prioridade(l, null);
  return {
    total: linhas.length,
    porCliente: [...por.values()].sort((a, b) => b.valeAPena - a.valeAPena || b.notaAlta - a.notaAlta || b.total - a.total),
    piores: [...linhas].sort((a, b) => peso(b) - peso(a)).slice(0, 15),
  };
}
