import Anthropic from "@anthropic-ai/sdk";
import type { AnaliseIA, ClienteRow, LicitacaoRow } from "./db";
import type { AmostraObjeto } from "./amostra";
import { normalizar, type TermoPositivo } from "./scoring";
import { lerConfigIA } from "./config-ia";

/** Um PDF para a IA ler junto com o prompt (edital, termo de referência…). */
export interface DocumentoPDF {
  titulo: string;
  base64: string;
}

export class IANaoConfigurada extends Error {
  constructor() {
    super("Nenhuma chave de IA configurada. Cadastre uma em Configurações.");
  }
}

/**
 * Modelos que aceitam o fallback do servidor: se o modelo recusar por
 * política de segurança (falso positivo acontece com texto jurídico), a
 * própria API refaz a chamada noutro modelo, na mesma requisição.
 */
const COM_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

/**
 * Uma chamada ao modelo configurado (painel ou ambiente), devolvendo só o
 * texto. PDFs vão como documentos nativos: os dois provedores leem o
 * arquivo inteiro, inclusive tabelas e páginas escaneadas.
 */
async function chamarIA(opts: {
  prompt: string;
  maxTokens: number;
  esforco?: "low" | "medium" | "high";
  timeoutMs?: number;
  pdfs?: DocumentoPDF[];
}): Promise<string> {
  const cfg = await lerConfigIA();
  if (!cfg) throw new IANaoConfigurada();

  if (cfg.provedor === "openai") {
    const conteudo = [
      ...(opts.pdfs ?? []).map((p) => ({
        type: "file",
        file: { filename: `${p.titulo}.pdf`, file_data: `data:application/pdf;base64,${p.base64}` },
      })),
      { type: "text", text: opts.prompt },
    ];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.modelo,
        messages: [{ role: "user", content: opts.pdfs?.length ? conteudo : opts.prompt }],
        // JSON garantido; exige a palavra "json" no prompt, e todos pedem.
        response_format: { type: "json_object" },
        // Sem teto de tokens nem temperature: o nome do parâmetro de teto
        // muda entre gerações da OpenAI e alguns modelos recusam temperature.
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: opts.timeoutMs ?? 300_000 });
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [
    // documentos antes do texto: o prompt fala SOBRE eles
    ...(opts.pdfs ?? []).map(
      (p): Anthropic.Beta.BetaContentBlockParam => ({
        type: "document",
        title: p.titulo,
        source: { type: "base64", media_type: "application/pdf", data: p.base64 },
      })
    ),
    { type: "text", text: opts.prompt },
  ];

  // Streaming + finalMessage: leitura de edital pode demorar minutos, e uma
  // requisição longa sem stream estoura o tempo de HTTP.
  const stream = client.beta.messages.stream({
    model: cfg.modelo,
    max_tokens: opts.maxTokens,
    thinking: { type: "adaptive" },
    // explícito: no Opus 5.5 o padrão é "medium", em outros é "high"
    output_config: { effort: opts.esforco ?? "medium" },
    messages: [{ role: "user", content: conteudo }],
    ...(COM_FALLBACK.has(cfg.modelo)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") {
    throw new Error("O modelo recusou a tarefa. Tente de novo ou troque o modelo em Configurações.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error("A resposta da IA foi cortada no meio (limite de tamanho). Tente de novo.");
  }
  // Com thinking ligado vêm blocos de raciocínio junto; só o texto interessa.
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}


/**
 * Barra fragmento de frase, que o modelo às vezes devolve como termo.
 * Visto num teste real: ele propôs "bloco e" como termo negativo — isso
 * vetaria qualquer objeto com a palavra "bloco" seguida de "e".
 */
function util(termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return false;
  const palavras = t.split(" ");
  // termo de uma palavra só precisa ter corpo; "e", "de", "para" não servem
  if (palavras.length === 1) return t.length >= 4;
  // termo composto não pode terminar em conectivo — sinal de frase cortada
  return !/ (e|de|da|do|em|para|com|a|o|no|na|por)$/.test(t);
}

/**
 * O casamento ignora acento e pontuação, então "pré-moldado" e "pre moldado"
 * são o mesmo termo. Sem dedupar, os dois entram e o peso é somado duas
 * vezes pelo mesmo trecho de texto. Fica o de maior peso.
 */
function dedupar(ts: TermoPositivo[]): TermoPositivo[] {
  const porChave = new Map<string, TermoPositivo>();
  for (const t of ts) {
    const chave = normalizar(t.termo);
    const anterior = porChave.get(chave);
    if (!anterior || t.peso > anterior.peso) {
      porChave.set(chave, { termo: chave, peso: t.peso });
    }
  }
  return [...porChave.values()];
}

/** Tira cerca de markdown que às vezes envolve o JSON. */
function parseJson<T>(texto: string): T {
  const limpo = texto.replace(/```json|```/g, "").trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  return JSON.parse(inicio >= 0 ? limpo.slice(inicio, fim + 1) : limpo) as T;
}

export interface SugestaoTermos {
  termos_positivos: TermoPositivo[];
  termos_negativos: string[];
  /** por que esses termos, em uma frase por grupo */
  raciocinio: string;
  /** o que a IA viu na amostra e você talvez não esperasse */
  observacoes: string[];
}

/**
 * Lê objetos REAIS do PNCP e propõe termos de busca.
 *
 * O ponto todo é não deixar a IA inventar palavra-chave de cabeça. Órgão
 * público não escreve como você fala: quem vende laje pré-moldada procura
 * "laje" e não acha nada, porque o edital diz "vigota treliçada", "laje
 * pré-fabricada" ou "tavela cerâmica". A amostra é o dicionário.
 */
export async function sugerirTermos(opts: {
  descricao: string;
  sementes: string[];
  amostras: AmostraObjeto[];
  termosAtuais?: TermoPositivo[];
}): Promise<SugestaoTermos> {
  if (opts.amostras.length === 0) {
    throw new Error(
      "Nenhum objeto do PNCP casou com as palavras de partida. Tente palavras mais gerais — 'concreto' em vez de 'laje treliçada'."
    );
  }

  const corpus = opts.amostras
    .map((a, i) => `[${i + 1}] (${a.uf ?? "—"}, R$ ${a.valor ?? "?"}) ${a.objeto}`)
    .join("\n");

  const atuais = opts.termosAtuais?.length
    ? `\nTERMOS QUE ELE JÁ USA (e que trouxeram pouco ou trouxeram lixo):\n${opts.termosAtuais
        .map((t) => `- ${t.termo} (peso ${t.peso})`)
        .join("\n")}\n`
    : "";

  const prompt = `Você ajuda um fornecedor a caçar contratações públicas no PNCP.

O QUE ELE FAZ / QUER VENDER:
${opts.descricao}

PALAVRAS DE PARTIDA QUE ELE USOU: ${opts.sementes.join(", ") || "(nenhuma)"}
${atuais}
COMO O FILTRO FUNCIONA (importante para calibrar):
- Cada termo positivo que casar SOMA seu peso. Score final tem teto 100.
- Casar dois termos de peso >= 35 dá +10 de bônus; quatro dão +20.
- Termo negativo é VETO: se casar, a contratação é descartada mesmo com score alto.
- O casamento é por palavra inteira, sem acento, e tolera plural.
- Um termo que CONTÉM outro ("laje pre-fabricada" contém "laje") não soma duas
  vezes: só o mais específico conta. Então vale ter os dois.

ABAIXO ESTÃO ${opts.amostras.length} OBJETOS REAIS de contratações abertas hoje no PNCP,
copiados literalmente. Esse é o vocabulário que os órgãos realmente usam:

${corpus}

Sua tarefa: proponha os termos de busca olhando COMO OS ÓRGÃOS ESCREVEM nesta
amostra, não como o fornecedor fala. Regras:

1. Extraia os termos do texto real acima. Se a amostra diz "vigota treliçada"
   e o fornecedor disse "laje", o termo bom é o da amostra.
2. Peso alto (40-45) só para termo específico do ramo dele, que dificilmente
   aparece em outra coisa. Peso baixo (10-25) para termo genérico.
3. Olhe a amostra procurando ARMADILHAS: objetos que contêm as palavras dele
   mas são outro negócio. Vire esses em termos negativos.
4. Nunca use como negativo uma palavra que apareça no meio de contratações
   boas. Vetar demais é pior que trazer lixo — lixo você descarta na tela,
   o vetado você nunca vê.
5. Escreva os termos SEM acento e em minúsculas.
6. Cada termo tem que fazer sentido sozinho. Nada de fragmento de frase
   ("bloco e", "de concreto para") nem palavra solta com menos de 4 letras.
   Se você não conseguiria explicar o termo para alguém, não é termo.
7. Hífen e pontuação são ignorados no casamento, então "pre-moldado" e
   "pre moldado" são o MESMO termo. Não proponha as duas formas.

Responda SOMENTE com JSON válido, sem markdown e sem texto fora do JSON:
{
  "termos_positivos": [{"termo": "vigota trelicada", "peso": 45}],
  "termos_negativos": ["palavra que indica outro ramo"],
  "raciocinio": "2 a 4 frases: que vocabulário você viu se repetir e por que escolheu esses pesos",
  "observacoes": ["algo concreto que a amostra revelou e que ele talvez não esperasse"]
}

Seja específico e conservador: 8 a 15 termos positivos, e só negativos que você
VIU causando falso positivo nesta amostra.`;

  const texto = await chamarIA({ prompt, maxTokens: 8000, esforco: "high" });
  const parsed = parseJson<SugestaoTermos>(texto);

  // A IA às vezes devolve peso como string; normalizar aqui evita quebrar o
  // scoring depois, que faz aritmética com isso.
  parsed.termos_positivos = dedupar(
    (parsed.termos_positivos ?? [])
      .map((t) => ({ termo: String(t.termo ?? "").trim(), peso: Number(t.peso) }))
      .filter((t) => util(t.termo) && Number.isFinite(t.peso))
  );
  parsed.termos_negativos = [
    ...new Set(
      (parsed.termos_negativos ?? [])
        .map((t) => normalizar(String(t)))
        .filter(util)
    ),
  ];
  parsed.observacoes = parsed.observacoes ?? [];

  return parsed;
}

/**
 * Lê a licitação contra o perfil de UM cliente e devolve go/no-go.
 *
 * Duas saídas de propósito: `resumo` é para você (operador), técnico;
 * `resumo_cliente` é o que aparece no portal, em língua de dono de empresa.
 * O cliente aprova olhando isso — se o texto for juridiquês, ele aprova sem
 * entender, e a responsabilidade de um "sim" mal-entendido volta para você.
 *
 * Roda sob demanda (botão na mesa), não na coleta: senão você paga token por
 * toda sugestão que o filtro de palavras trouxe, inclusive o lixo.
 *
 * Limite conhecido: hoje lê só os metadados do PNCP (objeto, órgão, valor).
 * A leitura do PDF do edital é a etapa 2 — até lá, `perguntas` lista o que
 * conferir no edital antes de mandar para o cliente.
 */
export async function analisarLicitacao(
  lic: LicitacaoRow,
  cliente: Pick<ClienteRow, "razao_social" | "porte" | "contexto">
): Promise<AnaliseIA> {
  const prompt = `Você é analista de licitações. Um operador disputa licitações EM NOME de empresas
clientes; o cliente só executa o contrato se ganhar. Avalie se esta licitação serve para ESTE cliente.

CLIENTE:
- Empresa: ${cliente.razao_social} (porte: ${cliente.porte})
- O que faz, como entrega, onde atua, limites:
${cliente.contexto || "(o cliente ainda não descreveu a operação — seja conservador)"}

LICITAÇÃO (PNCP):
- Modalidade: ${lic.modalidade_nome ?? "—"}${lic.srp ? " (registro de preços)" : ""}
- Modo de disputa: ${lic.modo_disputa ?? "—"}
- Objeto: ${lic.objeto ?? "—"}
- Órgão: ${lic.orgao_razao_social ?? "—"} / ${lic.unidade_nome ?? "—"}
- Local: ${lic.municipio ?? "—"}/${lic.uf ?? "—"}
- Valor estimado: ${lic.valor_estimado ?? "não informado (pode ser sigiloso)"}
- Amparo legal: ${lic.amparo_legal ?? "—"}
- Encerramento das propostas: ${lic.data_encerramento_proposta ?? "—"}

Considere: o cliente consegue ENTREGAR isso, nesse local? O valor é compatível com o porte?
${cliente.porte === "ME" || cliente.porte === "EPP" || cliente.porte === "MEI"
  ? "Ele é ME/EPP: itens de até R$ 80 mil costumam ser exclusivos para ME/EPP (LC 123), o que reduz a concorrência — mencione se for o caso."
  : ""}

Responda SOMENTE com JSON válido, sem markdown e sem texto fora do JSON:
{
  "veredito": "vale_a_pena" | "talvez" | "nao_vale",
  "resumo": "2 frases técnicas para o operador: o que o órgão quer e por que serve ou não",
  "resumo_cliente": "2 a 3 frases simples para o dono da empresa: o que teria que entregar, onde, e o porte do contrato. Sem juridiquês, sem siglas.",
  "o_que_pedem": ["item concreto que o cliente teria que entregar"],
  "riscos": ["risco real: escopo vago, valor incompatível, local distante, prazo curto, exigência técnica"],
  "perguntas": ["o que conferir no edital antes de mandar para o cliente"]
}

Seja cético. Objeto genérico demais para saber o que é? Isso é "talvez", não "vale_a_pena".`;

  const texto = await chamarIA({
    prompt,
    maxTokens: 4000,
    esforco: "medium",
    timeoutMs: 90_000,
  });

  const parsed = parseJson<Omit<AnaliseIA, "gerado_em">>(texto);
  return {
    veredito: parsed.veredito ?? "talvez",
    resumo: parsed.resumo ?? "",
    resumo_cliente: parsed.resumo_cliente ?? parsed.resumo ?? "",
    o_que_pedem: parsed.o_que_pedem ?? [],
    riscos: parsed.riscos ?? [],
    perguntas: parsed.perguntas ?? [],
    gerado_em: new Date().toISOString(),
  };
}
