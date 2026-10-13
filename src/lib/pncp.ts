/**
 * Cliente da API pública de consultas do PNCP.
 * Base: https://pncp.gov.br/api/consulta  — GET, sem autenticação.
 * Swagger: https://pncp.gov.br/api/consulta/swagger-ui/index.html
 *
 * Três armadilhas que custam tempo (todas verificadas contra a API real):
 *  1. tamanhoPagina tem teto 50. Mandar 51 ou mais devolve 400 "Tamanho de
 *     página inválido", e abaixo de 10 devolve 400 também.
 *  2. Quando a página passa do fim, o PNCP responde 204 sem corpo. Chamar
 *     .json() direto estoura. Por isso o check de status antes de parsear.
 *  3. /contratacoes/proposta ignora dataInicial em silêncio — não dá erro,
 *     simplesmente não filtra. Só dataFinal vale como recorte.
 */

const BASE = process.env.PNCP_BASE_URL ?? "https://pncp.gov.br/api/consulta";

export const MODALIDADES: Record<number, string> = {
  1: "Leilão - Eletrônico",
  2: "Diálogo Competitivo",
  3: "Concurso",
  4: "Concorrência - Eletrônica",
  5: "Concorrência - Presencial",
  6: "Pregão - Eletrônico",
  7: "Pregão - Presencial",
  8: "Dispensa",
  9: "Inexigibilidade",
  10: "Manifestação de Interesse",
  11: "Pré-qualificação",
  12: "Credenciamento",
  13: "Leilão - Presencial",
};

/** O que interessa da resposta. Campos extras ficam no `raw`. */
export interface ContratacaoPNCP {
  numeroControlePNCP: string;
  objetoCompra?: string | null;
  processo?: string | null;
  modalidadeId?: number | null;
  modalidadeNome?: string | null;
  modoDisputaNome?: string | null;
  situacaoCompraNome?: string | null;
  valorTotalEstimado?: number | null;
  srp?: boolean | null;
  anoCompra?: number | null;
  sequencialCompra?: number | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataPublicacaoPncp?: string | null;
  dataAtualizacao?: string | null;
  linkSistemaOrigem?: string | null;
  amparoLegal?: { nome?: string | null; descricao?: string | null } | null;
  orgaoEntidade?: { cnpj?: string | null; razaoSocial?: string | null } | null;
  unidadeOrgao?: {
    nomeUnidade?: string | null;
    ufSigla?: string | null;
    municipioNome?: string | null;
    codigoIbge?: string | null;
  } | null;
  [k: string]: unknown;
}

interface PaginaPNCP {
  data: ContratacaoPNCP[];
  totalPaginas: number;
  totalRegistros: number;
  paginaVazia: boolean;
}

/** AAAAMMDD, que é o formato que o PNCP exige. */
export function dataPNCP(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** Teto real do PNCP, medido na API: 51+ devolve 400. O piso é 10. */
export const TAMANHO_PAGINA_MAX = 50;
const TAMANHO_PAGINA_MIN = 10;

const clampPagina = (n: number) =>
  Math.min(TAMANHO_PAGINA_MAX, Math.max(TAMANHO_PAGINA_MIN, Math.trunc(n)));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Quanto esperar, no máximo, entre duas tentativas. Medido contra a API:
 * o bloqueio por IP do PNCP passou de 120s, então backoff de milissegundos
 * gasta as tentativas todas ainda dentro da janela de bloqueio.
 */
const BACKOFF_MAX_MS = 60_000;

/**
 * Timeout de UMA tentativa. Folgado de propósito: sob rate-limit o PNCP não
 * recusa a conexão, ele a segura — medi uma resposta 200 legítima levando 40s.
 * Com o timeout apertado a gente mata a resposta boa e queima a tentativa.
 */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Lê o Retry-After da resposta, em ms. Aceita as duas formas do HTTP:
 * segundos ("120") e data ("Wed, 21 Oct 2026 07:28:00 GMT").
 *
 * Hoje o PNCP NÃO manda esse header — conferi em 200 e em 400, e não há
 * nenhum x-ratelimit-* também. Fica aqui porque, se um dia mandar, obedecer
 * é melhor que adivinhar; e custa nada quando o header não vem.
 */
function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const segundos = Number(h);
  if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000);
  const quando = Date.parse(h);
  return Number.isNaN(quando) ? undefined : Math.max(0, quando - Date.now());
}

/**
 * GET com backoff exponencial. O PNCP tem rate-limit por IP e cai com
 * frequência.
 *
 * `deadline` (epoch ms) é o corte: sem ele, uma única página problemática
 * consome 5 tentativas × 45s + até 60s de espera entre cada uma e sozinha
 * estoura o orçamento da coleta inteira. Passando o mesmo prazo da run, a
 * retentativa para quando não houver mais tempo útil.
 */
async function get(
  url: string,
  opts: { tentativas?: number; deadline?: number } = {}
): Promise<Response> {
  const tentativas = opts.tentativas ?? 5;
  let ultimoErro: unknown;

  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "*/*", "user-agent": "radar-dispensas/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // 5xx e 429 valem retry; 4xx não (erro nosso, retry não conserta)
      if (res.status >= 500 || res.status === 429) {
        throw Object.assign(new Error(`PNCP ${res.status}`), {
          esperaSugerida: retryAfterMs(res),
        });
      }
      return res;
    } catch (e) {
      ultimoErro = e;
      if (i >= tentativas - 1) break;

      // 5s, 10s, 20s, 40s — com teto de 60s e o Retry-After tendo prioridade.
      const sugerida = (e as { esperaSugerida?: number }).esperaSugerida;
      const espera = Math.min(BACKOFF_MAX_MS, sugerida ?? 5_000 * 2 ** i);

      if (opts.deadline != null && Date.now() + espera >= opts.deadline) break;
      await sleep(espera);
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error("PNCP indisponível");
}

/**
 * Contratações com período de recebimento de propostas EM ABERTO.
 * É o endpoint certo pra caçar oportunidade: só volta o que ainda dá pra disputar.
 */
export async function buscarPropostasAbertas(params: {
  dataFinal: string;              // AAAAMMDD — encerramento até esta data
  codigoModalidadeContratacao: number;
  pagina: number;
  tamanhoPagina?: number;         // 10 a 50; fora disso o PNCP dá 400
  uf?: string;
  codigoMunicipioIbge?: string;
  cnpj?: string;
  /** epoch ms; a retentativa para quando não houver mais tempo útil na run. */
  deadline?: number;
}): Promise<PaginaPNCP> {
  const q = new URLSearchParams({
    dataFinal: params.dataFinal,
    codigoModalidadeContratacao: String(params.codigoModalidadeContratacao),
    pagina: String(params.pagina),
    tamanhoPagina: String(clampPagina(params.tamanhoPagina ?? TAMANHO_PAGINA_MAX)),
  });
  if (params.uf) q.set("uf", params.uf);
  if (params.codigoMunicipioIbge) q.set("codigoMunicipioIbge", params.codigoMunicipioIbge);
  if (params.cnpj) q.set("cnpj", params.cnpj);

  const res = await get(`${BASE}/v1/contratacoes/proposta?${q}`, {
    deadline: params.deadline,
  });

  // 204 = sem resultado. Sem corpo pra parsear.
  if (res.status === 204) {
    return { data: [], totalPaginas: 0, totalRegistros: 0, paginaVazia: true };
  }
  if (!res.ok) {
    throw new Error(`PNCP ${res.status} em ${res.url}: ${await res.text().catch(() => "")}`);
  }

  const body = (await res.json()) as Record<string, unknown>;
  const data = (Array.isArray(body.data) ? body.data : []) as ContratacaoPNCP[];
  return {
    data,
    totalPaginas: Number(body.totalPaginas ?? 1),
    totalRegistros: Number(body.totalRegistros ?? data.length),
    paginaVazia: data.length === 0,
  };
}

/** Link do edital no portal público do PNCP. */
export function linkPNCP(c: ContratacaoPNCP): string | null {
  const cnpj = c.orgaoEntidade?.cnpj?.replace(/\D/g, "");
  if (!cnpj || !c.anoCompra || !c.sequencialCompra) return null;
  return `https://pncp.gov.br/app/editais/${cnpj}/${c.anoCompra}/${c.sequencialCompra}`;
}
