import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra simétrica para segredos guardados no banco (chave de API da IA).
 *
 * A chave de cifra vem de CRIPTO_SEGREDO; sem ela, deriva de SESSAO_SEGREDO,
 * para não exigir mais uma variável. Trocar a variável torna os segredos
 * antigos ilegíveis — o painel então pede para cadastrar a chave de novo.
 *
 * Formato: "v1:<iv base64>:<tag base64>:<cifrado base64>".
 */
function chaveCifra(): Buffer {
  const base = process.env.CRIPTO_SEGREDO ?? process.env.SESSAO_SEGREDO;
  if (!base) throw new Error("Falta CRIPTO_SEGREDO (ou SESSAO_SEGREDO) para cifrar segredos.");
  return createHash("sha256").update(`licitacao-master:cripto:${base}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveCifra(), iv);
  const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(":");
}

/** Devolve null quando não dá para decifrar (segredo trocado ou dado corrompido). */
export function decifrar(pacote: string): string | null {
  try {
    const [versao, iv, tag, cifrado] = pacote.split(":");
    if (versao !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", chaveCifra(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(cifrado, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
