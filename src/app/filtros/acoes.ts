"use server";

import { revalidatePath } from "next/cache";
import { executarColeta } from "@/lib/coleta";
import { exigirOperador } from "@/lib/sessao";
import { lerConfigIA } from "@/lib/config-ia";
import { amostrarObjetos } from "@/lib/amostra";
import { sugerirTermos, type SugestaoTermos } from "@/lib/ai";
import type { TermoPositivo } from "@/lib/scoring";

export interface SaidaBusca {
  ok: boolean;
  mensagem: string;
  porCliente?: Record<string, number>;
  detalhe?: string;
}

/**
 * Varre o PNCP agora, sob demanda, em vez de esperar o cron.
 *
 * Por que uma varredura inteira e não uma "busca por esse filtro": a API do
 * PNCP não aceita palavra-chave. Ela só corta por UF, município, CNPJ e
 * modalidade — todo o "isso é do meu ramo?" acontece aqui dentro, depois de
 * baixar. E o coletor só GRAVA o que passa do corte de algum filtro, então
 * um filtro recém-criado não tem onde procurar no banco: o que não casava
 * antes nunca foi guardado. A única forma honesta de responder "o que existe
 * hoje pra este filtro" é baixar de novo e pontuar.
 *
 * Roda como server action para o CRON_SECRET não precisar sair do servidor.
 */
export async function procurarAgora(): Promise<SaidaBusca> {
  await exigirOperador();
  const saida = await executarColeta();

  if (!saida.ok) {
    return { ok: false, mensagem: saida.erro };
  }

  const r = saida.resumo;
  revalidatePath("/clientes", "layout");
  revalidatePath("/");

  // `executarColeta` devolve ok:true quando a rotina rodou até o fim, mas o
  // status carrega o veredito: 500 quer dizer que a varredura não vale como
  // resultado. Sem olhar isso, uma busca que não leu NADA aparece como
  // "0 contratações lidas" em cinza — indistinguível de "não há nada hoje",
  // que é justamente o engano que o 500 da API existe pra evitar.
  const deuRuim = saida.status !== 200;

  if (r.registros === 0) {
    return {
      ok: false,
      mensagem:
        "A varredura não conseguiu ler nada do PNCP. A API não respondeu a tempo — costuma ser bloqueio temporário por excesso de chamadas. Espere alguns minutos e tente de novo.",
      detalhe: r.erros[0],
    };
  }

  const casaram = Object.values(r.porCliente).reduce((a, b) => a + b, 0);
  const partes = [
    `${r.registros} contratações lidas em ${r.segundos}s`,
    `${casaram} sugestões para clientes`,
    `${r.novos} novas, ${r.atualizados} atualizadas`,
  ];

  // Com várias modalidades ligadas, truncar é o normal — a varredura completa
  // não cabe numa execução. O que importa é dizer que ela CONTINUA de onde
  // parou, senão parece que você viu o Brasil todo quando viu um pedaço.
  if (r.truncado && r.retomaDe) {
    partes.push(
      `ciclo ${r.ciclo} em andamento — parou na modalidade ${r.retomaDe.modalidade}, página ${r.retomaDe.pagina}, e retoma daí na próxima. Rode de novo para continuar`
    );
  } else if (r.cicloFechou) {
    partes.push(`ciclo ${r.ciclo} FECHADO: varreu tudo que estava aberto`);
  }
  if (r.paginasPuladas > 0) {
    partes.push(`${r.paginasPuladas} página(s) o PNCP recusou`);
  }

  return {
    ok: !deuRuim,
    mensagem: partes.join(" · "),
    porCliente: r.porCliente,
    detalhe: r.erros.length ? r.erros[0] : undefined,
  };
}

export interface SaidaSugestao {
  ok: boolean;
  mensagem: string;
  sugestao?: SugestaoTermos;
  /** quantos objetos reais a IA leu, e de quantos lidos no total */
  amostrados?: number;
  lidas?: number;
}

/**
 * Assistente de termos: lê objetos REAIS do PNCP e propõe as palavras-chave.
 *
 * O problema que isso resolve: você procura "laje" porque é o que você vende,
 * mas o edital escreve "vigota treliçada" ou "laje pré-fabricada". Nenhuma
 * quantidade de palpite fecha essa distância — só ler o texto que os órgãos
 * escrevem de fato. Por isso a IA recebe uma amostra literal do PNCP como
 * dicionário, em vez de inventar termos de cabeça.
 */
export async function sugerirTermosAgora(entrada: {
  descricao: string;
  sementes: string[];
  termosAtuais?: TermoPositivo[];
}): Promise<SaidaSugestao> {
  await exigirOperador();
  if (!entrada.descricao.trim()) {
    return { ok: false, mensagem: "Descreva o que você vende ou presta." };
  }
  if (!(await lerConfigIA())) {
    return {
      ok: false,
      mensagem: "Nenhuma chave de IA configurada. Cadastre uma em Configurações; o resto do sistema funciona sem ela.",
    };
  }

  let amostra;
  try {
    amostra = await amostrarObjetos({ sementes: entrada.sementes, limite: 150 });
  } catch (e) {
    return { ok: false, mensagem: `Não deu para ler o PNCP: ${(e as Error).message}` };
  }

  if (amostra.amostras.length === 0) {
    const motivo =
      amostra.lidas === 0
        ? "o PNCP não respondeu — costuma ser bloqueio temporário, espere alguns minutos"
        : `nenhum dos ${amostra.lidas} objetos abertos hoje contém essas palavras. Tente palavras mais gerais: "concreto" em vez de "laje treliçada"`;
    return { ok: false, mensagem: `Amostra vazia: ${motivo}.` };
  }

  try {
    const sugestao = await sugerirTermos({
      descricao: entrada.descricao,
      sementes: entrada.sementes,
      amostras: amostra.amostras,
      termosAtuais: entrada.termosAtuais,
    });

    const aviso = amostra.truncado
      ? " (a varredura truncou por tempo, então a amostra é parcial)"
      : "";

    return {
      ok: true,
      mensagem: `A IA leu ${amostra.amostras.length} objetos reais, de ${amostra.lidas} contratações abertas${aviso}.`,
      sugestao,
      amostrados: amostra.amostras.length,
      lidas: amostra.lidas,
    };
  } catch (e) {
    return { ok: false, mensagem: `A IA falhou: ${(e as Error).message}` };
  }
}
