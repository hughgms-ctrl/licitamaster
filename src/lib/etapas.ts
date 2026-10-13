/**
 * Regras de etapa da disputa. Sem dependência de servidor: as telas usam
 * para saber quais botões mostrar, e o servidor usa para validar — a mesma
 * tabela nos dois lados, para a tela nunca oferecer o que o servidor recusa.
 */
import type { StatusDisputa } from "./db";

/**
 * Para onde o OPERADOR pode mover uma disputa a partir de cada etapa.
 *
 * Fica fora daqui, de propósito, a decisão do cliente: só o portal move de
 * `aguardando_cliente` para `aprovada`/`recusada`, porque a aprovação tem que
 * ser dele, com piso de preço e registro de onde veio. Você não aprova em
 * nome do cliente.
 */
export const TRANSICOES_OPERADOR: Record<StatusDisputa, StatusDisputa[]> = {
  sugerida: ["descartada"], // enviar ao cliente tem ação própria (manda WhatsApp)
  descartada: ["sugerida"],
  aguardando_cliente: ["sugerida"], // cancelar o envio
  recusada: ["sugerida"],
  aprovada: ["em_preparacao", "desistiu"],
  em_preparacao: ["proposta_enviada", "desistiu"],
  proposta_enviada: ["em_disputa", "desistiu"],
  em_disputa: ["ganhou", "perdeu", "desistiu"],
  // recurso pode virar o resultado nos dois sentidos
  ganhou: ["perdeu"],
  perdeu: ["ganhou", "em_disputa"],
  desistiu: [],
};

export const ROTULO_STATUS: Record<StatusDisputa, string> = {
  sugerida: "Sugerida",
  descartada: "Descartada",
  aguardando_cliente: "Aguardando cliente",
  recusada: "Recusada pelo cliente",
  aprovada: "Aprovada",
  em_preparacao: "Em preparação",
  proposta_enviada: "Proposta enviada",
  em_disputa: "Em disputa",
  ganhou: "Ganhou",
  perdeu: "Perdeu",
  desistiu: "Desistiu",
};

/** Etapas em que a licitação está "com" um cliente (a regra de exclusividade). */
export const STATUS_EXCLUSIVOS: StatusDisputa[] = [
  "aguardando_cliente",
  "aprovada",
  "em_preparacao",
  "proposta_enviada",
  "em_disputa",
  "ganhou",
];


/** Texto exato que o cliente confirma ao aprovar. Vai para a auditoria. */
export const DECLARACAO_APROVACAO =
  "Confirmo que minha empresa consegue entregar o que esta licitação pede, no prazo e no local " +
  "indicados, e que o preço mínimo informado cobre todos os meus custos, impostos e a minha margem. " +
  "Autorizo a participação em nome da minha empresa sem lances abaixo deste valor.";
