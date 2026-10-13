"use client";

import { useRef, useState } from "react";
import {
  TIPOS_DOCUMENTO,
  situacaoDocumento,
  type DocumentoResumo,
} from "@/lib/documentos";
import { FileText, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Campo } from "./ui/campo";
import { Aviso } from "./ui/aviso";
import { StatusDot } from "./ui/status-dot";
import { useConfirmar } from "./ui/confirmar";

export interface SaidaCofre {
  ok: boolean;
  documento?: DocumentoResumo;
  aviso?: string | null;
}

interface Props {
  documentos: DocumentoResumo[];
  modo: "operador" | "cliente";
  pedirUpload: (nome: string, mime: string, bytes: number) => Promise<{ path: string; url: string } | { erro: string }>;
  registrar: (path: string, nome: string, tipo?: string) => Promise<SaidaCofre>;
  link: (id: string) => Promise<string>;
  atualizar?: (id: string, tipo: string, validade: string | null) => Promise<void>;
  apagar?: (id: string) => Promise<void>;
}

const GRUPOS = [...new Set(TIPOS_DOCUMENTO.map((t) => t.grupo))];

/**
 * Cofre de documentos de habilitação, agrupado como os editais agrupam:
 * jurídica, fiscal e trabalhista, econômico-financeira, técnica. Cada tipo
 * mostra o documento mais recente e se ele ainda vale.
 */
export default function Cofre({ documentos: iniciais, modo, pedirUpload, registrar, link, atualizar, apagar }: Props) {
  const [docs, setDocs] = useState(iniciais);
  const [tipoEnvio, setTipoEnvio] = useState<string>("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [confirmar, dialogo] = useConfirmar();

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setAviso(null);
    for (const arquivo of Array.from(arquivos)) {
      setEnviando(arquivo.name);
      try {
        const pedido = await pedirUpload(arquivo.name, arquivo.type, arquivo.size);
        if ("erro" in pedido) {
          setAviso({ ok: false, texto: `${arquivo.name}: ${pedido.erro}` });
          continue;
        }
        const put = await fetch(pedido.url, {
          method: "PUT",
          headers: { "content-type": arquivo.type },
          body: arquivo,
        });
        if (!put.ok) {
          setAviso({ ok: false, texto: `${arquivo.name}: o envio falhou (${put.status}). Tente de novo.` });
          continue;
        }
        const r = await registrar(pedido.path, arquivo.name, tipoEnvio || undefined);
        if (r.ok && r.documento) {
          setDocs((xs) => [r.documento!, ...xs]);
          setAviso({
            ok: !r.aviso?.startsWith("Atenção"),
            texto: r.aviso ? `${arquivo.name}: ${r.aviso}` : `${arquivo.name} guardado no cofre.`,
          });
        } else {
          setAviso({ ok: false, texto: `${arquivo.name}: ${r.aviso ?? "não foi registrado."}` });
        }
      } catch (e) {
        setAviso({ ok: false, texto: `${arquivo.name}: ${(e as Error).message}` });
      }
    }
    setEnviando(null);
    if (arquivoRef.current) arquivoRef.current.value = "";
  }

  async function abrir(id: string) {
    try {
      window.open(await link(id), "_blank", "noopener");
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Campo rotulo="Tipo do documento" className="sm:w-72">
          <NativeSelect value={tipoEnvio} onChange={(e) => setTipoEnvio(e.target.value)}>
            <option value="">Identificar automaticamente</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <input
          ref={arquivoRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          multiple
          hidden
          onChange={(e) => enviar(e.target.files)}
        />
        <Button disabled={enviando != null} onClick={() => arquivoRef.current?.click()} className="sm:w-auto">
          {enviando ? <Loader2 className="animate-spin" /> : <Upload />}
          <span className="truncate">{enviando ? `Enviando ${enviando}…` : "Enviar documentos"}</span>
        </Button>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        PDF, JPG ou PNG até 20 MB.{" "}
        {modo === "cliente" ? "Lemos o tipo e a validade de cada PDF." : "A IA lê tipo, validade e confere o CNPJ de cada PDF."}
      </p>

      {aviso && <Aviso tom={aviso.ok ? "sucesso" : "erro"}>{aviso.texto}</Aviso>}

      {GRUPOS.map((grupo) => {
        const tipos = TIPOS_DOCUMENTO.filter((t) => t.grupo === grupo).filter(
          (t) => docs.some((d) => d.tipo === t.id) || !(t.id === "outro" || modo === "cliente")
        );
        if (tipos.length === 0) return null;
        return (
          <div key={grupo} className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">{grupo}</h4>
            <div className="divide-y overflow-hidden rounded-md border bg-card">
              {tipos.map((t) => {
                const doTipo = docs.filter((d) => d.tipo === t.id);
                const atual = doTipo[0];
                return (
                  <div key={t.id} className="px-3 py-2.5">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="min-w-0 text-sm font-medium sm:w-64 sm:shrink-0">{t.rotulo}</span>
                      {atual ? (
                        <>
                          <span className="sm:w-48 sm:shrink-0">
                            <Situacao validade={atual.validade} vence={t.vence} />
                          </span>
                          <button
                            className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-muted-foreground hover:text-foreground"
                            onClick={() => abrir(atual.id)}
                            title={atual.nome_arquivo}
                          >
                            <FileText className="size-3.5 shrink-0" />
                            <span className="truncate">{atual.nome_arquivo}</span>
                            {doTipo.length > 1 && (
                              <span className="shrink-0 text-xs text-muted-foreground/70">+{doTipo.length - 1} anterior(es)</span>
                            )}
                          </button>
                          {modo === "operador" && atualizar && (
                            <span className="flex shrink-0 gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Editar"
                                onClick={() => setEditando(editando === atual.id ? null : atual.id)}
                              >
                                <Pencil />
                                Editar
                              </Button>
                              {apagar && (
                                <Button
                                  size="icon-sm"
                                  variant="ghost-destructive"
                                  aria-label={`Apagar ${atual.nome_arquivo}`}
                                  onClick={async () => {
                                    if (
                                      !(await confirmar({
                                        titulo: `Apagar ${atual.nome_arquivo} do cofre?`,
                                        confirmar: "Apagar",
                                        destrutivo: true,
                                      }))
                                    )
                                      return;
                                    await apagar(atual.id);
                                    setDocs((xs) => xs.filter((x) => x.id !== atual.id));
                                  }}
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </span>
                          )}
                        </>
                      ) : (
                        <StatusDot tom="perigo">Não enviado</StatusDot>
                      )}
                    </div>
                    {atual && editando === atual.id && atualizar && (
                      <Edicao
                        doc={atual}
                        salvar={async (tipo, validade) => {
                          await atualizar(atual.id, tipo, validade);
                          setDocs((xs) => xs.map((x) => (x.id === atual.id ? { ...x, tipo, validade } : x)));
                          setEditando(null);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {dialogo}
    </div>
  );
}

function Situacao({ validade, vence }: { validade: string | null; vence: boolean }) {
  const s = situacaoDocumento(validade);
  const data = validade ? validade.split("-").reverse().join("/") : null;
  if (s === "sem_validade") {
    return <StatusDot tom={vence ? "alerta" : "sucesso"}>{vence ? "Sem validade informada" : "Não vence"}</StatusDot>;
  }
  if (s === "vencido") return <StatusDot tom="perigo">Vencido em {data}</StatusDot>;
  if (s === "vence_logo") return <StatusDot tom="alerta">Vence em {data}</StatusDot>;
  return <StatusDot tom="sucesso">Válido até {data}</StatusDot>;
}

function Edicao({ doc, salvar }: { doc: DocumentoResumo; salvar: (tipo: string, validade: string | null) => Promise<void> }) {
  const [tipo, setTipo] = useState(doc.tipo);
  const [validade, setValidade] = useState(doc.validade ?? "");
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="mt-2.5 flex flex-col gap-2 rounded-md bg-muted/50 p-2.5 sm:flex-row sm:items-center">
      <NativeSelect className="sm:flex-1" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t.id} value={t.id}>
            {t.rotulo}
          </option>
        ))}
      </NativeSelect>
      <Input className="sm:w-44" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} aria-label="Validade" />
      <Button
        size="sm"
        disabled={salvando}
        onClick={async () => {
          setSalvando(true);
          await salvar(tipo, validade || null);
          setSalvando(false);
        }}
      >
        Salvar
      </Button>
    </div>
  );
}
