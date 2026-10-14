/**
 * Asaas: só o necessário para cobrar os clientes da assessoria.
 * Configuração: ASAAS_API_KEY (obrigatória) e ASAAS_API_URL (padrão
 * produção; para testes, https://sandbox.asaas.com/api/v3).
 * Nada aqui roda sozinho: toda cobrança nasce de um clique do operador.
 */

const BASE = (process.env.ASAAS_API_URL ?? "https://api.asaas.com/v3").replace(/\/$/, "");

export function asaasConfigurado(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error("Asaas não configurado (falta ASAAS_API_KEY).");
  const res = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "licitacao-master",
      access_token: chave,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (corpo as { errors?: { description?: string }[] }).errors?.[0]?.description;
    throw new Error(`Asaas recusou (${res.status})${msg ? `: ${msg}` : ""}`);
  }
  return corpo as T;
}

/** Acha o cliente no Asaas pelo CNPJ ou cria. Devolve o id do Asaas. */
export async function garantirClienteAsaas(c: {
  razao_social: string;
  cnpj: string;
  email: string | null;
  whatsapp: string | null;
}): Promise<string> {
  const achados = await chamar<{ data: { id: string }[] }>(`/customers?cpfCnpj=${encodeURIComponent(c.cnpj)}&limit=1`);
  if (achados.data?.[0]?.id) return achados.data[0].id;
  const celular = c.whatsapp?.replace(/^55/, "") || undefined;
  const novo = await chamar<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: c.razao_social, cpfCnpj: c.cnpj, email: c.email || undefined, mobilePhone: celular }),
  });
  return novo.id;
}

export interface CobrancaAsaas {
  id: string;
  status: string;
  invoiceUrl: string | null;
}

/** Cria a cobrança; o cliente escolhe boleto ou Pix na fatura. */
export async function criarCobrancaAsaas(p: {
  cliente: string;
  valor: number;
  vencimento: string;
  descricao: string;
  referencia: string;
}): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: p.cliente,
      billingType: "UNDEFINED",
      value: p.valor,
      dueDate: p.vencimento,
      description: p.descricao.slice(0, 500),
      externalReference: p.referencia.slice(0, 100),
    }),
  });
}

export async function situacaoCobrancaAsaas(id: string): Promise<string> {
  const p = await chamar<{ status: string }>(`/payments/${encodeURIComponent(id)}`);
  return p.status;
}

