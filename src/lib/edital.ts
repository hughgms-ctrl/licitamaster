import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type { LicitacaoRow } from "./db";
import type { DocumentoPDF } from "./ai";
import { normalizar } from "./scoring";

/**
 * Busca os arquivos de uma contratação no PNCP e escolhe quais a IA lê.
 *
 * O que a API real devolve (conferido em editais do ES):
 *   - às vezes o edital é um PDF marcado "Edital";
 *   - às vezes vem num ZIP marcado "Outros Documentos" ("Edital e anexos.zip");
 *   - às vezes o arquivo marcado "Edital" é só o aviso de publicação, e o
 *     edital de verdade está noutro arquivo.
 * O download vem como application/octet-stream: o tipo sai dos bytes.
 */

export const BASE_PNCP_V1 = "https://pncp.gov.br/api/pncp/v1";
const BASE = BASE_PNCP_V1;

/** Teto do que mandamos para a IA. O limite da API do Claude é 32 MB por
 *  requisição, e base64 infla 33%: 20 MB de PDF cabem com folga. */
const TETO_BYTES = 20 * 1024 * 1024;
const TETO_ARQUIVOS = 6;

interface ArquivoPNCP {
  sequencialDocumento: number;
  titulo: string;
  tipoDocumentoNome?: string;
  url: string;
}

export interface ArquivoLido {
  titulo: string;
  bytes: number;
  origem: string;
}

/** Peça acessória: só é lida se não houver nenhuma principal. */
const ACESSORIO = [
  "aviso", "publicacao", "extrato", "jornal", "dioes", "diario oficial",
  "autorizacao", "decisao", "despacho", "parecer", "portaria", "ata de",
  "cronograma", "bdi", "curva abc", "composicao", "planilha", "memorial",
  "projeto executivo", "projeto arquitetonico", "prancha", "temporalidade",
  "endereco", "empenho", "planta", "dotacao", "orcamento estimado",
];
/** Versão morta do documento: nunca é lida. */
const DESCARTADO = ["cancelad", "revogad", "substituid", "anulad", "sem efeito"];

function pontuarTitulo(titulo: string, tipo: string | undefined): number {
  const t = ` ${normalizar(titulo)} `;
  if (DESCARTADO.some((x) => t.includes(x))) return -1000;
  let p = 0;
  if (normalizar(tipo ?? "") === "edital") p += 20;
  if (t.includes(" edital")) p += 50;
  if (t.includes("termo de referencia") || /\btr\d*\b/.test(t) || t.includes("projeto basico")) p += 40;
  if (t.includes("minuta") || t.includes("contrato")) p += 15;
  if (t.includes("retificad")) p += 15; // a versão retificada vale sobre a original
  if (ACESSORIO.some((x) => t.includes(x))) p -= 100;
  return p;
}

function ehPDF(b: Uint8Array) {
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}
function ehZIP(b: Uint8Array) {
  return b[0] === 0x50 && b[1] === 0x4b; // PK
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET com 3 tentativas. O PNCP falha de forma intermitente (conexão
 * recusada, DNS, 5xx) e uma falha isolada não pode derrubar a leitura.
 */
export async function getComRetentativa(url: string, timeoutMs: number): Promise<Response> {
  let ultimo: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (res.status < 500 && res.status !== 429) return res;
      ultimo = new Error(`PNCP ${res.status}`);
    } catch (e) {
      ultimo = e;
    }
    await espera(1500 * (i + 1));
  }
  throw ultimo instanceof Error ? ultimo : new Error("PNCP indisponível");
}

async function baixar(url: string): Promise<Uint8Array> {
  // a URL vem pronta na listagem de arquivos
  const res = await getComRetentativa(url, 60_000);
  if (!res.ok) throw new Error(`PNCP ${res.status} ao baixar ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function listarArquivos(lic: LicitacaoRow): Promise<ArquivoPNCP[]> {
  const raw = lic.raw as { anoCompra?: number; sequencialCompra?: number };
  const cnpj = lic.orgao_cnpj?.replace(/\D/g, "");
  if (!cnpj || !raw.anoCompra || !raw.sequencialCompra) {
    throw new Error("Esta licitação não tem os dados para localizar o edital no PNCP.");
  }
  const res = await getComRetentativa(
    `${BASE}/orgaos/${cnpj}/compras/${raw.anoCompra}/${raw.sequencialCompra}/arquivos`,
    30_000
  );
  if (res.status === 204 || res.status === 404) return [];
  if (!res.ok) throw new Error(`PNCP ${res.status} ao listar os arquivos do edital.`);
  const lista = (await res.json()) as ArquivoPNCP[];
  return Array.isArray(lista) ? lista : [];
}

/**
 * Baixa, abre ZIPs e devolve os PDFs na ordem em que a IA deve ler, até o
 * teto. Arquivo que não é PDF nem ZIP (doc, xls, imagem) é ignorado: a IA
 * lê PDF nativamente, o resto exigiria conversão.
 */
export async function reunirPDFs(lic: LicitacaoRow): Promise<{ pdfs: DocumentoPDF[]; lidos: ArquivoLido[]; ignorados: string[] }> {
  const arquivos = await listarArquivos(lic);
  if (arquivos.length === 0) throw new Error("O PNCP não tem arquivos publicados para esta licitação.");

  // ordena pela cara de "peça principal" antes de baixar: economiza download
  const ordenados = [...arquivos].sort(
    (a, b) => pontuarTitulo(b.titulo, b.tipoDocumentoNome) - pontuarTitulo(a.titulo, a.tipoDocumentoNome)
  );

  const candidatos: { titulo: string; bytes: Uint8Array; origem: string; pontos: number }[] = [];
  const ignorados: string[] = [];

  for (const a of ordenados.slice(0, 10)) {
    let bytes: Uint8Array;
    try {
      bytes = await baixar(a.url);
    } catch {
      ignorados.push(`${a.titulo} (falhou o download)`);
      continue;
    }
    if (ehPDF(bytes)) {
      candidatos.push({ titulo: a.titulo, bytes, origem: "PNCP", pontos: pontuarTitulo(a.titulo, a.tipoDocumentoNome) });
    } else if (ehZIP(bytes)) {
      let dentro: Record<string, Uint8Array> = {};
      try {
        dentro = unzipSync(bytes);
      } catch {
        ignorados.push(`${a.titulo} (ZIP corrompido)`);
        continue;
      }
      for (const [nome, conteudo] of Object.entries(dentro)) {
        const base = nome.split("/").pop() ?? nome;
        if (!base || !ehPDF(conteudo)) {
          if (base && !nome.endsWith("/")) ignorados.push(`${base} (dentro de ${a.titulo}, não é PDF)`);
          continue;
        }
        candidatos.push({
          titulo: base.replace(/\.pdf$/i, ""),
          bytes: conteudo,
          origem: a.titulo,
          // dentro do ZIP o nome do arquivo é o melhor sinal; o ZIP herda o
          // bônus de "edital" quando o próprio ZIP se chama assim
          pontos: pontuarTitulo(base, undefined) + (pontuarTitulo(a.titulo, a.tipoDocumentoNome) > 0 ? 10 : 0),
        });
      }
    } else {
      ignorados.push(`${a.titulo} (formato não suportado)`);
    }
  }

  candidatos.sort((a, b) => b.pontos - a.pontos);

  // Peça acessória (aviso, cronograma, BDI…) só entra se não houver nenhuma
  // principal: lê-la custa IA e não muda a ficha.
  for (const c of candidatos.filter((x) => x.pontos <= -1000)) ignorados.push(`${c.titulo} (versão cancelada/revogada)`);
  candidatos.splice(0, candidatos.length, ...candidatos.filter((x) => x.pontos > -1000));
  const temPrincipal = candidatos.some((c) => c.pontos >= 0);
  if (temPrincipal) {
    for (const c of candidatos.filter((x) => x.pontos < 0)) ignorados.push(`${c.titulo} (peça acessória)`);
    candidatos.splice(0, candidatos.length, ...candidatos.filter((x) => x.pontos >= 0));
  }

  // O mesmo PDF costuma vir solto E dentro do ZIP: lê uma vez só.
  const vistos = new Set<string>();
  const unicos = candidatos.filter((c) => {
    const h = createHash("sha1").update(c.bytes).digest("hex");
    if (vistos.has(h)) return false;
    vistos.add(h);
    return true;
  });

  const pdfs: DocumentoPDF[] = [];
  const lidos: ArquivoLido[] = [];
  let total = 0;
  for (const c of unicos) {
    if (pdfs.length >= TETO_ARQUIVOS || total + c.bytes.length > TETO_BYTES) {
      ignorados.push(`${c.titulo} (não coube no limite de leitura)`);
      continue;
    }
    total += c.bytes.length;
    pdfs.push({ titulo: c.titulo, base64: Buffer.from(c.bytes).toString("base64") });
    lidos.push({ titulo: c.titulo, bytes: c.bytes.length, origem: c.origem });
  }

  if (pdfs.length === 0) {
    throw new Error("Nenhum PDF legível entre os arquivos do edital no PNCP.");
  }
  return { pdfs, lidos, ignorados };
}
