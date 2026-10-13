import { db } from "./db";
import {
  buscarPropostasAbertas,
  dataPNCP,
  linkPNCP,
  MODALIDADES,
  TAMANHO_PAGINA_MAX,
  type ContratacaoPNCP,
} from "./pncp";
import { melhorPorCliente, type Perfil, type Resultado } from "./scoring";
import { alertarOperador, type AlertaOperador } from "./notify";

/** Pausa entre duas chamadas ao PNCP. Sem isso o PNCP estrangula o IP. */
const DELAY_ENTRE_PAGINAS_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Modalidades padrão: as que dá para disputar de forma remota.
 *   6 = Pregão eletrônico, 4 = Concorrência eletrônica, 8 = Dispensa.
 * Presenciais (5, 7) ficam de fora: exigem alguém na sala do órgão.
 */
export const MODALIDADES_PADRAO = "6,4,8";

export function modalidadesConfiguradas(): number[] {
  return (process.env.MODALIDADES ?? MODALIDADES_PADRAO)
    .split(",")
    .map((m) => Number(m.trim()))
    .filter((m) => MODALIDADES[m]);
}

/**
 * Offset de Brasília. O PNCP manda data SEM offset ("2026-08-31T17:00:00")
 * em horário de Brasília; as colunas são timestamptz e a sessão do Supabase
 * é UTC, então sem isso tudo entra 3h adiantado e o edital some do painel
 * horas antes de fechar.
 *
 * RESSALVA (herdada do radar): assume -03:00 para o país inteiro. Órgãos de
 * AM/MT/MS/RO/RR/AC podem publicar em hora local; lá a data fica 1-2h errada.
 */
const OFFSET_BRASILIA = "-03:00";

export function comFusoBrasilia(s: string | null | undefined): string | null {
  if (!s) return null;
  if (!s.includes("T")) return s;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  return `${s}${OFFSET_BRASILIA}`;
}

/** Status em que a disputa ainda importa: retificação nelas vira alerta. */
const STATUS_VIVOS = new Set([
  "sugerida",
  "aguardando_cliente",
  "aprovada",
  "em_preparacao",
  "proposta_enviada",
  "em_disputa",
]);

export interface ResumoColeta {
  paginas: number;
  paginasPuladas: number;
  paginasEsperadas: number;
  fatiasPerdidas: number;
  registros: number;
  /** licitações gravadas (novas + atualizadas) */
  licitacoes: number;
  /** disputas novas sugeridas, somando todos os clientes */
  novos: number;
  atualizados: number;
  alertas: number;
  truncado: boolean;
  segundos: number;
  erros: string[];
  /** nome do cliente → quantas licitações casaram nesta coleta */
  porCliente: Record<string, number>;
  ciclo: number;
  cicloFechou: boolean;
  retomaDe: { modalidade: number; uf: string | null; pagina: number } | null;
}

export type SaidaColeta =
  | { ok: false; erro: string; status: number }
  | { ok: true; resumo: ResumoColeta; status: number };

/**
 * Coleta as contratações com proposta em aberto, pontua contra os perfis de
 * TODOS os clientes ativos e grava:
 *   - a licitação, uma vez só;
 *   - uma disputa `sugerida` para cada cliente que passou do corte.
 *
 * Idempotente: o upsert por numeroControlePNCP (licitação) e por
 * (licitação, cliente) (disputa) deixa rodar de hora em hora sem duplicar.
 * O `status` da disputa nunca é sobrescrito pela coleta — a sua decisão e a
 * do cliente sobrevivem.
 *
 * Retomável: grava em `coleta_estado` onde parou. Com pregão ligado o Brasil
 * inteiro são centenas de páginas, e a varredura completa fecha ao longo de
 * várias execuções.
 */
export async function executarColeta(): Promise<SaidaColeta> {
  const inicio = Date.now();
  // 45s porque no plano Hobby da Vercel a função morre aos 60s; os 15s de
  // folga são para gravar o cursor. Num host sem teto, suba pela variável.
  const orcamentoMs = Number(process.env.SYNC_ORCAMENTO_MS ?? 45_000);

  const supabase = db();
  const modalidades = modalidadesConfiguradas();
  const janelaDias = Number(process.env.JANELA_DIAS ?? 45);
  const dataFinal = dataPNCP(new Date(Date.now() + janelaDias * 864e5));

  const { data: run } = await supabase
    .from("sync_runs")
    .insert({ modalidades })
    .select("id")
    .single();
  const runId = run?.id as number | undefined;

  // Só perfis ligados de clientes ativos.
  const { data: perfisRaw, error: erroPerfis } = await supabase
    .from("perfis")
    .select("*, cliente:clientes!inner(id, razao_social, nome_fantasia, ativo)")
    .eq("ativo", true)
    .eq("cliente.ativo", true);

  if (erroPerfis) {
    await finalizar(supabase, runId, { erro: erroPerfis.message });
    return { ok: false, erro: erroPerfis.message, status: 500 };
  }

  type PerfilComCliente = Perfil & {
    cliente: { id: string; razao_social: string; nome_fantasia: string | null };
  };
  const perfis = (perfisRaw ?? []) as PerfilComCliente[];
  if (perfis.length === 0) {
    await finalizar(supabase, runId, { erro: "nenhum perfil ligado" });
    return {
      ok: false,
      erro: "Nenhum cliente ativo com perfil de busca ligado. Cadastre em /clientes.",
      status: 400,
    };
  }
  const nomeCliente = new Map(
    perfis.map((p) => [p.cliente_id, p.cliente.nome_fantasia || p.cliente.razao_social])
  );

  // Se todo perfil restringe UF, só busca essas UFs. Um perfil nacional
  // basta para varrer o Brasil inteiro (uf = undefined).
  const algumNacional = perfis.some((p) => p.ufs.length === 0);
  const ufs: (string | undefined)[] = algumNacional
    ? [undefined]
    : [...new Set(perfis.flatMap((p) => p.ufs))];

  const { data: estadoRaw } = await supabase
    .from("coleta_estado")
    .select("modalidade, uf, pagina, ciclo")
    .eq("id", 1)
    .maybeSingle();

  const ciclo = (estadoRaw?.ciclo as number | undefined) ?? 1;
  const mi0 = Math.max(0, modalidades.indexOf((estadoRaw?.modalidade as number) ?? modalidades[0]));
  const ufSalva = (estadoRaw?.uf as string | null) ?? null;
  const ui0 = Math.max(0, ufs.indexOf(ufSalva ?? undefined));
  const paginaInicial = Math.max(1, (estadoRaw?.pagina as number | undefined) ?? 1);

  let retomaDe: ResumoColeta["retomaDe"] = null;
  let primeiraFatia = true;

  let paginas = 0;
  let paginasPuladas = 0;
  let fatiasPerdidas = 0;
  let paginasEsperadas = 0;
  let registros = 0;
  let licitacoesGravadas = 0;
  let novos = 0;
  let atualizados = 0;
  let truncado = false;
  const paraAlertar: AlertaOperador[] = [];
  const erros: string[] = [];
  const porCliente: Record<string, number> = {};

  loop: for (let mi = mi0; mi < modalidades.length; mi++) {
    const modalidade = modalidades[mi];

    for (let ui = mi === mi0 ? ui0 : 0; ui < ufs.length; ui++) {
      const uf = ufs[ui];
      let contabilizou = false;
      let pagina = primeiraFatia ? paginaInicial : 1;
      primeiraFatia = false;
      let totalPaginas = Math.max(1, pagina);

      while (pagina <= totalPaginas) {
        if (Date.now() - inicio > orcamentoMs) {
          truncado = true;
          retomaDe = { modalidade, uf: uf ?? null, pagina };
          break loop;
        }
        if (paginas + paginasPuladas > 0) await sleep(DELAY_ENTRE_PAGINAS_MS);

        let lote;
        try {
          lote = await buscarPropostasAbertas({
            dataFinal,
            codigoModalidadeContratacao: modalidade,
            pagina,
            tamanhoPagina: TAMANHO_PAGINA_MAX,
            uf,
            deadline: inicio + orcamentoMs,
          });
        } catch (e) {
          erros.push(`mod ${modalidade}${uf ? `/${uf}` : ""} pág ${pagina}: ${(e as Error).message}`);
          paginasPuladas++;
          if (pagina === 1) fatiasPerdidas++;
          pagina++;
          continue;
        }

        paginas++;
        totalPaginas = Math.max(lote.totalPaginas, 1);
        if (!contabilizou) {
          paginasEsperadas += totalPaginas;
          contabilizou = true;
        }
        registros += lote.data.length;
        if (lote.data.length === 0) break;

        // Pontua a página inteira em memória. O Map dedupa o mesmo controle
        // repetido no lote, que derrubaria o upsert em lote.
        const candidatos = new Map<
          string,
          { c: ContratacaoPNCP; porCliente: Map<string, { perfil: Perfil; resultado: Resultado }> }
        >();
        for (const c of lote.data) {
          if (!c.numeroControlePNCP) continue;
          const matches = melhorPorCliente(
            {
              objeto: c.objetoCompra,
              uf: c.unidadeOrgao?.ufSigla,
              valorEstimado: c.valorTotalEstimado,
              unidade: c.unidadeOrgao?.nomeUnidade,
              orgao: c.orgaoEntidade?.razaoSocial,
            },
            perfis
          );
          if (matches.size > 0) candidatos.set(c.numeroControlePNCP, { c, porCliente: matches });
        }

        if (candidatos.size > 0) {
          const contexto = `mod ${modalidade}${uf ? `/${uf}` : ""} pág ${pagina}`;
          const r = await gravarPagina(supabase, candidatos, modalidade);
          if (r.erro) {
            erros.push(`${contexto}: ${r.erro}`);
          } else {
            licitacoesGravadas += r.licitacoes;
            novos += r.novos;
            atualizados += r.atualizados;
            paraAlertar.push(...r.alertas);
            for (const [clienteId, n] of r.porCliente) {
              const nome = nomeCliente.get(clienteId) ?? clienteId;
              porCliente[nome] = (porCliente[nome] ?? 0) + n;
            }
          }
        }

        pagina++;
      }
    }
  }

  const cicloFechou = !truncado;
  await supabase
    .from("coleta_estado")
    .update(
      cicloFechou
        ? {
            modalidade: modalidades[0] ?? null,
            uf: null,
            pagina: 1,
            ciclo: ciclo + 1,
            ciclo_iniciado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          }
        : {
            modalidade: retomaDe?.modalidade ?? null,
            uf: retomaDe?.uf ?? null,
            pagina: retomaDe?.pagina ?? 1,
            atualizado_em: new Date().toISOString(),
          }
    )
    .eq("id", 1);

  let alertas = 0;
  if (paraAlertar.length > 0) {
    paraAlertar.sort((a, b) => b.score - a.score);
    for (const a of paraAlertar) a.cliente = nomeCliente.get(a.clienteId) ?? a.cliente;
    const enviou = await alertarOperador(paraAlertar);
    if (enviou) {
      alertas = paraAlertar.length;
      await supabase
        .from("disputas")
        .update({ notificado_em: new Date().toISOString() })
        .in(
          "id",
          paraAlertar.map((a) => a.disputaId)
        );
    }
  }

  const resumo: ResumoColeta = {
    paginas,
    paginasPuladas,
    paginasEsperadas,
    fatiasPerdidas,
    registros,
    licitacoes: licitacoesGravadas,
    novos,
    atualizados,
    alertas,
    truncado,
    segundos: Math.round((Date.now() - inicio) / 1000),
    erros: erros.slice(0, 10),
    porCliente,
    ciclo,
    cicloFechou,
    retomaDe,
  };

  await finalizar(supabase, runId, {
    paginas,
    paginas_puladas: paginasPuladas,
    registros,
    novos,
    atualizados,
    alertas,
    truncado,
    ciclo,
    erro: erros.length ? erros.slice(0, 5).join(" | ") : null,
  });

  // 500 quando a varredura não vale como resultado: não leu nada, perdeu uma
  // fatia inteira, ou pulou mais de um quinto das páginas.
  const falhouTudo = erros.length > 0 && registros === 0;
  const faltouDemais = paginasEsperadas > 0 && paginasPuladas > paginasEsperadas * 0.2;
  const perdeuFatia = fatiasPerdidas > 0;

  return {
    ok: true,
    resumo,
    status: falhouTudo || faltouDemais || perdeuFatia ? 500 : 200,
  };
}

/**
 * Grava uma página: upsert das licitações, depois das disputas. Três idas ao
 * banco por página no total, independente de quantos registros casaram.
 */
async function gravarPagina(
  supabase: ReturnType<typeof db>,
  candidatos: Map<
    string,
    { c: ContratacaoPNCP; porCliente: Map<string, { perfil: Perfil; resultado: Resultado }> }
  >,
  modalidade: number
): Promise<{
  erro?: string;
  licitacoes: number;
  novos: number;
  atualizados: number;
  alertas: AlertaOperador[];
  porCliente: Map<string, number>;
}> {
  const ids = [...candidatos.keys()];
  const vazio = { licitacoes: 0, novos: 0, atualizados: 0, alertas: [], porCliente: new Map() };

  const [licExistentes, dispExistentes] = await Promise.all([
    supabase
      .from("licitacoes")
      .select("numero_controle_pncp, data_atualizacao_pncp, revisoes")
      .in("numero_controle_pncp", ids),
    supabase
      .from("disputas")
      .select("id, licitacao_id, cliente_id, status, notificado_em")
      .in("licitacao_id", ids),
  ]);
  if (licExistentes.error) return { ...vazio, erro: `select licitações: ${licExistentes.error.message}` };
  if (dispExistentes.error) return { ...vazio, erro: `select disputas: ${dispExistentes.error.message}` };

  const licPor = new Map((licExistentes.data ?? []).map((l) => [l.numero_controle_pncp as string, l]));
  const chave = (lic: string, cli: string) => `${lic}|${cli}`;
  const dispPor = new Map(
    (dispExistentes.data ?? []).map((d) => [chave(d.licitacao_id as string, d.cliente_id as string), d])
  );

  // ── licitações ──
  const mudouPor = new Map<string, boolean>();
  const linhasLic = [];
  for (const [id, { c }] of candidatos) {
    const existente = licPor.get(id);
    const atualizadoEm = comFusoBrasilia(c.dataAtualizacao);
    // Retificação de edital: a dataAtualizacao do PNCP andou desde a última
    // coleta. Comparado no mesmo fuso, senão dá 3h de erro.
    const mudou =
      existente != null &&
      atualizadoEm != null &&
      existente.data_atualizacao_pncp != null &&
      new Date(atualizadoEm).getTime() > new Date(existente.data_atualizacao_pncp as string).getTime();
    mudouPor.set(id, mudou);

    linhasLic.push({
      numero_controle_pncp: id,
      modalidade_id: c.modalidadeId ?? modalidade,
      modalidade_nome: c.modalidadeNome ?? MODALIDADES[modalidade],
      objeto: c.objetoCompra ?? null,
      processo: c.processo ?? null,
      orgao_cnpj: c.orgaoEntidade?.cnpj ?? null,
      orgao_razao_social: c.orgaoEntidade?.razaoSocial ?? null,
      unidade_nome: c.unidadeOrgao?.nomeUnidade ?? null,
      uf: c.unidadeOrgao?.ufSigla ?? null,
      municipio: c.unidadeOrgao?.municipioNome ?? null,
      codigo_ibge: c.unidadeOrgao?.codigoIbge ?? null,
      valor_estimado: c.valorTotalEstimado ?? null,
      srp: c.srp ?? null,
      situacao: c.situacaoCompraNome ?? null,
      amparo_legal: c.amparoLegal?.nome ?? null,
      modo_disputa: c.modoDisputaNome ?? null,
      data_abertura_proposta: comFusoBrasilia(c.dataAberturaProposta),
      data_encerramento_proposta: comFusoBrasilia(c.dataEncerramentoProposta),
      data_publicacao_pncp: comFusoBrasilia(c.dataPublicacaoPncp),
      data_atualizacao_pncp: atualizadoEm,
      link_sistema_origem: c.linkSistemaOrigem ?? null,
      link_pncp: linkPNCP(c),
      raw: c,
      revisoes: ((existente?.revisoes as number | undefined) ?? 0) + (mudou ? 1 : 0),
      ultima_coleta: new Date().toISOString(),
    });
  }

  const { error: erroLic } = await supabase
    .from("licitacoes")
    .upsert(linhasLic, { onConflict: "numero_controle_pncp" });
  if (erroLic) return { ...vazio, erro: `upsert licitações: ${erroLic.message}` };

  // ── disputas ──
  // `status` fica FORA do payload: na inserção vem o default 'sugerida'; no
  // conflito a coluna não entra no UPDATE e a decisão sobrevive à coleta.
  const linhasDisp = [];
  for (const [id, { porCliente }] of candidatos) {
    for (const [clienteId, { perfil, resultado }] of porCliente) {
      linhasDisp.push({
        licitacao_id: id,
        cliente_id: clienteId,
        perfil_id: perfil.id,
        score: resultado.score,
        termos_encontrados: resultado.termos,
      });
    }
  }

  const { data: salvas, error: erroDisp } = await supabase
    .from("disputas")
    .upsert(linhasDisp, { onConflict: "licitacao_id,cliente_id" })
    .select("id, licitacao_id, cliente_id, status, score, notificado_em");
  if (erroDisp) return { ...vazio, licitacoes: linhasLic.length, erro: `upsert disputas: ${erroDisp.message}` };

  let novos = 0;
  let atualizados = 0;
  const alertas: AlertaOperador[] = [];
  const porCliente = new Map<string, number>();
  const eventosRetificacao = [];

  for (const d of salvas ?? []) {
    const licId = d.licitacao_id as string;
    const cliId = d.cliente_id as string;
    const existente = dispPor.get(chave(licId, cliId));
    if (existente) atualizados++;
    else novos++;
    porCliente.set(cliId, (porCliente.get(cliId) ?? 0) + 1);

    const cand = candidatos.get(licId)!;
    const retificou = mudouPor.get(licId) === true;
    const vivo = STATUS_VIVOS.has(d.status as string);

    if (retificou && vivo && d.status !== "sugerida") {
      eventosRetificacao.push({
        disputa_id: d.id,
        cliente_id: cliId,
        ator: "sistema",
        tipo: "edital_retificado",
        dados: { data_atualizacao_pncp: comFusoBrasilia(cand.c.dataAtualizacao) },
      });
    }

    // Na hora, só retificação de edital numa disputa que ainda está andando
    // (qualquer score — é a forma clássica de perder uma disputa sem
    // perceber). Sugestão nova NÃO avisa aqui: vai no resumo das 8h, 13h e
    // 18h (lib/resumo.ts), que junta tudo o que entrou desde o anterior.
    if (retificou && vivo && d.status !== "sugerida") {
      alertas.push({
        disputaId: d.id as string,
        clienteId: cliId,
        cliente: cliId,
        score: d.score as number,
        objeto: cand.c.objetoCompra ?? "",
        municipio: cand.c.unidadeOrgao?.municipioNome ?? null,
        uf: cand.c.unidadeOrgao?.ufSigla ?? null,
        valor: cand.c.valorTotalEstimado ?? null,
        modalidade: cand.c.modalidadeNome ?? MODALIDADES[modalidade],
        encerramento: comFusoBrasilia(cand.c.dataEncerramentoProposta),
        link: linkPNCP(cand.c) ?? cand.c.linkSistemaOrigem ?? null,
        retificado: retificou,
        status: d.status as string,
      });
    }
  }

  if (eventosRetificacao.length > 0) {
    await supabase.from("eventos").insert(eventosRetificacao);
  }

  return { licitacoes: linhasLic.length, novos, atualizados, alertas, porCliente };
}

async function finalizar(
  supabase: ReturnType<typeof db>,
  runId: number | undefined,
  campos: Record<string, unknown>
) {
  if (!runId) return;
  await supabase
    .from("sync_runs")
    .update({ ...campos, finalizado_em: new Date().toISOString() })
    .eq("id", runId);
}
