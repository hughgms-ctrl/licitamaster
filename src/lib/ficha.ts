/** Formato da ficha do edital. Sem dependência de servidor: a tela usa. */

export interface FichaEdital {
  /** para o operador: o que é, o tamanho, o que decide a disputa */
  resumo: string;
  /** para o cliente: linguagem de dono de empresa */
  resumo_cliente: string;
  itens: { descricao: string; quantidade: string | null; valor_estimado: number | null }[];
  sessao: {
    data_hora: string | null;
    plataforma: string | null;
    link: string | null;
    modo_disputa: string | null;
    criterio_julgamento: string | null;
  };
  exclusiva_me_epp: "sim" | "nao" | "parcial" | "nao_informado";
  prazos: {
    impugnacao: string | null;
    esclarecimentos: string | null;
    entrega_execucao: string | null;
    vigencia: string | null;
    pagamento: string | null;
    validade_proposta: string | null;
  };
  /** códigos de TIPOS_DOCUMENTO + o que o edital diz de cada um */
  documentos_exigidos: { tipo: string; detalhe: string }[];
  exigencias_tecnicas: string[];
  qualificacao_economica: string[];
  visita_tecnica: string | null;
  amostra: string | null;
  garantia: string | null;
  riscos: string[];
  clausulas_restritivas: { clausula: string; por_que: string; referencia: string | null }[];
  perguntas_esclarecimento: string[];
  penalidades: string[];
}

export interface FichaRow {
  licitacao_id: string;
  ficha: FichaEdital;
  arquivos_lidos: { titulo: string; bytes: number; origem: string }[];
  versao_pncp: string | null;
  modelo: string | null;
  gerado_em: string;
}
