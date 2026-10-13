/**
 * Motor de aderência.
 *
 * A API do PNCP não filtra por palavra-chave — ela só corta por UF, município,
 * CNPJ e modalidade. Todo o "isso é do meu ramo?" acontece aqui.
 *
 * O objeto da compra vem sujo: caixa alta, abreviação, acento inconsistente,
 * texto genérico. Por isso normaliza tudo antes de comparar.
 */

export interface TermoPositivo {
  termo: string;
  peso: number;
}

export interface Perfil {
  id: string;
  cliente_id: string;
  nome: string;
  ativo: boolean;
  termos_positivos: TermoPositivo[];
  termos_negativos: string[];
  ufs: string[];
  valor_min: number | null;
  valor_max: number | null;
  score_minimo: number;
  score_alerta: number;
}

export interface AlvoScore {
  objeto: string | null | undefined;
  uf: string | null | undefined;
  valorEstimado: number | null | undefined;
  unidade?: string | null;
  orgao?: string | null;
}

export interface Resultado {
  score: number;
  termos: string[];
  motivoDescarte: string | null;
}

/** minúscula, sem acento, pontuação virando espaço, espaços colapsados. */
export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Reduz plural a singular o suficiente pra comparar. Aplicado dos dois lados,
 * faz "medicamento" pegar "medicamentos" e vice-versa — sem isso um termo
 * negativo no singular passa batido num objeto escrito no plural.
 */
function radicalizar(t: string): string {
  return t.split(" ").map(singular).join(" ");
}

/**
 * Cortar só o "s" final não basta: plural de palavra terminada em -l muda o
 * radical (combustível→combustíveis, material→materiais, papel→papéis), e
 * o corte ingênuo produzia "combustivei", que não casa com nada. Isso deixou
 * passar no radar um "abastecimento de combustíveis" que o termo negativo
 * "combustivel" deveria ter vetado.
 *
 * O piso de 6 letras é o que segura o falso positivo: com 4, "seis", "mais",
 * "dois" e "pois" — palavras banais em texto de edital — virariam "sel",
 * "mal", "dol" e "pol". De 6 pra cima as colisões somem e as conversões úteis
 * ficam ("editais"→"edital", "portais"→"portal", "locais"→"local").
 *
 * Roda depois de normalizar(), então o acento já saiu.
 */
function singular(p: string): string {
  if (p.length >= 6) {
    if (p.endsWith("eis")) return `${p.slice(0, -3)}el`;
    if (p.endsWith("ais")) return `${p.slice(0, -3)}al`;
    if (p.endsWith("ois")) return `${p.slice(0, -3)}ol`;
    // -ão → -ões: manutenções→manutenção, licitações→licitação, instalações
    if (p.endsWith("oes")) return `${p.slice(0, -3)}ao`;
  }

  // Palavra terminada em -r, -z ou -n faz plural com "es", não com "s":
  // extintor→extintores, motor→motores, luz→luzes. Cortando só o "s" sobrava
  // "extintore", que não casa com "extintor" — e agente em -or é dos
  // substantivos mais comuns em licitação (elevador, gerador, computador,
  // condicionador). Medido: um objeto de "recarga de EXTINTORES" não casava
  // o termo "recarga de extintor".
  //
  // O corte só vale quando o radical termina em r/z/n. Sem essa guarda,
  // "redes" viraria "red" e "bases" viraria "bas" — esses são plural de
  // palavra terminada em -e e o "s" simples já resolve.
  if (p.length >= 5 && p.endsWith("es")) {
    const radical = p.slice(0, -2);
    if (/[rzn]$/.test(radical)) return radical;
  }

  return p.length >= 4 && p.endsWith("s") ? p.slice(0, -1) : p;
}

/** Casa termo como sequência de palavras inteiras — evita "api" casar em "rapidez". */
function contem(textoNorm: string, termo: string): boolean {
  const alvo = radicalizar(normalizar(termo));
  if (!alvo) return false;
  return new RegExp(`(^| )${escapar(alvo)}( |$)`).test(radicalizar(textoNorm));
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Descarta o termo genérico quando o específico já casou.
 *
 * "hospedagem de site" contém "hospedagem": num contrato de hospedagem os
 * dois casam o MESMO trecho do objeto, somam os dois pesos e ainda disparam
 * o bônus de combinação. Medido na varredura real: 45 + 40 + 10 = 95, num
 * objeto que tem um assunto só.
 *
 * O termo mais longo vence porque ele é o mais específico — e casar o
 * específico já implica ter casado o genérico. Sobra 45, que é o certo.
 */
function semSobreposicao(casados: TermoPositivo[]): TermoPositivo[] {
  const raiz = (t: string) => radicalizar(normalizar(t));
  // do mais específico para o mais genérico
  const porTamanho = [...casados].sort((a, b) => raiz(b.termo).length - raiz(a.termo).length);

  const mantidos: TermoPositivo[] = [];
  for (const c of porTamanho) {
    const alvo = raiz(c.termo);
    const engolido = mantidos.some((m) =>
      new RegExp(`(^| )${escapar(alvo)}( |$)`).test(raiz(m.termo))
    );
    if (!engolido) mantidos.push(c);
  }

  // devolve na ordem em que o perfil declarou, que é como você lê depois
  return casados.filter((c) => mantidos.includes(c));
}

/**
 * Piso de peso pra um termo contar no bônus de combinação. Abaixo disso o
 * termo ainda soma o peso dele, só não ajuda a disparar o bônus.
 */
const PESO_TERMO_FORTE = 35;

export function pontuar(alvo: AlvoScore, perfil: Perfil): Resultado {
  const texto = normalizar(
    [alvo.objeto, alvo.unidade, alvo.orgao].filter(Boolean).join(" ")
  );

  if (perfil.ufs.length > 0 && alvo.uf && !perfil.ufs.includes(alvo.uf)) {
    return { score: 0, termos: [], motivoDescarte: `fora das UFs do perfil (${alvo.uf})` };
  }

  // Termo negativo é veto, não desconto. "aquisição de medicamentos e software
  // de controle de estoque" não é sua briga, mesmo casando um termo positivo.
  for (const neg of perfil.termos_negativos) {
    if (contem(texto, neg)) {
      return { score: 0, termos: [], motivoDescarte: `termo negativo: ${neg}` };
    }
  }

  const v = alvo.valorEstimado ?? null;
  // valor 0 ou null costuma ser sigiloso — não descarta por isso.
  if (v !== null && v > 0) {
    if (perfil.valor_min != null && v < perfil.valor_min) {
      return { score: 0, termos: [], motivoDescarte: `valor abaixo do mínimo (${v})` };
    }
    if (perfil.valor_max != null && v > perfil.valor_max) {
      return { score: 0, termos: [], motivoDescarte: `valor acima do máximo (${v})` };
    }
  }

  const casados = perfil.termos_positivos.filter(({ termo }) => contem(texto, termo));
  const efetivos = semSobreposicao(casados);

  let score = 0;
  const termos: string[] = [];
  let fortes = 0;
  for (const { termo, peso } of efetivos) {
    score += peso;
    termos.push(termo);
    if (peso >= PESO_TERMO_FORTE) fortes++;
  }

  // Dois termos diferentes casando é sinal muito mais forte que um só, mas a
  // soma crua explode: um bônus achatado segura isso.
  //
  // Só termo FORTE conta pro bônus. Contando termo genérico, uma licença de
  // CapCut Pro casava "sistema informatizado" + "aplicativo", ganhava os 10 e
  // empatava em 80 com desenvolvimento de software de gestão de verdade.
  if (fortes >= 2) score += 10;
  if (fortes >= 4) score += 10;

  return { score: Math.min(100, score), termos, motivoDescarte: null };
}

/** Roda a oportunidade contra todos os perfis e devolve o melhor encaixe. */
export function melhorPerfil(alvo: AlvoScore, perfis: Perfil[]) {
  let melhor: { perfil: Perfil; resultado: Resultado } | null = null;
  for (const perfil of perfis) {
    if (!perfil.ativo) continue;
    const resultado = pontuar(alvo, perfil);
    if (resultado.score <= 0) continue;
    if (!melhor || resultado.score > melhor.resultado.score) melhor = { perfil, resultado };
  }
  return melhor;
}

/**
 * Melhor perfil de CADA cliente, só para quem passou do score mínimo.
 *
 * Diferente de `melhorPerfil`: aqui uma licitação pode servir a vários
 * clientes ao mesmo tempo, e todos precisam ficar sabendo — quem decide qual
 * deles disputa é você, na mesa de operação (a regra de um cliente por
 * licitação vale depois que ela sai da mesa, não na sugestão).
 */
export function melhorPorCliente(alvo: AlvoScore, perfis: Perfil[]) {
  const porCliente = new Map<string, { perfil: Perfil; resultado: Resultado }>();
  for (const perfil of perfis) {
    if (!perfil.ativo) continue;
    const resultado = pontuar(alvo, perfil);
    if (resultado.score <= 0 || resultado.score < perfil.score_minimo) continue;
    const atual = porCliente.get(perfil.cliente_id);
    if (!atual || resultado.score > atual.resultado.score) {
      porCliente.set(perfil.cliente_id, { perfil, resultado });
    }
  }
  return porCliente;
}
