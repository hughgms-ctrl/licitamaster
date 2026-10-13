import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service_role. Só pode ser importado em código de servidor
 * (route handlers, server components, server actions). Nunca em "use client".
 */
export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type Porte = "MEI" | "ME" | "EPP" | "demais";

export interface ClienteRow {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  porte: Porte;
  contato_nome: string | null;
  whatsapp: string | null;
  email: string | null;
  contexto: string;
  ativo: boolean;
  token_portal: string;
  /** situação dos itens de preparação (src/lib/preparo.ts) */
  preparo: import("./preparo").Preparo;
  created_at: string;
}

export interface LicitacaoRow {
  numero_controle_pncp: string;
  modalidade_id: number | null;
  modalidade_nome: string | null;
  objeto: string | null;
  processo: string | null;
  orgao_cnpj: string | null;
  orgao_razao_social: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio: string | null;
  codigo_ibge: string | null;
  valor_estimado: number | null;
  srp: boolean | null;
  situacao: string | null;
  amparo_legal: string | null;
  modo_disputa: string | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  data_publicacao_pncp: string | null;
  data_atualizacao_pncp: string | null;
  link_sistema_origem: string | null;
  link_pncp: string | null;
  raw: unknown;
  revisoes: number;
  primeira_coleta: string;
  ultima_coleta: string;
}

export const STATUS_DISPUTA = [
  "sugerida",
  "descartada",
  "aguardando_cliente",
  "recusada",
  "aprovada",
  "em_preparacao",
  "proposta_enviada",
  "em_disputa",
  "ganhou",
  "perdeu",
  "desistiu",
] as const;
export type StatusDisputa = (typeof STATUS_DISPUTA)[number];

export interface DisputaRow {
  id: string;
  licitacao_id: string;
  cliente_id: string;
  perfil_id: string | null;
  score: number;
  termos_encontrados: string[];
  status: StatusDisputa;
  analise_ia: AnaliseIA | null;
  preco_minimo: number | null;
  motivo_recusa: string | null;
  notas_cliente: string | null;
  notas_operador: string | null;
  /** passos do guia da disputa já cumpridos (src/lib/guia.ts) */
  guia?: import("./guia").GuiaMarcado;
  enviado_cliente_em: string | null;
  respondido_em: string | null;
  notificado_em: string | null;
  created_at: string;
  updated_at: string;
}

/** Disputa com a licitação e o cliente embutidos, como as telas usam. */
export interface DisputaCompleta extends DisputaRow {
  licitacao: LicitacaoRow;
  cliente: Pick<ClienteRow, "id" | "razao_social" | "nome_fantasia" | "porte">;
}

export interface AnaliseIA {
  veredito: "vale_a_pena" | "talvez" | "nao_vale";
  /** para você: o que o órgão quer, em 2 frases */
  resumo: string;
  /** para o cliente: linguagem de dono de empresa, sem juridiquês */
  resumo_cliente: string;
  o_que_pedem: string[];
  riscos: string[];
  perguntas: string[];
  gerado_em: string;
}

/** Select padrão de disputa com as relações. */
export const SELECT_DISPUTA_COMPLETA =
  "*, licitacao:licitacoes(*), cliente:clientes(id, razao_social, nome_fantasia, porte)";
