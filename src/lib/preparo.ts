/**
 * Preparação do cliente para disputar. Sem dependência de servidor: a mesa,
 * o portal e o servidor usam a mesma lista.
 *
 * Duas naturezas de item:
 *   - manuais: acessos e cadastros (gov.br, SICAF, procuração). Alguém marca.
 *   - documentos: saem do cofre. Ninguém marca; o arquivo e a validade decidem.
 */
import { situacaoDocumento, type DocumentoResumo } from "./documentos";

export type StatusPreparo = "pendente" | "cliente_informou" | "feito" | "nao_se_aplica";

export interface EstadoItem {
  status: StatusPreparo;
  nota?: string | null;
  em?: string;
  por?: string;
}

export type Preparo = Record<string, EstadoItem>;

export interface ItemManual {
  id: string;
  grupo: string;
  rotulo: string;
  /** quem faz: o cliente, nossa equipe ou os dois juntos */
  quem: "cliente" | "equipe" | "juntos";
  obrigatorio: boolean;
  /** para a equipe: o que conferir */
  dica: string;
  /** para o cliente, em linguagem simples. Ausente = item interno, o cliente não vê. */
  instrucao?: string;
  link?: { rotulo: string; url: string };
}

export const ITENS_MANUAIS: ItemManual[] = [
  {
    id: "govbr",
    grupo: "Acesso aos portais",
    rotulo: "Conta gov.br do sócio, nível prata ou ouro",
    quem: "cliente",
    obrigatorio: true,
    dica: "É com ela que a empresa entra no Compras.gov.br. Nível bronze não serve.",
    instrucao:
      "O sócio entra no app gov.br com o CPF e sobe a conta para prata ou ouro (pelo reconhecimento facial ou pelo login do banco). Leva uns 10 minutos.",
    link: { rotulo: "Como subir o nível da conta", url: "https://www.gov.br/governodigital/pt-br/conta-gov-br" },
  },
  {
    id: "sicaf",
    grupo: "Acesso aos portais",
    rotulo: "Cadastro da empresa no SICAF (Compras.gov.br)",
    quem: "juntos",
    obrigatorio: true,
    dica: "Credenciamento e níveis I a VI. Sem ele a empresa não participa de compras federais nem da maioria das dispensas.",
    instrucao:
      "É o cadastro de fornecedor do governo. Fazemos junto com você, por videochamada, usando a conta gov.br da empresa.",
    link: { rotulo: "Portal do fornecedor", url: "https://www.gov.br/compras/pt-br/fornecedor" },
  },
  {
    id: "representante",
    grupo: "Acesso aos portais",
    rotulo: "Procuração e representante cadastrado",
    quem: "cliente",
    obrigatorio: true,
    dica: "Procuração assinada (gov.br ou cartório) dando poderes para o operador dar lances, assinar proposta e declarações. Guardar no cofre como \"Procuração\".",
    instrucao:
      "Para darmos os lances em nome da sua empresa, precisamos de uma procuração. Ela já está pronta com os seus dados: abra, salve em PDF, assine pelo gov.br (é de graça) e envie aqui nos documentos.",
  },
  {
    id: "outros_portais",
    grupo: "Acesso aos portais",
    rotulo: "Cadastro nos portais da região (BLL, Licitanet, Portal de Compras Públicas)",
    quem: "equipe",
    obrigatorio: false,
    dica: "Muitos municípios usam portais próprios ou privados. Cadastrar conforme as licitações que aparecerem para o cliente.",
  },
  {
    id: "dados_bancarios",
    grupo: "Para a proposta",
    rotulo: "Dados bancários da empresa",
    quem: "cliente",
    obrigatorio: true,
    dica: "Banco, agência e conta em nome do CNPJ. Vão na proposta e no cadastro.",
    instrucao: "Banco, agência e conta no nome da empresa (CNPJ). É para onde o órgão paga.",
  },
  {
    id: "custos",
    grupo: "Para a proposta",
    rotulo: "Tabela de custos dos produtos ou serviços",
    quem: "cliente",
    obrigatorio: false,
    dica: "Ajuda a sugerir preço e a conferir o mínimo que o cliente informa em cada licitação.",
    instrucao:
      "Uma planilha simples com o que você vende e quanto custa para você. Com ela conseguimos dizer rápido se uma licitação dá lucro.",
  },
];

/** Documentos do cofre que toda empresa precisa ter antes de disputar. */
export const DOCUMENTOS_BASICOS: { tipo: string; obrigatorio: boolean }[] = [
  { tipo: "contrato_social", obrigatorio: true },
  { tipo: "documento_socios", obrigatorio: true },
  { tipo: "cartao_cnpj", obrigatorio: true },
  { tipo: "cnd_federal", obrigatorio: true },
  { tipo: "crf_fgts", obrigatorio: true },
  { tipo: "cndt", obrigatorio: true },
  { tipo: "cnd_estadual", obrigatorio: true },
  { tipo: "cnd_municipal", obrigatorio: true },
  { tipo: "certidao_falencia", obrigatorio: true },
  { tipo: "balanco", obrigatorio: false },
  { tipo: "atestado_capacidade", obrigatorio: false },
];

export type SituacaoDoc = "ok" | "vence_logo" | "vencido" | "falta";

export function situacaoDocBasico(tipo: string, docs: DocumentoResumo[]): { situacao: SituacaoDoc; doc?: DocumentoResumo } {
  const doc = docs.find((d) => d.tipo === tipo); // a lista vem do mais recente para o mais antigo
  if (!doc) return { situacao: "falta" };
  const s = situacaoDocumento(doc.validade);
  if (s === "vencido") return { situacao: "vencido", doc };
  if (s === "vence_logo") return { situacao: "vence_logo", doc };
  return { situacao: "ok", doc };
}

export function estadoItem(preparo: Preparo | null | undefined, id: string): EstadoItem {
  return preparo?.[id] ?? { status: "pendente" };
}

/** Quantos itens obrigatórios estão resolvidos, contando manuais e documentos. */
export function progressoPreparo(preparo: Preparo | null | undefined, docs: DocumentoResumo[]) {
  let total = 0;
  let prontos = 0;
  let aConferir = 0;
  for (const it of ITENS_MANUAIS) {
    if (!it.obrigatorio) continue;
    total++;
    const s = estadoItem(preparo, it.id).status;
    if (s === "feito" || s === "nao_se_aplica") prontos++;
    if (s === "cliente_informou") aConferir++;
  }
  for (const d of DOCUMENTOS_BASICOS) {
    if (!d.obrigatorio) continue;
    total++;
    const s = situacaoDocBasico(d.tipo, docs).situacao;
    if (s === "ok" || s === "vence_logo") prontos++;
  }
  return { total, prontos, aConferir, pronto: prontos === total };
}

export const ROTULO_STATUS_PREPARO: Record<StatusPreparo, string> = {
  pendente: "Pendente",
  cliente_informou: "Cliente diz que fez",
  feito: "Feito",
  nao_se_aplica: "Não se aplica",
};
