import { buscarPropostasAbertas, dataPNCP, MODALIDADES, TAMANHO_PAGINA_MAX } from "./pncp";
import { normalizar } from "./scoring";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DELAY_ENTRE_PAGINAS_MS = 250;

export interface AmostraObjeto {
  objeto: string;
  orgao: string | null;
  uf: string | null;
  valor: number | null;
  modalidade: string | null;
}

export interface ResultadoAmostra {
  amostras: AmostraObjeto[];
  /** quantas contratações foram lidas no total */
  lidas: number;
  paginasPuladas: number;
  truncado: boolean;
  erro?: string;
}

/**
 * Varre o PNCP e devolve o TEXTO dos objetos, para a IA ler como um corpus.
 *
 * Existe porque a tabela `oportunidades` não serve para isso: ela só guarda o
 * que já passou de algum filtro. Perguntar "que palavras eu deveria estar
 * usando?" olhando só o que os filtros atuais capturaram é circular — você
 * nunca descobriria um termo que nenhum filtro seu conhece.
 *
 * `sementes` são palavras de partida do seu ramo ("bloco", "laje"). Só entram
 * na amostra os objetos que contêm alguma delas, comparadas sem acento e sem
 * caixa. Sem sementes, devolve uma amostra geral — útil pra "não sei nem o que
 * procurar".
 */
export async function amostrarObjetos(opts: {
  sementes: string[];
  /** teto de objetos devolvidos; o prompt não precisa de mais que isso */
  limite?: number;
  orcamentoMs?: number;
}): Promise<ResultadoAmostra> {
  const inicio = Date.now();
  const orcamentoMs = opts.orcamentoMs ?? 120_000;
  const limite = opts.limite ?? 150;

  const sementes = opts.sementes.map((s) => normalizar(s)).filter(Boolean);

  const modalidades = (process.env.MODALIDADES ?? "6,4,8")
    .split(",")
    .map((m) => Number(m.trim()))
    .filter((m) => MODALIDADES[m]);

  const janelaDias = Number(process.env.JANELA_DIAS ?? 45);
  const dataFinal = dataPNCP(new Date(Date.now() + janelaDias * 864e5));

  const amostras: AmostraObjeto[] = [];
  let lidas = 0;
  let paginas = 0;
  let paginasPuladas = 0;
  let truncado = false;
  let ultimoErro: string | undefined;

  loop: for (const modalidade of modalidades) {
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= totalPaginas) {
      if (Date.now() - inicio > orcamentoMs) {
        truncado = true;
        break loop;
      }
      if (amostras.length >= limite) break loop;

      if (paginas + paginasPuladas > 0) await sleep(DELAY_ENTRE_PAGINAS_MS);

      let lote;
      try {
        lote = await buscarPropostasAbertas({
          dataFinal,
          codigoModalidadeContratacao: modalidade,
          pagina,
          tamanhoPagina: TAMANHO_PAGINA_MAX,
          deadline: inicio + orcamentoMs,
        });
      } catch (e) {
        paginasPuladas++;
        ultimoErro = (e as Error).message;
        if (pagina === 1) break; // sem a página 1 não sabemos o tamanho da fatia
        pagina++;
        continue;
      }

      paginas++;
      totalPaginas = Math.max(lote.totalPaginas, 1);
      lidas += lote.data.length;
      if (lote.data.length === 0) break;

      for (const c of lote.data) {
        const objeto = (c.objetoCompra ?? "").replace(/\s+/g, " ").trim();
        if (!objeto) continue;

        if (sementes.length > 0) {
          const norm = normalizar(objeto);
          if (!sementes.some((s) => norm.includes(s))) continue;
        }

        amostras.push({
          objeto: objeto.slice(0, 600),
          orgao: c.orgaoEntidade?.razaoSocial ?? null,
          uf: c.unidadeOrgao?.ufSigla ?? null,
          valor: c.valorTotalEstimado ?? null,
          modalidade: c.modalidadeNome ?? null,
        });
        if (amostras.length >= limite) break loop;
      }

      pagina++;
    }
  }

  return { amostras, lidas, paginasPuladas, truncado, erro: ultimoErro };
}
