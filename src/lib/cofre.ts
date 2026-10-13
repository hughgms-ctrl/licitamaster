import { randomUUID } from "node:crypto";
import { db } from "./db";
import { lerDocumento, type LeituraDocumento } from "./ai";
import { lerConfigIA } from "./config-ia";
import { IDS_TIPO, type DocumentoResumo } from "./documentos";

/**
 * Cofre de documentos do cliente.
 *
 * O arquivo vai do navegador direto para o Storage, por uma URL assinada de
 * uso único que o servidor gera (`pedirUpload`). Assim o arquivo não passa
 * pela função da Vercel, que tem teto de 4,5 MB por requisição, e o navegador
 * nunca recebe chave do Supabase. Depois o servidor registra o documento
 * (`registrar`), e a IA, se configurada, lê tipo, validade e CNPJ.
 */

const BUCKET = "documentos";
const TIPOS_ARQUIVO = ["application/pdf", "image/jpeg", "image/png"];
const TETO_BYTES = 20 * 1024 * 1024;

export async function pedirUpload(
  clienteId: string,
  nome: string,
  mime: string,
  bytes: number
): Promise<{ path: string; url: string } | { erro: string }> {
  if (!TIPOS_ARQUIVO.includes(mime)) return { erro: "Envie PDF, JPG ou PNG." };
  if (bytes > TETO_BYTES) return { erro: "Arquivo acima de 20 MB." };
  const extensao = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
  // nome aleatório no Storage: o nome original fica só na tabela
  const path = `${clienteId}/${randomUUID()}.${extensao}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { erro: `Não deu para preparar o envio: ${error?.message}` };
  return { path, url: data.signedUrl };
}

export async function registrar(opts: {
  clienteId: string;
  cnpjCliente: string;
  path: string;
  nomeArquivo: string;
  enviadoPor: "operador" | "cliente";
  tipo?: string;
  validade?: string | null;
}): Promise<{ documento: DocumentoResumo; leitura: LeituraDocumento | null; aviso: string | null }> {
  const supabase = db();
  // o caminho tem que ser da pasta deste cliente: impede registrar o arquivo
  // de outro cliente com um path forjado
  if (!opts.path.startsWith(`${opts.clienteId}/`)) throw new Error("Arquivo fora da pasta do cliente.");

  const { data: arquivo, error: erroBaixar } = await supabase.storage.from(BUCKET).download(opts.path);
  if (erroBaixar || !arquivo) throw new Error("O arquivo não chegou ao armazenamento. Envie de novo.");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  // Leitura por IA só de PDF, e só se houver chave. Falhar aqui não impede
  // o cadastro: o documento entra e o tipo/validade ficam para conferir.
  let leitura: LeituraDocumento | null = null;
  let aviso: string | null = null;
  const ehPdf = bytes[0] === 0x25 && bytes[1] === 0x50;
  if (ehPdf && (await lerConfigIA())) {
    try {
      leitura = await lerDocumento(
        { titulo: opts.nomeArquivo, base64: Buffer.from(bytes).toString("base64") },
        opts.cnpjCliente
      );
      if (leitura.confere_cnpj === false) {
        aviso = `Atenção: o CNPJ deste documento (${leitura.cnpj}) não é o do cliente.`;
      } else if (leitura.observacao) {
        aviso = leitura.observacao;
      }
    } catch (e) {
      aviso = `A IA não conseguiu ler o documento (${(e as Error).message}). Confira tipo e validade.`;
    }
  }

  const tipo =
    opts.tipo && (IDS_TIPO as string[]).includes(opts.tipo) ? opts.tipo : (leitura?.tipo ?? "outro");
  const validade = opts.validade !== undefined ? opts.validade : (leitura?.validade ?? null);

  const { data, error } = await supabase
    .from("documentos_cliente")
    .insert({
      cliente_id: opts.clienteId,
      tipo,
      arquivo_path: opts.path,
      nome_arquivo: opts.nomeArquivo.slice(0, 200),
      bytes: bytes.length,
      emitido_em: leitura?.emitido_em ?? null,
      validade,
      enviado_por: opts.enviadoPor,
      leitura_ia: leitura,
    })
    .select("id, tipo, descricao, nome_arquivo, validade, emitido_em, enviado_por, created_at")
    .single();
  if (error) throw new Error(error.message);
  return { documento: data as DocumentoResumo, leitura, aviso };
}

export async function listar(clienteId: string): Promise<DocumentoResumo[]> {
  const { data } = await db()
    .from("documentos_cliente")
    .select("id, tipo, descricao, nome_arquivo, validade, emitido_em, enviado_por, created_at")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DocumentoResumo[];
}

/** Link de 2 minutos para abrir o arquivo. Exige que o documento seja do cliente. */
export async function linkArquivo(clienteId: string, documentoId: string): Promise<string> {
  const supabase = db();
  const { data: doc } = await supabase
    .from("documentos_cliente")
    .select("arquivo_path")
    .eq("id", documentoId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!doc) throw new Error("Documento não encontrado.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.arquivo_path, 120);
  if (error || !data) throw new Error("Não deu para gerar o link do arquivo.");
  return data.signedUrl;
}

export async function atualizar(clienteId: string, documentoId: string, tipo: string, validade: string | null) {
  if (!(IDS_TIPO as string[]).includes(tipo)) throw new Error("Tipo de documento inválido.");
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) throw new Error("Data de validade inválida.");
  const { error } = await db()
    .from("documentos_cliente")
    .update({ tipo, validade })
    .eq("id", documentoId)
    .eq("cliente_id", clienteId);
  if (error) throw new Error(error.message);
}

export async function apagar(clienteId: string, documentoId: string) {
  const supabase = db();
  const { data: doc } = await supabase
    .from("documentos_cliente")
    .select("arquivo_path")
    .eq("id", documentoId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!doc) return;
  await supabase.storage.from(BUCKET).remove([doc.arquivo_path]);
  await supabase.from("documentos_cliente").delete().eq("id", documentoId);
}
