/**
 * Filtros de partida, por tipo de serviço.
 *
 * O PNCP não manda categoria nenhuma no endpoint de dispensas — só o texto
 * livre de `objetoCompra`. Então "tipo de serviço" aqui é um filtro salvo:
 * um conjunto de termos que caracteriza aquele tipo de contratação.
 *
 * São ponto de partida, não verdade. Ligue, desligue e ajuste os pesos
 * olhando o que cai no radar na primeira semana.
 */

import type { TermoPositivo } from "./scoring";

/**
 * Vetos que valem para qualquer tipo. Cada um destes entrou no radar com
 * score >= 25 na primeira varredura real de 3.710 dispensas.
 *
 * Repare no que NÃO está aqui: `treinamento`, `capacitacao` e `curso`.
 * Contrato municipal de software quase sempre embute capacitação de servidor
 * no objeto — vetar essas palavras derruba justamente os contratos completos,
 * que são os melhores. Medido: matava 9, incluindo os 3 melhores da varredura.
 */
export const NEGATIVOS_COMUNS = [
  "medicamento", "genero alimenticio", "merenda", "combustivel", "pneu",
  "pavimentacao", "obra de engenharia", "reforma predial", "material de limpeza",
  "material hospitalar", "veiculo automotor", "mobiliario", "uniforme",
  "cesta basica", "locacao de impressora", "outsourcing de impressao",
  "coleta de residuo", "servico funerario", "material de construcao",
  "refrigeracao", "ar condicionado", "climatizacao", "radiocomunicacao",
  "telefonia", "pabx", "cftv", "videomonitoramento", "alarme",
  "combate a incendio", "microsoft 365", "office 365", "windows", "antivirus",
  "capcut", "adobe", "autocad", "hotel", "diaria de hospedagem",
  // produção de evento: "hospedagem" no meio de "camarins, hospedagem e
  // transporte de equipes" é alojamento de artista, não servidor
  "camarim", "sonorizacao", "palco", "atracao artistica", "buffet",
  "locacao de tenda", "banda musical",
];

export interface FiltroPronto {
  nome: string;
  descricao: string;
  termos_positivos: TermoPositivo[];
  /** somados aos NEGATIVOS_COMUNS */
  negativos_extras?: string[];
  valor_min: number | null;
  valor_max: number | null;
  score_minimo: number;
  score_alerta: number;
}

export const FILTROS_PRONTOS: FiltroPronto[] = [
  {
    nome: "Sistemas de gestão",
    descricao:
      "Software de gestão sob medida ou licenciado: o contrato mais valioso e o mais disputado.",
    termos_positivos: [
      { termo: "desenvolvimento de sistema", peso: 45 },
      { termo: "desenvolvimento de software", peso: 45 },
      { termo: "fabrica de software", peso: 45 },
      { termo: "sistema de gestao", peso: 40 },
      { termo: "sistema informatizado", peso: 40 },
      { termo: "software de gestao", peso: 40 },
      { termo: "sistema web", peso: 35 },
      { termo: "plataforma web", peso: 35 },
      { termo: "licenca de uso de software", peso: 30 },
      { termo: "licenciamento de software", peso: 30 },
      { termo: "modulo de gestao", peso: 30 },
      { termo: "banco de dados", peso: 20 },
    ],
    // relógio de ponto e rastreamento casam "software de gestão" mas são
    // fornecimento de equipamento com software junto, não desenvolvimento
    negativos_extras: ["relogio de ponto", "rastreamento veicular", "gestao de frota", "biometria"],
    valor_min: 1000,
    valor_max: null,
    score_minimo: 25,
    score_alerta: 60,
  },
  {
    nome: "Sites institucionais",
    descricao: "Criação, reformulação e manutenção de site e portal de órgão público.",
    termos_positivos: [
      { termo: "desenvolvimento de site", peso: 45 },
      { termo: "site institucional", peso: 45 },
      { termo: "reformulacao de site", peso: 40 },
      { termo: "sitio eletronico", peso: 40 },
      { termo: "portal web", peso: 35 },
      { termo: "website", peso: 35 },
      { termo: "portal da transparencia", peso: 35 },
      { termo: "diario oficial eletronico", peso: 30 },
      { termo: "acessibilidade digital", peso: 25 },
      { termo: "hospedagem", peso: 25 },
    ],
    valor_min: 1000,
    valor_max: null,
    score_minimo: 25,
    score_alerta: 55,
  },
  {
    nome: "Automação e WhatsApp",
    descricao: "Chatbot, atendimento automatizado e integração entre sistemas.",
    termos_positivos: [
      { termo: "chatbot", peso: 45 },
      { termo: "atendimento automatizado", peso: 40 },
      { termo: "whatsapp", peso: 40 },
      { termo: "assistente virtual", peso: 40 },
      { termo: "integracao de sistema", peso: 35 },
      { termo: "automacao de processo", peso: 35 },
      { termo: "automacao", peso: 25 },
      { termo: "api", peso: 15 },
    ],
    // "automação" sozinha puxa muita coisa predial e industrial
    negativos_extras: ["automacao predial", "automacao industrial", "portao automatico"],
    valor_min: 1000,
    valor_max: null,
    score_minimo: 25,
    score_alerta: 50,
  },
  {
    nome: "Manutenção e suporte de software",
    descricao: "Sustentação e evolução de sistema que já existe. Contrato recorrente.",
    termos_positivos: [
      { termo: "manutencao de software", peso: 45 },
      { termo: "manutencao de sistema de informacao", peso: 45 },
      { termo: "sustentacao de sistema", peso: 40 },
      { termo: "evolucao de sistema", peso: 40 },
      { termo: "suporte tecnico em software", peso: 35 },
      { termo: "servicos de tecnologia da informacao", peso: 30 },
      { termo: "atualizacao de sistema", peso: 30 },
    ],
    // o termo curto "manutenção de sistema" casava ar-condicionado e
    // radiocomunicação; por isso aqui só entra a forma longa
    negativos_extras: ["sistema de refrigeracao", "sistema eletrico", "sistema hidraulico"],
    valor_min: 1000,
    valor_max: null,
    score_minimo: 25,
    score_alerta: 60,
  },
  {
    nome: "Hospedagem e infraestrutura",
    descricao: "Hospedagem, e-mail corporativo, domínio e nuvem. Ticket menor, mas recorrente.",
    termos_positivos: [
      { termo: "hospedagem de site", peso: 45 },
      { termo: "hospedagem", peso: 40 },
      { termo: "correio eletronico corporativo", peso: 35 },
      { termo: "servidor em nuvem", peso: 35 },
      { termo: "certificado ssl", peso: 30 },
      { termo: "registro de dominio", peso: 30 },
      { termo: "computacao em nuvem", peso: 30 },
      { termo: "backup em nuvem", peso: 25 },
    ],
    // hospedagem em hotel já apareceu na varredura real
    negativos_extras: ["hospedagem em hotel", "diaria", "hotelaria"],
    valor_min: 500,
    valor_max: null,
    score_minimo: 25,
    score_alerta: 55,
  },
];

/** Monta o registro pronto para gravar na tabela `perfis`. */
export function materializar(f: FiltroPronto) {
  return {
    nome: f.nome,
    ativo: true,
    termos_positivos: f.termos_positivos,
    termos_negativos: [...NEGATIVOS_COMUNS, ...(f.negativos_extras ?? [])],
    ufs: [] as string[],
    valor_min: f.valor_min,
    valor_max: f.valor_max,
    score_minimo: f.score_minimo,
    score_alerta: f.score_alerta,
  };
}
