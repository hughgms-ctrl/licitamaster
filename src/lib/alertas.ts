import { db, type ClienteRow, type DisputaCompleta } from "./db";
import { SELECT_DISPUTA_COMPLETA } from "./db";
import { enviarWhatsApp } from "./notify";
import { urlPortal } from "./disputas";
import { checklistHabilitacao, pendenciasHabilitacao, rotuloTipo, situacaoDocumento, TIPOS_DOCUMENTO, type DocumentoResumo } from "./documentos";
import { dataDaSessao, type FichaRow } from "./ficha";
import { limparObjeto } from "./formato";

/**
 * Alertas diários, sem repetir:
 *   - ao CLIENTE: certidão do cofre vencida ou vencendo (15 dias);
 *   - ao OPERADOR: sessões nas próximas 36h e documentos que tiram da disputa
 *     um cliente que já aprovou a licitação.
 * Um aviso só é marcado como enviado se a mensagem saiu.
 */

const ETAPAS_ATIVAS = ["aprovada", "em_preparacao", "proposta_enviada", "em_disputa"];
const VENCEM = new Set<string>(TIPOS_DOCUMENTO.filter((t) => t.vence).map((t) => t.id));

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export interface ResultadoAlertas {
  clientesAvisados: number;
  operadorAvisado: boolean;
  motivo?: string;
}

export async function enviarAlertas(agora = new Date()): Promise<ResultadoAlertas> {
  const supabase = db();
  const [{ data: clientes }, { data: docs }, { data: enviados }, { data: ativas }] = await Promise.all([
    supabase.from("clientes").select("id, razao_social, nome_fantasia, contato_nome, whatsapp, token_portal").eq("ativo", true),
    supabase
      .from("documentos_cliente")
      .select("id, cliente_id, tipo, descricao, nome_arquivo, validade, emitido_em, enviado_por, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("alertas_enviados").select("chave"),
    supabase.from("disputas").select(SELECT_DISPUTA_COMPLETA).in("status", ETAPAS_ATIVAS).limit(300),
  ]);
  const ja = new Set((enviados ?? []).map((e) => e.chave as string));
  const novas: string[] = [];
  const porCliente = new Map<string, DocumentoResumo[]>();
  for (const d of (docs ?? []) as (DocumentoResumo & { cliente_id: string })[]) {
    porCliente.set(d.cliente_id, [...(porCliente.get(d.cliente_id) ?? []), d]);
  }

  // ── Cliente: certidões vencendo ──────────────────────────────
  let clientesAvisados = 0;
  for (const c of (clientes ?? []) as Pick<ClienteRow, "id" | "razao_social" | "nome_fantasia" | "contato_nome" | "whatsapp" | "token_portal">[]) {
    if (!c.whatsapp) continue;
    const lista = porCliente.get(c.id) ?? [];
    const maisRecente = new Map<string, DocumentoResumo>();
    for (const d of lista) if (!maisRecente.has(d.tipo)) maisRecente.set(d.tipo, d);

    const avisos: { chave: string; texto: string }[] = [];
    for (const d of maisRecente.values()) {
      if (!VENCEM.has(d.tipo) || !d.validade) continue;
      const s = situacaoDocumento(d.validade, agora);
      if (s !== "vencido" && s !== "vence_logo") continue;
      const chave = `doc:${d.id}:${s}`;
      if (ja.has(chave)) continue;
      avisos.push({
        chave,
        texto: `• ${rotuloTipo(d.tipo)}: ${s === "vencido" ? "venceu" : "vence"} em ${dataBr(d.validade)}`,
      });
    }
    if (avisos.length === 0) continue;

    const ola = c.contato_nome ? `Olá, ${c.contato_nome.split(" ")[0]}!` : "Olá!";
    const texto = [
      `${ola} Alguns documentos da ${c.nome_fantasia || c.razao_social} precisam ser renovados:`,
      "",
      ...avisos.map((a) => a.texto),
      "",
      "Certidão vencida tira a empresa da disputa. Emita a nova e envie em \"Documentos da empresa\":",
      urlPortal(c.token_portal),
    ].join("\n");
    if (await enviarWhatsApp(c.whatsapp, texto)) {
      clientesAvisados++;
      novas.push(...avisos.map((a) => a.chave));
    }
  }

  // ── Operador: sessões próximas e pendências ──────────────────
  const disputas = (ativas ?? []) as unknown as DisputaCompleta[];
  const ids = [...new Set(disputas.map((d) => d.licitacao_id))];
  const { data: fichasRaw } = ids.length
    ? await supabase.from("fichas_edital").select("*").in("licitacao_id", ids)
    : { data: [] };
  const fichas = new Map(((fichasRaw ?? []) as FichaRow[]).map((f) => [f.licitacao_id, f]));

  const sessoes: { chave: string; texto: string }[] = [];
  const pendencias: { chaves: string[]; texto: string }[] = [];
  for (const d of disputas) {
    const ficha = fichas.get(d.licitacao_id);
    const nome = d.cliente.nome_fantasia || d.cliente.razao_social;
    const objeto = limparObjeto(d.licitacao.objeto).slice(0, 90);
    const sessaoIso = dataDaSessao(ficha?.ficha.sessao.data_hora) ?? d.licitacao.data_encerramento_proposta;

    if (sessaoIso) {
      const horas = (new Date(sessaoIso).getTime() - agora.getTime()) / 36e5;
      const chave = `sessao:${d.id}:${sessaoIso.slice(0, 10)}`;
      if (horas > 0 && horas <= 36 && !ja.has(chave)) {
        const quando = new Date(sessaoIso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        sessoes.push({ chave, texto: `• ${quando} · *${nome}* · ${objeto}${d.preco_minimo ? ` · piso ${d.preco_minimo.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` : ""}` });
      }
    }

    if (ficha && ["aprovada", "em_preparacao", "proposta_enviada"].includes(d.status)) {
      const p = pendenciasHabilitacao(checklistHabilitacao(ficha.ficha.documentos_exigidos, porCliente.get(d.cliente_id) ?? [], sessaoIso));
      const itens = [
        ...p.falta.map((i) => ({ i, s: "falta" })),
        ...p.vencido.map((i) => ({ i, s: "vencido" })),
        ...p.venceAntes.map((i) => ({ i, s: "vence_antes" })),
      ].filter(({ i, s }) => !ja.has(`pend:${d.id}:${i.tipo}:${s}`));
      if (itens.length) {
        pendencias.push({
          chaves: itens.map(({ i, s }) => `pend:${d.id}:${i.tipo}:${s}`),
          texto: `• *${nome}* · ${objeto}\n  ${itens.map(({ i, s }) => `${i.rotulo} (${s === "falta" ? "falta" : s === "vencido" ? "vencido" : "vence antes da sessão"})`).join(", ")}`,
        });
      }
    }
  }

  let operadorAvisado = false;
  const numero = process.env.ALERTA_WHATSAPP_NUMERO;
  if (numero && (sessoes.length || pendencias.length)) {
    const blocos: string[] = [];
    if (sessoes.length) blocos.push(`⏰ *Sessões nas próximas 36h*\n\n${sessoes.map((s) => s.texto).join("\n")}`);
    if (pendencias.length) {
      blocos.push(`📄 *Documentos que tiram o cliente da disputa*\n\n${pendencias.map((p) => p.texto).join("\n\n")}`);
    }
    operadorAvisado = await enviarWhatsApp(numero, blocos.join("\n\n━━━━━━━━\n\n"));
    if (operadorAvisado) novas.push(...sessoes.map((s) => s.chave), ...pendencias.flatMap((p) => p.chaves));
  }

  if (novas.length) {
    const { error } = await supabase.from("alertas_enviados").upsert(novas.map((chave) => ({ chave })), { onConflict: "chave" });
    if (error) throw new Error(`Avisos enviados, mas não deu para registrar: ${error.message}`);
  }

  return {
    clientesAvisados,
    operadorAvisado,
    motivo: !clientesAvisados && !operadorAvisado ? "nada novo para avisar, ou WhatsApp fora do ar" : undefined,
  };
}
