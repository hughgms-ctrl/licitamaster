import { db, SELECT_DISPUTA_COMPLETA, type ClienteRow, type DisputaCompleta } from "./db";
import { analisarLicitacao, lerEdital } from "./ai";
import { reunirPDFs } from "./edital";
import { lerConfigIA } from "./config-ia";
import { registrarEvento } from "./disputas";
import type { FichaRow } from "./ficha";

/**
 * O trabalho de leitura que não precisa de gente: a análise rápida das
 * licitações boas da triagem e a leitura do edital das que o cliente aprovou.
 * Nada aqui envia nada ao cliente: quem decide o que vai para ele continua
 * sendo o operador.
 *
 * As mesmas funções servem aos botões da mesa (ator "operador") e ao
 * agendador (ator "sistema").
 */

type Ator = "operador" | "sistema";

/** Análise rápida de uma disputa: grava em disputas.analise_ia. */
export async function analisarDisputa(d: DisputaCompleta, ator: Ator) {
  const supabase = db();
  // select("*"): a coluna de objetivos pode ainda não existir no banco
  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", d.cliente_id)
    .single<Pick<ClienteRow, "razao_social" | "porte" | "contexto" | "objetivos">>();
  if (!cliente) throw new Error("Cliente não encontrado.");
  const analise = await analisarLicitacao(d.licitacao, cliente);
  const { error } = await supabase.from("disputas").update({ analise_ia: analise }).eq("id", d.id);
  if (error) throw new Error(error.message);
  await registrarEvento({ disputa_id: d.id, cliente_id: d.cliente_id, ator, tipo: "analise_ia", dados: { veredito: analise.veredito } });
  return analise;
}

/** Análise profunda: baixa os PDFs do PNCP, a IA lê e a ficha é gravada. */
export async function lerEditalDisputa(d: DisputaCompleta, ator: Ator) {
  const { pdfs, lidos, ignorados } = await reunirPDFs(d.licitacao);
  const ficha = await lerEdital(d.licitacao, pdfs);
  const cfg = await lerConfigIA();
  const linha: FichaRow = {
    licitacao_id: d.licitacao_id,
    ficha,
    arquivos_lidos: lidos,
    versao_pncp: d.licitacao.data_atualizacao_pncp,
    modelo: cfg?.modelo ?? null,
    gerado_em: new Date().toISOString(),
  };
  const { error } = await db().from("fichas_edital").upsert(linha);
  if (error) throw new Error(error.message);
  await registrarEvento({
    disputa_id: d.id,
    cliente_id: d.cliente_id,
    ator,
    tipo: "edital_lido",
    dados: { arquivos: lidos.map((l) => l.titulo), ignorados: ignorados.length },
  });
  return { linha, lidos, ignorados };
}

export interface ResumoAutomacao {
  editaisLidos: number;
  analisadas: number;
  erros: string[];
  segundos: number;
  /** ficou trabalho para a próxima rodada */
  sobrou: boolean;
}

/**
 * Uma rodada do agendador, dentro do orçamento de tempo:
 *  1. lê o edital das disputas aprovadas pelo cliente que ainda não têm ficha
 *     (é o que trava a preparação da proposta);
 *  2. faz a análise rápida das sugeridas com nota alta e ainda sem análise,
 *     da melhor nota para baixo, só das que ainda dá tempo de disputar.
 */
export async function rodarAutomacao(orcamentoMs = 240_000): Promise<ResumoAutomacao> {
  const inicio = Date.now();
  const sobraTempo = (precisa: number) => Date.now() - inicio + precisa < orcamentoMs;
  const supabase = db();
  const agora = new Date().toISOString();
  const scoreMinimo = Number(process.env.AUTO_ANALISE_SCORE ?? 40);
  const erros: string[] = [];
  let editaisLidos = 0;
  let analisadas = 0;
  let sobrou = false;

  // 1. Aprovadas sem ficha do edital.
  const { data: aprovadas } = await supabase
    .from("disputas")
    .select(SELECT_DISPUTA_COMPLETA)
    .in("status", ["aprovada", "em_preparacao"])
    .order("updated_at", { ascending: true })
    .limit(50);
  const ids = (aprovadas ?? []).map((d) => (d as unknown as DisputaCompleta).licitacao_id);
  const { data: comFicha } = ids.length
    ? await supabase.from("fichas_edital").select("licitacao_id").in("licitacao_id", ids)
    : { data: [] };
  const lidas = new Set((comFicha ?? []).map((f) => f.licitacao_id as string));
  for (const d of (aprovadas ?? []) as unknown as DisputaCompleta[]) {
    if (lidas.has(d.licitacao_id)) continue;
    // A leitura pode levar até 3 minutos: só começa se couber.
    if (!sobraTempo(180_000)) {
      sobrou = true;
      break;
    }
    try {
      await lerEditalDisputa(d, "sistema");
      lidas.add(d.licitacao_id);
      editaisLidos++;
    } catch (e) {
      erros.push(`edital ${d.id}: ${(e as Error).message}`);
    }
  }

  // 2. Análise rápida das sugeridas boas.
  const { data: sugeridas } = await supabase
    .from("disputas")
    .select(SELECT_DISPUTA_COMPLETA.replace("licitacao:licitacoes(*)", "licitacao:licitacoes!inner(*)"))
    .eq("status", "sugerida")
    .is("analise_ia", null)
    .gte("score", scoreMinimo)
    .gte("licitacao.data_encerramento_proposta", agora)
    .order("score", { ascending: false })
    .limit(40);
  for (const d of (sugeridas ?? []) as unknown as DisputaCompleta[]) {
    if (!sobraTempo(30_000)) {
      sobrou = true;
      break;
    }
    try {
      await analisarDisputa(d, "sistema");
      analisadas++;
    } catch (e) {
      erros.push(`análise ${d.id}: ${(e as Error).message}`);
      // Sem IA configurada, todas vão falhar igual: não adianta insistir.
      if (/chave|api key|configur/i.test((e as Error).message)) break;
    }
  }

  return { editaisLidos, analisadas, erros: erros.slice(0, 10), segundos: Math.round((Date.now() - inicio) / 1000), sobrou };
}
