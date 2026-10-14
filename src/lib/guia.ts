/**
 * Guia da disputa: o roteiro que o operador segue em cada licitação, da
 * aprovação do cliente à assinatura do contrato. Sem dependência de servidor —
 * a página do guia e o roteiro dentro da mesa usam a mesma lista.
 *
 * Escrito para o pregão eletrônico e a dispensa eletrônica no Compras.gov.br
 * (Lei 14.133/2021), que é onde a maioria das disputas acontece. Prazos e
 * regras variam de edital para edital: quando o texto diz "confira no edital",
 * é porque varia mesmo.
 */
import type { StatusDisputa } from "./db";

export interface Passo {
  id: string;
  titulo: string;
  /** o que fazer e por quê, em linguagem simples */
  detalhe: string;
  /** erro comum que desclassifica ou dá multa */
  cuidado?: string;
}

export interface Fase {
  id: string;
  titulo: string;
  /** em que etapa da disputa esta fase é a atual */
  etapas: StatusDisputa[];
  resumo: string;
  passos: Passo[];
}

export const FASES: Fase[] = [
  {
    id: "antes",
    titulo: "Antes da sessão",
    etapas: ["aprovada", "em_preparacao"],
    resumo:
      "O cliente viu as exigências do edital, aprovou e deu o preço mínimo. Agora é conferir a ficha, deixar os documentos em dia e cadastrar a proposta no sistema antes do horário de abertura.",
    passos: [
      {
        id: "ler_edital",
        titulo: "Conferir a ficha do edital",
        detalhe:
          "A IA leu o edital antes de você enviar ao cliente (\"Ficha do edital\" na mesa). Confira data e hora da sessão, plataforma, modo de disputa, documentos exigidos, prazo de entrega e se é exclusiva para ME/EPP. Se o edital foi retificado depois, leia de novo.",
        cuidado: "Leia também o Termo de Referência: é lá que ficam as exigências do produto ou serviço.",
      },
      {
        id: "duvidas",
        titulo: "Tirar dúvidas ou impugnar, se precisar",
        detalhe:
          "Pedidos de esclarecimento e impugnação vão por escrito ao órgão, em geral até 3 dias úteis antes da abertura. A ficha traz as cláusulas que podem ser contestadas e perguntas prontas.",
        cuidado: "Depois do prazo, não adianta reclamar: vale o que está escrito.",
      },
      {
        id: "documentos",
        titulo: "Conferir a habilitação no cofre",
        detalhe:
          "A ficha cruza o que o edital pede com o cofre do cliente. Todas as certidões precisam valer na data da sessão e, de preferência, alguns dias depois.",
        cuidado: "Certidão vencida é o motivo número um de perder uma disputa já ganha no preço.",
      },
      {
        id: "preco",
        titulo: "Definir a estratégia de preço",
        detalhe:
          "Proposta inicial um pouco abaixo do valor estimado, e o piso do cliente como limite dos lances. Anote quanto vai baixar por lance (ex: 0,5% a 1%).",
        cuidado: "Nunca dê lance abaixo do preço mínimo do cliente. Ganhar com prejuízo vira contrato que ele não consegue cumprir.",
      },
      {
        id: "cadastrar",
        titulo: "Cadastrar a proposta no sistema",
        detalhe:
          "No Compras.gov.br, entre como representante da empresa, encontre a licitação e cadastre o valor de cada item, a marca e o modelo (se pedir) e as declarações exigidas. Isso precisa estar feito antes do horário de abertura.",
        cuidado: "Não coloque o nome da empresa na descrição da proposta: identificar o licitante antes da hora desclassifica.",
      },
      {
        id: "lembrete",
        titulo: "Avisar o cliente e marcar na agenda",
        detalhe:
          "Mande ao cliente data e hora da sessão e peça que fique por perto do telefone. Coloque um alarme 30 minutos antes.",
      },
    ],
  },
  {
    id: "lances",
    titulo: "Durante a sessão (lances)",
    etapas: ["proposta_enviada", "em_disputa"],
    resumo:
      "O pregoeiro abre a sessão, analisa as propostas e começa a fase de lances. É a parte que você já conhece: só que com o piso do cliente sempre à vista.",
    passos: [
      {
        id: "entrar_cedo",
        titulo: "Entrar 15 minutos antes",
        detalhe:
          "Abra a sala da disputa e o chat do pregoeiro. Confira se a proposta foi aceita para a fase de lances.",
      },
      {
        id: "modo",
        titulo: "Saber o modo de disputa",
        detalhe:
          "Aberto: lances livres e, se alguém der lance nos últimos minutos, o tempo se prorroga. Aberto e fechado: depois da fase aberta, os melhores colocados dão um último lance fechado. A ficha diz qual é; os tempos exatos estão no edital.",
      },
      {
        id: "lances",
        titulo: "Dar os lances respeitando o piso",
        detalhe:
          "Baixe aos poucos. Se o preço chegar no mínimo do cliente, pare: perder essa é melhor do que ganhar no prejuízo.",
        cuidado: "Confira o valor antes de enviar. Lance com zero a mais ou a menos vale do mesmo jeito.",
      },
      {
        id: "me_epp",
        titulo: "Usar o direito de ME/EPP, se houver",
        detalhe:
          "Se o cliente é ME ou EPP e ficou até 5% acima de uma empresa grande no pregão, o sistema dá a chance de cobrir a oferta. Fique atento ao aviso: o tempo é curto.",
      },
      {
        id: "chat",
        titulo: "Acompanhar o chat do pregoeiro",
        detalhe:
          "O pregoeiro pode negociar um preço menor ou pedir documentos pelo chat. Responda dentro do prazo que ele der.",
        cuidado: "Sumir do chat depois de arrematar pode levar à desclassificação.",
      },
    ],
  },
  {
    id: "habilitacao",
    titulo: "Depois dos lances (aceitação e habilitação)",
    etapas: ["em_disputa"],
    resumo:
      "Ficou em primeiro? Agora o pregoeiro confere a proposta e os documentos. É onde mais se perde disputa ganha.",
    passos: [
      {
        id: "proposta_ajustada",
        titulo: "Enviar a proposta ajustada ao valor final",
        detalhe:
          "O pregoeiro pede a proposta com o valor do último lance, item por item, no modelo do edital. Prazo comum: poucas horas. Use \"Proposta ajustada\" na mesa: ela distribui o lance entre os itens, escreve o valor por extenso e sai pronta para salvar em PDF. Confira com o modelo do edital.",
        cuidado: "Valor unitário vezes quantidade tem que bater com o total. Erro de conta é motivo de recusa.",
      },
      {
        id: "anexar_docs",
        titulo: "Anexar os documentos de habilitação",
        detalhe:
          "Baixe do cofre o que o edital pede e anexe no sistema quando o pregoeiro convocar. Atestados técnicos precisam ser compatíveis com o objeto.",
      },
      {
        id: "diligencia",
        titulo: "Responder diligências",
        detalhe:
          "Se o pregoeiro pedir esclarecimento sobre um documento ou sobre o preço (por exemplo, se achar que está baixo demais), responda com calma e prova: planilha de custos, nota fiscal de compra, contrato anterior.",
      },
      {
        id: "resultado",
        titulo: "Registrar os lances e o resultado na mesa",
        detalhe:
          "Em \"Registrar lances\", anote o último lance do cliente, quem ganhou e por quanto, e os lances finais dos concorrentes. Depois marque \"Ganhou\" ou \"Perdeu\". Se foi desclassificado, escreva o motivo na observação.",
      },
    ],
  },
  {
    id: "recursos",
    titulo: "Recursos",
    etapas: ["em_disputa", "ganhou", "perdeu"],
    resumo:
      "Depois do resultado, quem discorda pode recorrer. Isso vale para o seu cliente e para os concorrentes dele.",
    passos: [
      {
        id: "intencao",
        titulo: "Manifestar intenção de recurso, se fizer sentido",
        detalhe:
          "Logo após o resultado, o sistema abre um prazo curto para quem quiser recorrer avisar a intenção, com um motivo resumido. Sem isso, perde-se o direito. Use só com motivo real (ex: o vencedor não cumpriu algo do edital).",
      },
      {
        id: "razoes",
        titulo: "Enviar as razões ou as contrarrazões",
        detalhe:
          "Quem manifestou a intenção tem 3 dias úteis para mandar as razões. Se um concorrente recorrer contra o seu cliente, você pode responder (contrarrazões) no mesmo prazo depois dele.",
        cuidado: "Recurso é texto jurídico. Nos primeiros, peça ajuda a quem já fez.",
      },
    ],
  },
  {
    id: "contrato",
    titulo: "Ganhou: contrato e entrega",
    etapas: ["ganhou"],
    resumo:
      "O órgão confirma o resultado (adjudicação e homologação) e chama a empresa para assinar. A partir daí começa a entrega, e com ela o pagamento.",
    passos: [
      {
        id: "assinar",
        titulo: "Assinar o contrato ou a ata no prazo",
        detalhe:
          "O órgão manda o contrato (ou a ata de registro de preços) para assinatura, geralmente pelo gov.br. Avise o cliente e acompanhe o prazo.",
        cuidado: "Não assinar no prazo pode gerar multa e impedimento de licitar.",
      },
      {
        id: "garantia",
        titulo: "Prestar garantia, se o edital pedir",
        detalhe: "Alguns contratos exigem garantia (seguro-garantia, caução ou fiança) antes de começar. A ficha diz se tem.",
      },
      {
        id: "empenho",
        titulo: "Esperar o empenho antes de entregar",
        detalhe:
          "Empenho é a reserva do dinheiro pelo órgão. Sem nota de empenho (ou ordem de fornecimento), não entregue: é a garantia de que vai receber.",
      },
      {
        id: "entrega",
        titulo: "Entregar, emitir a nota e acompanhar o pagamento",
        detalhe:
          "Entregue no prazo e no local do edital, emita a nota fiscal com os dados do empenho e acompanhe o pagamento. O prazo de pagamento está no edital.",
      },
    ],
  },
];

export const TOTAL_PASSOS = FASES.reduce((n, f) => n + f.passos.length, 0);

/** A fase em que a disputa está agora, para o roteiro abrir no lugar certo. */
export function faseAtual(status: StatusDisputa): string {
  if (status === "ganhou") return "contrato";
  if (status === "perdeu") return "recursos";
  return FASES.find((f) => f.etapas.includes(status))?.id ?? "antes";
}

/** Etapas em que o roteiro aparece na mesa. */
export const ETAPAS_COM_GUIA: StatusDisputa[] = ["aprovada", "em_preparacao", "proposta_enviada", "em_disputa", "ganhou"];

/** Passos marcados: { "<fase>.<passo>": "<iso de quando marcou>" } */
export type GuiaMarcado = Record<string, string>;

export const GLOSSARIO: { termo: string; significado: string }[] = [
  { termo: "Edital", significado: "O documento com todas as regras da licitação: o que o órgão quer comprar, prazos, documentos e critérios." },
  { termo: "Termo de Referência", significado: "Anexo do edital que descreve em detalhe o produto ou serviço, quantidades e como deve ser entregue." },
  { termo: "Pregão eletrônico", significado: "A modalidade mais comum para comprar bens e serviços comuns. Vence o menor preço, com lances pela internet." },
  { termo: "Dispensa eletrônica", significado: "Compra de valor pequeno sem licitação completa. Mais rápida e com menos exigências: ótima para começar." },
  { termo: "Valor estimado", significado: "Quanto o órgão acha que vai pagar. Propostas acima dele costumam ser recusadas." },
  { termo: "Habilitação", significado: "A conferência de que a empresa está regular: documentos jurídicos, certidões fiscais, saúde financeira e capacidade técnica." },
  { termo: "Certidão negativa (CND)", significado: "Documento que prova que a empresa não tem dívidas com um órgão (Receita, FGTS, Justiça do Trabalho, estado, município). Vence." },
  { termo: "SICAF", significado: "O cadastro de fornecedores do governo federal. Guarda os dados e certidões da empresa." },
  { termo: "ME/EPP", significado: "Microempresa e empresa de pequeno porte. Têm vantagens por lei: licitações exclusivas até certo valor e direito de cobrir a oferta de empresa grande quando ficam perto." },
  { termo: "Arrematante", significado: "Quem ficou em primeiro na fase de lances. Ainda não ganhou: falta ter a proposta aceita e ser habilitado." },
  { termo: "Diligência", significado: "Pedido do pregoeiro para esclarecer ou comprovar algo da proposta ou dos documentos." },
  { termo: "Impugnação", significado: "Contestar uma regra do edital antes da sessão, por achar que é ilegal ou restringe a concorrência." },
  { termo: "Recurso", significado: "Contestar o resultado depois da sessão." },
  { termo: "Adjudicação e homologação", significado: "O órgão confirma oficialmente quem venceu e que o processo foi regular. Depois disso vem o contrato." },
  { termo: "Ata de registro de preços", significado: "Um acordo em que a empresa se compromete a fornecer por aquele preço durante um período (geralmente 1 ano), e o órgão compra conforme precisar. Não garante que vai comprar tudo." },
  { termo: "Empenho", significado: "Reserva do dinheiro no orçamento do órgão para pagar aquela compra. Só entregue com empenho em mãos." },
];
