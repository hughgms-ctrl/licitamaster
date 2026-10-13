import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { cifrar, decifrar } from "./cripto";

/**
 * Motor de IA configurado pelo painel (/configuracoes).
 *
 * Ordem de prioridade: o que foi salvo no painel; senão, as variáveis de
 * ambiente (AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY…). Assim o
 * deploy funciona dos dois jeitos, e o painel sempre ganha.
 */

export type Provedor = "anthropic" | "openai";

export interface ConfigIA {
  provedor: Provedor;
  modelo: string;
  apiKey: string;
  origem: "painel" | "ambiente";
}

/** O que a tela pode ver: nunca a chave, só o final dela. */
export interface ResumoConfigIA {
  provedor: Provedor;
  modelo: string;
  finalChave: string;
  origem: "painel" | "ambiente";
  atualizadoEm: string | null;
  /** a chave salva não pôde ser decifrada (o segredo do servidor mudou) */
  ilegivel?: boolean;
}

export const MODELOS_ANTHROPIC = [
  { id: "claude-opus-5-5", rotulo: "Claude Opus 5.5", dica: "O mais capaz. Recomendado para ler editais." },
  { id: "claude-sonnet-5-5", rotulo: "Claude Sonnet 5.5", dica: "Rápido e bom. Metade do preço do Opus." },
  { id: "claude-haiku-5-5", rotulo: "Claude Haiku 5.5", dica: "O mais barato. Bom para triagem em volume." },
];
export const MODELO_PADRAO: Record<Provedor, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-4o",
};

const CHAVE_CONFIG = "ia";

interface ValorSalvo {
  provedor: Provedor;
  modelo: string;
  chave_cifrada: string;
  final_chave: string;
}

// Cache curto: toda análise lê a configuração, e ela muda raramente.
let cache: { valor: ConfigIA | null; em: number } | null = null;
const CACHE_MS = 30_000;

export async function lerConfigIA(): Promise<ConfigIA | null> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.valor;

  let valor: ConfigIA | null = null;
  const { data } = await db().from("configuracoes").select("valor").eq("chave", CHAVE_CONFIG).maybeSingle();
  const salvo = data?.valor as ValorSalvo | undefined;
  const chave = salvo ? decifrar(salvo.chave_cifrada) : null;

  if (salvo && chave) {
    valor = { provedor: salvo.provedor, modelo: salvo.modelo, apiKey: chave, origem: "painel" };
  } else {
    const provedor: Provedor = process.env.AI_PROVIDER === "anthropic" ? "anthropic" : process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY ? "anthropic" : "openai";
    const apiKey = provedor === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
    if (apiKey) {
      const modelo =
        (provedor === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENAI_MODEL) || MODELO_PADRAO[provedor];
      valor = { provedor, modelo, apiKey, origem: "ambiente" };
    }
  }

  cache = { valor, em: Date.now() };
  return valor;
}

export async function resumoConfigIA(): Promise<ResumoConfigIA | null> {
  const { data } = await db()
    .from("configuracoes")
    .select("valor, atualizado_em")
    .eq("chave", CHAVE_CONFIG)
    .maybeSingle();
  const salvo = data?.valor as ValorSalvo | undefined;
  if (salvo) {
    return {
      provedor: salvo.provedor,
      modelo: salvo.modelo,
      finalChave: salvo.final_chave,
      origem: "painel",
      atualizadoEm: data!.atualizado_em as string,
      ilegivel: decifrar(salvo.chave_cifrada) == null,
    };
  }
  const env = await lerConfigIA();
  return env
    ? { provedor: env.provedor, modelo: env.modelo, finalChave: env.apiKey.slice(-4), origem: "ambiente", atualizadoEm: null }
    : null;
}

/**
 * Confere chave e modelo sem gastar token: consulta o modelo pela API de
 * modelos dos dois provedores (gratuita). Devolve erro legível ou null.
 */
export async function testarChave(provedor: Provedor, apiKey: string, modelo: string): Promise<string | null> {
  try {
    if (provedor === "anthropic") {
      const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 20_000 });
      await client.models.retrieve(modelo);
      return null;
    }
    const res = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(modelo)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return null;
    if (res.status === 401) return "A OpenAI recusou a chave. Confira se ela foi copiada inteira.";
    if (res.status === 404) return `A OpenAI não encontrou o modelo "${modelo}" para esta conta.`;
    return `A OpenAI respondeu ${res.status}.`;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return "A Anthropic recusou a chave. Confira se ela foi copiada inteira.";
    if (e instanceof Anthropic.PermissionDeniedError) return "A chave não tem permissão para este modelo.";
    if (e instanceof Anthropic.NotFoundError) return `A Anthropic não encontrou o modelo "${modelo}".`;
    if (e instanceof Anthropic.APIError) return `A Anthropic respondeu ${e.status}: ${e.message}`;
    return `Não deu para falar com o provedor: ${(e as Error).message}`;
  }
}

export async function salvarConfigIA(provedor: Provedor, modelo: string, apiKey: string): Promise<void> {
  const valor: ValorSalvo = {
    provedor,
    modelo,
    chave_cifrada: cifrar(apiKey),
    final_chave: apiKey.slice(-4),
  };
  const { error } = await db()
    .from("configuracoes")
    .upsert({ chave: CHAVE_CONFIG, valor, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = null;
}

export async function removerConfigIA(): Promise<void> {
  const { error } = await db().from("configuracoes").delete().eq("chave", CHAVE_CONFIG);
  if (error) throw new Error(error.message);
  cache = null;
}
