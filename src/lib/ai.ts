import Anthropic from "@anthropic-ai/sdk";
import { textoObjetivos } from "./objetivos";
import type { AnaliseIA, ClienteRow, LicitacaoRow } from "./db";
import type { AmostraObjeto } from "./amostra";
import { normalizar, type TermoPositivo } from "./scoring";
import { clienteAnthropic, lerConfigIA } from "./config-ia";
import { IDS_TIPO, TIPOS_DOCUMENTO } from "./documentos";
import type { FichaEdital } from "./ficha";

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

  const client = clienteAnthropic(cfg.apiKey, cfg.workspaceId, { timeout: opts.timeoutMs ?? 300_000 });
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
  cliente: Pick<ClienteRow, "razao_social" | "porte" | "contexto" | "objetivos">
): Promise<AnaliseIA> {
  const objetivos = textoObjetivos(cliente.objetivos);
  const prompt = `Você é analista de licitações. Um operador disputa licitações EM NOME de empresas
clientes; o cliente só executa o contrato se ganhar. Avalie se esta licitação serve para ESTE cliente.

CLIENTE:
- Empresa: ${cliente.razao_social} (porte: ${cliente.porte})
- O que faz, como entrega, onde atua, limites:
${cliente.contexto || "(o cliente ainda não descreveu a operação — seja conservador)"}
${objetivos ? `\nOBJETIVOS DO CLIENTE (pese no veredito: capital, risco e lucro mínimo):\n${objetivos}\n` : ""}
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

/**
 * Lê o edital inteiro (PDFs do PNCP) e devolve a ficha da licitação.
 *
 * A ficha é do EDITAL, não do cliente: serve para qualquer cliente que
 * dispute. A IA é obrigada a classificar cada documento exigido com os
 * códigos do cofre (TIPOS_DOCUMENTO) — é isso que permite cruzar a exigência
 * com o que o cliente já tem, sem uma segunda leitura.
 */
export async function lerEdital(lic: LicitacaoRow, pdfs: DocumentoPDF[]): Promise<FichaEdital> {
  const tipos = TIPOS_DOCUMENTO.map((t) => `- ${t.id}: ${t.rotulo}`).join("\n");

  const prompt = `Você é analista sênior de licitações públicas no Brasil (Lei 14.133/2021 e LC 123/2006).
Os PDFs acima são os documentos desta contratação publicados no PNCP (edital, termo de referência, anexos).
Leia tudo e monte a ficha que um operador usa para decidir e preparar a participação.

DADOS DO PNCP:
- Modalidade: ${lic.modalidade_nome ?? "—"}${lic.srp ? " (registro de preços)" : ""}
- Objeto: ${lic.objeto ?? "—"}
- Órgão: ${lic.orgao_razao_social ?? "—"} — ${lic.municipio ?? "—"}/${lic.uf ?? "—"}
- Valor estimado: ${lic.valor_estimado ?? "não informado"}
- Encerramento das propostas: ${lic.data_encerramento_proposta ?? "—"}

CÓDIGOS DE DOCUMENTO (use EXATAMENTE estes em documentos_exigidos.tipo; se não houver código adequado, use "outro" e explique no detalhe):
${tipos}

Regras:
1. Use só o que está nos documentos. Se algo não aparece, use null (ou lista vazia). Nunca invente.
2. Cite a página quando souber, no fim do texto, assim: "(p. 12)".
3. Em documentos_exigidos, liste cada documento de habilitação pedido, um por item. No detalhe,
   o que o edital exige daquele documento (ex: "emitida há no máximo 90 dias", "com firma reconhecida").
4. Em exigencias_tecnicas, os atestados e qualificações técnicas COM os quantitativos mínimos exigidos.
5. Em clausulas_restritivas, só cláusulas que provavelmente restringem a competição sem justificativa
   (marca sem "ou similar", exigência técnica desproporcional, prazo inexequível, visita técnica
   obrigatória sem alternativa, índices econômicos fora do usual etc.) — base para impugnação.
6. Em riscos, o que pode fazer o cliente perder dinheiro ou ser penalizado depois de ganhar.
7. Datas e horas no formato "dd/mm/aaaa hh:mm" quando houver hora.
8. resumo: 3 a 4 frases técnicas. resumo_cliente: 2 a 3 frases simples para um dono de pequena
   empresa, sem siglas nem juridiquês: o que teria de entregar, onde, por quanto tempo.
9. Em "proposta", o que o edital exige na proposta de preços (geralmente num anexo "modelo de proposta"):
   colunas pedidas além de item, descrição, quantidade, unidade, valor unitário e total (ex: "marca",
   "fabricante", "prazo de garantia", "BDI"); as declarações que precisam constar NA PROPOSTA, com o
   texto do edital resumido em uma frase cada; e outras exigências de forma (ex: "valores com duas casas
   decimais", "assinada digitalmente", "planilha de composição de custos").

Responda SOMENTE com JSON válido, sem markdown, neste formato:
{
  "resumo": "...",
  "resumo_cliente": "...",
  "itens": [{"numero": "1", "lote": "1" | null, "descricao": "...", "quantidade": "600 horas" | null, "valor_estimado": 1234.56 | null}],
  "sessao": {"data_hora": "...", "plataforma": "Compras.gov.br | BLL | Portal de Compras Públicas | ...", "link": "...", "modo_disputa": "aberto | aberto e fechado | ...", "criterio_julgamento": "menor preço por item | ..."},
  "exclusiva_me_epp": "sim" | "nao" | "parcial" | "nao_informado",
  "prazos": {"impugnacao": "...", "esclarecimentos": "...", "entrega_execucao": "...", "vigencia": "...", "pagamento": "...", "validade_proposta": "..."},
  "documentos_exigidos": [{"tipo": "cnd_federal", "detalhe": "..."}],
  "exigencias_tecnicas": ["..."],
  "qualificacao_economica": ["..."],
  "visita_tecnica": "..." | null,
  "amostra": "..." | null,
  "garantia": "..." | null,
  "riscos": ["..."],
  "clausulas_restritivas": [{"clausula": "...", "por_que": "...", "referencia": "item 8.3 (p. 14)" | null}],
  "perguntas_esclarecimento": ["pergunta que vale mandar ao pregoeiro"],
  "penalidades": ["..."],
  "proposta": {"colunas": ["..."], "declaracoes": ["..."], "observacoes": ["..."]}
}

Em "itens", siga a ordem e a numeração do edital. "quantidade" começa pelo número seguido da unidade
("600 horas", "12 meses", "1.200 unidades"). "valor_estimado" é o valor TOTAL estimado do item
(quantidade × valor unitário), não o unitário. "numero" é o número do item no edital. "lote" é o número do
lote/grupo a que o item pertence quando o edital agrupa itens em lotes; null quando não há lotes.
Liste até 60 itens; se houver mais, os 60 primeiros.`;

  const texto = await chamarIA({
    prompt,
    pdfs,
    maxTokens: 32_000,
    esforco: "medium",
    timeoutMs: 280_000,
  });
  const f = parseJson<FichaEdital>(texto);

  const validos = new Set<string>(IDS_TIPO);
  // a IA às vezes devolve null em lista; normalizar evita quebrar a tela
  return {
    resumo: f.resumo ?? "",
    resumo_cliente: f.resumo_cliente ?? f.resumo ?? "",
    itens: Array.isArray(f.itens)
      ? f.itens.slice(0, 60).map((i) => ({
          ...i,
          numero: i.numero != null ? String(i.numero) : null,
          lote: i.lote != null && String(i.lote).trim() ? String(i.lote) : null,
        }))
      : [],
    sessao: {
      data_hora: f.sessao?.data_hora ?? null,
      plataforma: f.sessao?.plataforma ?? null,
      link: f.sessao?.link ?? null,
      modo_disputa: f.sessao?.modo_disputa ?? null,
      criterio_julgamento: f.sessao?.criterio_julgamento ?? null,
    },
    exclusiva_me_epp: ["sim", "nao", "parcial"].includes(f.exclusiva_me_epp) ? f.exclusiva_me_epp : "nao_informado",
    prazos: {
      impugnacao: f.prazos?.impugnacao ?? null,
      esclarecimentos: f.prazos?.esclarecimentos ?? null,
      entrega_execucao: f.prazos?.entrega_execucao ?? null,
      vigencia: f.prazos?.vigencia ?? null,
      pagamento: f.prazos?.pagamento ?? null,
      validade_proposta: f.prazos?.validade_proposta ?? null,
    },
    documentos_exigidos: (f.documentos_exigidos ?? []).map((d) => ({
      tipo: validos.has(d.tipo) ? d.tipo : "outro",
      detalhe: String(d.detalhe ?? ""),
    })),
    exigencias_tecnicas: f.exigencias_tecnicas ?? [],
    qualificacao_economica: f.qualificacao_economica ?? [],
    visita_tecnica: f.visita_tecnica ?? null,
    amostra: f.amostra ?? null,
    garantia: f.garantia ?? null,
    riscos: f.riscos ?? [],
    clausulas_restritivas: f.clausulas_restritivas ?? [],
    perguntas_esclarecimento: f.perguntas_esclarecimento ?? [],
    penalidades: f.penalidades ?? [],
    proposta: {
      colunas: Array.isArray(f.proposta?.colunas) ? f.proposta.colunas.slice(0, 10) : [],
      declaracoes: Array.isArray(f.proposta?.declaracoes) ? f.proposta.declaracoes.slice(0, 20) : [],
      observacoes: Array.isArray(f.proposta?.observacoes) ? f.proposta.observacoes.slice(0, 20) : [],
    },
  };
}

export interface LeituraDocumento {
  tipo: string;
  emitido_em: string | null;
  validade: string | null;
  cnpj: string | null;
  confere_cnpj: boolean | null;
  observacao: string;
}

/**
 * Lê um documento enviado ao cofre (certidão, contrato social…) e diz o que
 * ele é e até quando vale. Poupa digitação e pega o erro comum de subir a
 * certidão de outra empresa: o CNPJ do documento é conferido com o do cliente.
 */
export async function lerDocumento(pdf: DocumentoPDF, cnpjCliente: string): Promise<LeituraDocumento> {
  const tipos = TIPOS_DOCUMENTO.map((t) => `- ${t.id}: ${t.rotulo}`).join("\n");
  const prompt = `O PDF acima é um documento de habilitação de uma empresa para licitação.
Identifique o tipo, a data de emissão e a validade.

Tipos possíveis (use exatamente um destes códigos):
${tipos}

Responda SOMENTE com JSON válido, sem markdown:
{"tipo": "codigo", "emitido_em": "aaaa-mm-dd" | null, "validade": "aaaa-mm-dd" | null,
 "cnpj": "somente dígitos do CNPJ da empresa a que o documento se refere" | null,
 "observacao": "1 frase: algo que exija atenção (ex: certidão POSITIVA, documento ilegível), ou vazio"}

Validade: use a data escrita no documento ("válida até"). Se o documento não traz validade e é do tipo
que não vence (contrato social, cartão CNPJ, atestado), use null.`;

  const texto = await chamarIA({ prompt, pdfs: [pdf], maxTokens: 4000, esforco: "low", timeoutMs: 90_000 });
  const r = parseJson<Omit<LeituraDocumento, "confere_cnpj">>(texto);
  const cnpj = r.cnpj ? String(r.cnpj).replace(/\D/g, "") : null;
  const data = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  return {
    tipo: (IDS_TIPO as string[]).includes(r.tipo) ? r.tipo : "outro",
    emitido_em: data(r.emitido_em),
    validade: data(r.validade),
    cnpj,
    confere_cnpj: cnpj ? cnpj === cnpjCliente.replace(/\D/g, "") : null,
    observacao: r.observacao ?? "",
  };
}

export type TipoRecurso = "intencao" | "razoes" | "contrarrazoes";

/**
 * Rascunho de recurso administrativo (Lei 14.133/2021, art. 165). É um
 * rascunho para o operador revisar: a IA é proibida de inventar
 * jurisprudência e marca com [conferir] o que precisa de checagem.
 */
export async function redigirRecurso(opts: {
  tipo: TipoRecurso;
  fatos: string;
  empresa: string;
  orgao: string | null;
  objeto: string | null;
  modalidade: string | null;
  resumoEdital: string | null;
  exigencias: string[];
}): Promise<string> {
  const pedido = {
    intencao:
      "uma INTENÇÃO DE RECURSO: 2 a 4 frases objetivas, para colar no campo do sistema logo após o resultado, dizendo contra qual decisão e o motivo resumido.",
    razoes:
      "as RAZÕES DE RECURSO completas, com: endereçamento ao(à) pregoeiro(a)/agente de contratação, qualificação da recorrente, tempestividade, síntese dos fatos, fundamentos (cláusulas do edital e Lei 14.133/2021) e pedidos.",
    contrarrazoes:
      "as CONTRARRAZÕES ao recurso de um concorrente, defendendo a decisão que favoreceu a nossa empresa, com: endereçamento, síntese do recurso, fundamentos e pedido de manutenção da decisão.",
  }[opts.tipo];

  const prompt = `Você é advogado(a) especialista em licitações públicas no Brasil (Lei 14.133/2021).
Escreva ${pedido}

EMPRESA (nossa cliente): ${opts.empresa}
ÓRGÃO: ${opts.orgao ?? "[órgão]"}
MODALIDADE: ${opts.modalidade ?? "[modalidade]"}
OBJETO: ${opts.objeto ?? "[objeto]"}
RESUMO DO EDITAL: ${opts.resumoEdital ?? "não disponível"}
EXIGÊNCIAS DE HABILITAÇÃO E TÉCNICAS DO EDITAL:
${opts.exigencias.length ? opts.exigencias.map((e) => `- ${e}`).join("\n") : "- não disponíveis"}

O QUE ACONTECEU (relato do operador):
${opts.fatos}

Regras:
1. Use só os fatos acima. O que faltar (número do processo, datas, nomes), deixe como [completar].
2. NÃO invente jurisprudência, números de acórdão, súmulas nem artigos de que não tenha certeza. Se citar
   algo além da Lei 14.133/2021, marque com [conferir].
3. Linguagem formal e direta, sem exageros. Português do Brasil.
4. Responda só com o texto do documento, sem comentários antes ou depois.`;

  return (await chamarIA({ prompt, maxTokens: 6000, esforco: "medium", timeoutMs: 120_000 })).trim();
}
