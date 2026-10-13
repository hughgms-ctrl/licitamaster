/**
 * Documentos de habilitação: os tipos que o cofre conhece e as regras de
 * validade. Sem dependência de servidor — a tela e o servidor usam a mesma
 * lista, e a IA da ficha do edital é obrigada a responder com estes códigos,
 * o que permite cruzar "o que o edital pede" com "o que o cliente tem".
 */

export const TIPOS_DOCUMENTO = [
  // habilitação jurídica
  { id: "contrato_social", rotulo: "Contrato social e alterações", grupo: "Jurídica", vence: false },
  { id: "documento_socios", rotulo: "Documento dos sócios", grupo: "Jurídica", vence: false },
  { id: "procuracao", rotulo: "Procuração", grupo: "Jurídica", vence: true },
  // fiscal, social e trabalhista
  { id: "cartao_cnpj", rotulo: "Cartão CNPJ", grupo: "Fiscal e trabalhista", vence: false },
  { id: "cnd_federal", rotulo: "CND Federal (Receita e PGFN)", grupo: "Fiscal e trabalhista", vence: true },
  { id: "crf_fgts", rotulo: "Certificado de regularidade do FGTS", grupo: "Fiscal e trabalhista", vence: true },
  { id: "cndt", rotulo: "CNDT (débitos trabalhistas)", grupo: "Fiscal e trabalhista", vence: true },
  { id: "cnd_estadual", rotulo: "CND Estadual", grupo: "Fiscal e trabalhista", vence: true },
  { id: "cnd_municipal", rotulo: "CND Municipal", grupo: "Fiscal e trabalhista", vence: true },
  { id: "inscricao_estadual", rotulo: "Inscrição estadual", grupo: "Fiscal e trabalhista", vence: false },
  { id: "inscricao_municipal", rotulo: "Inscrição municipal / alvará", grupo: "Fiscal e trabalhista", vence: true },
  // econômico-financeira
  { id: "certidao_falencia", rotulo: "Certidão negativa de falência", grupo: "Econômico-financeira", vence: true },
  { id: "balanco", rotulo: "Balanço patrimonial", grupo: "Econômico-financeira", vence: true },
  // técnica
  { id: "atestado_capacidade", rotulo: "Atestado de capacidade técnica", grupo: "Técnica", vence: false },
  { id: "registro_conselho", rotulo: "Registro em conselho (CREA, CRA…)", grupo: "Técnica", vence: true },
  { id: "certidao_acervo", rotulo: "Certidão de acervo técnico (CAT)", grupo: "Técnica", vence: false },
  // cadastro e outros
  { id: "sicaf", rotulo: "Cadastro SICAF", grupo: "Cadastro", vence: true },
  { id: "declaracao_me_epp", rotulo: "Comprovação de ME/EPP", grupo: "Cadastro", vence: true },
  { id: "outro", rotulo: "Outro documento", grupo: "Cadastro", vence: true },
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]["id"];
export const IDS_TIPO = TIPOS_DOCUMENTO.map((t) => t.id) as TipoDocumento[];

export function rotuloTipo(id: string): string {
  return TIPOS_DOCUMENTO.find((t) => t.id === id)?.rotulo ?? id;
}

/** Quantos dias antes de vencer o documento passa a "vence em breve". */
export const DIAS_AVISO = 15;

export type SituacaoDocumento = "valido" | "vence_logo" | "vencido" | "sem_validade";

export function situacaoDocumento(validade: string | null, hoje = new Date()): SituacaoDocumento {
  if (!validade) return "sem_validade";
  const fim = new Date(`${validade}T23:59:59-03:00`).getTime();
  const dias = (fim - hoje.getTime()) / 864e5;
  if (dias < 0) return "vencido";
  if (dias <= DIAS_AVISO) return "vence_logo";
  return "valido";
}

export interface DocumentoResumo {
  id: string;
  tipo: string;
  descricao: string | null;
  nome_arquivo: string;
  validade: string | null;
  emitido_em: string | null;
  enviado_por: "operador" | "cliente";
  created_at: string;
}

export interface ItemChecklist {
  tipo: string;
  rotulo: string;
  /** o que o edital diz sobre este documento */
  detalhe: string;
  situacao: "ok" | "vence_logo" | "vencido" | "falta";
  /** validade do melhor documento do cofre para este tipo */
  validade: string | null;
}

/**
 * Cruza o que o edital exige com o cofre do cliente. Para cada exigência,
 * pega o documento do tipo com a validade mais longa. "Vence logo" usa a
 * data da sessão quando existe: uma certidão que vence antes da disputa é
 * tão ruim quanto uma vencida.
 */
export function checklistHabilitacao(
  exigidos: { tipo: string; detalhe: string }[],
  cofre: DocumentoResumo[],
  dataSessao: string | null
): ItemChecklist[] {
  const referencia = dataSessao ? new Date(dataSessao) : new Date();
  return exigidos.map((e) => {
    const candidatos = cofre.filter((d) => d.tipo === e.tipo);
    if (candidatos.length === 0) {
      return { tipo: e.tipo, rotulo: rotuloTipo(e.tipo), detalhe: e.detalhe, situacao: "falta", validade: null };
    }
    const melhor = candidatos.sort((a, b) => (b.validade ?? "9999") .localeCompare(a.validade ?? "9999"))[0];
    const s = situacaoDocumento(melhor.validade, referencia);
    return {
      tipo: e.tipo,
      rotulo: rotuloTipo(e.tipo),
      detalhe: e.detalhe,
      situacao: s === "vencido" ? "vencido" : s === "vence_logo" ? "vence_logo" : "ok",
      validade: melhor.validade,
    };
  });
}
