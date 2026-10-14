import { db } from "./db";

/**
 * Dados da assessoria (quem opera as licitações): vão na procuração como
 * outorgados e, mais adiante, na cobrança. Guardados na tabela configuracoes.
 */
export interface Procurador {
  nome: string;
  cpf: string;
  /** "brasileiro(a), casado(a), administrador(a)" — a qualificação que vai no texto */
  qualificacao: string;
}

export interface Assessoria {
  razao_social: string;
  cnpj: string;
  endereco: string;
  procuradores: Procurador[];
}

const CHAVE = "assessoria";

export async function lerAssessoria(): Promise<Assessoria | null> {
  const { data } = await db().from("configuracoes").select("valor").eq("chave", CHAVE).maybeSingle();
  return (data?.valor as Assessoria | undefined) ?? null;
}

export async function gravarAssessoria(a: Assessoria): Promise<void> {
  const { error } = await db()
    .from("configuracoes")
    .upsert({ chave: CHAVE, valor: a, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
