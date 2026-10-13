import { db } from "./db";
import { alertarOperador, type AlertaOperador } from "./notify";
import { limparObjeto } from "./formato";

/**
 * Resumo das sugestões novas, mandado no WhatsApp do operador em horários
 * fixos (8h, 13h e 18h, nos dias úteis) em vez de um aviso por coleta.
 *
 * Entra o que: ainda está na triagem, nunca foi avisado, passou do score de
 * alerta do perfil e ainda está com prazo aberto. Só marca como avisado se a
 * mensagem saiu — com o WhatsApp fora do ar, o próximo resumo leva tudo.
 */
export async function enviarResumo(): Promise<{ avisadas: number; motivo?: string }> {
  const supabase = db();
  const { data, error } = await supabase
    .from("disputas")
    .select(
      "id, cliente_id, score, status, perfil:perfis(score_alerta), cliente:clientes(razao_social, nome_fantasia), licitacao:licitacoes!inner(objeto, municipio, uf, valor_estimado, modalidade_nome, data_encerramento_proposta, link_pncp, link_sistema_origem)"
    )
    .eq("status", "sugerida")
    .is("notificado_em", null)
    .gte("licitacao.data_encerramento_proposta", new Date().toISOString())
    .order("score", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  type Linha = {
    id: string;
    cliente_id: string;
    score: number;
    status: string;
    perfil: { score_alerta: number } | null;
    cliente: { razao_social: string; nome_fantasia: string | null } | null;
    licitacao: {
      objeto: string | null;
      municipio: string | null;
      uf: string | null;
      valor_estimado: number | null;
      modalidade_nome: string | null;
      data_encerramento_proposta: string | null;
      link_pncp: string | null;
      link_sistema_origem: string | null;
    };
  };

  const linhas = ((data ?? []) as unknown as Linha[]).filter((d) => d.score >= (d.perfil?.score_alerta ?? 60));
  if (linhas.length === 0) return { avisadas: 0, motivo: "nada novo acima do score de alerta" };

  const alertas: AlertaOperador[] = linhas.map((d) => ({
    disputaId: d.id,
    clienteId: d.cliente_id,
    cliente: d.cliente?.nome_fantasia || d.cliente?.razao_social || "—",
    score: d.score,
    objeto: limparObjeto(d.licitacao.objeto),
    municipio: d.licitacao.municipio,
    uf: d.licitacao.uf,
    valor: d.licitacao.valor_estimado,
    modalidade: d.licitacao.modalidade_nome,
    encerramento: d.licitacao.data_encerramento_proposta,
    link: d.licitacao.link_pncp ?? d.licitacao.link_sistema_origem,
    retificado: false,
    status: d.status,
  }));

  const enviou = await alertarOperador(alertas);
  if (!enviou) return { avisadas: 0, motivo: "WhatsApp não configurado ou fora do ar" };

  await supabase
    .from("disputas")
    .update({ notificado_em: new Date().toISOString() })
    .in(
      "id",
      linhas.map((l) => l.id)
    );
  return { avisadas: linhas.length };
}
