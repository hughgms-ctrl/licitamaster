import type { StatusDisputa } from "@/lib/db";
import type { Tom } from "./ui/status-dot";

/** Cor do ponto de estado de cada etapa da disputa. */
export const TOM_STATUS: Record<StatusDisputa, Tom> = {
  sugerida: "neutro",
  descartada: "neutro",
  aguardando_cliente: "info",
  recusada: "perigo",
  aprovada: "primario",
  em_preparacao: "primario",
  proposta_enviada: "info",
  em_disputa: "alerta",
  ganhou: "sucesso",
  perdeu: "perigo",
  desistiu: "neutro",
};
