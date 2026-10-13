"use client";

import { useRef, useState } from "react";
import {
  TIPOS_DOCUMENTO,
  situacaoDocumento,
  type DocumentoResumo,
} from "@/lib/documentos";

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
    <div className="cofre">
      <div className="cofre-envio">
        <label className="campo-rotulado">
          <span>Tipo do documento</span>
          <select className="campo" value={tipoEnvio} onChange={(e) => setTipoEnvio(e.target.value)}>
            <option value="">Identificar automaticamente</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={arquivoRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          multiple
          hidden
          onChange={(e) => enviar(e.target.files)}
        />
        <button className="btn btn-primario" disabled={enviando != null} onClick={() => arquivoRef.current?.click()}>
          {enviando ? `Enviando ${enviando}…` : "Enviar documentos"}
        </button>
        <p className="dica">
          PDF, JPG ou PNG até 20 MB. {modo === "cliente" ? "Lemos o tipo e a validade de cada PDF." : "A IA lê tipo, validade e confere o CNPJ de cada PDF."}
        </p>
      </div>

      {aviso && (
        <p className={`aviso ${aviso.ok ? "" : "aviso-erro"}`} role="status">
          {aviso.texto}
        </p>
      )}

      {GRUPOS.map((grupo) => (
        <div key={grupo} className="cofre-grupo">
          <h4 className="cofre-grupo-titulo">{grupo}</h4>
          {TIPOS_DOCUMENTO.filter((t) => t.grupo === grupo).map((t) => {
            const doTipo = docs.filter((d) => d.tipo === t.id);
            if (doTipo.length === 0 && (t.id === "outro" || modo === "cliente")) return null;
            const atual = doTipo[0];
            return (
              <div key={t.id} className="cofre-linha">
                <span className="cofre-tipo">{t.rotulo}</span>
                {atual ? (
                  <>
                    <Situacao validade={atual.validade} vence={t.vence} />
                    <button className="link-doc" onClick={() => abrir(atual.id)} title={atual.nome_arquivo}>
                      {atual.nome_arquivo}
                    </button>
                    {modo === "operador" && atualizar && (
                      <span className="cofre-acoes">
                        <button className="btn btn-discreto" onClick={() => setEditando(editando === atual.id ? null : atual.id)}>
                          Editar
                        </button>
                        {apagar && (
                          <button
                            className="btn btn-discreto"
                            onClick={async () => {
                              if (!confirm(`Apagar ${atual.nome_arquivo} do cofre?`)) return;
                              await apagar(atual.id);
                              setDocs((xs) => xs.filter((x) => x.id !== atual.id));
                            }}
                          >
                            Apagar
                          </button>
                        )}
                      </span>
                    )}
                    {editando === atual.id && atualizar && (
                      <Edicao
                        doc={atual}
                        salvar={async (tipo, validade) => {
                          await atualizar(atual.id, tipo, validade);
                          setDocs((xs) => xs.map((x) => (x.id === atual.id ? { ...x, tipo, validade } : x)));
                          setEditando(null);
                        }}
                      />
                    )}
                    {doTipo.length > 1 && <span className="cofre-mais">+{doTipo.length - 1} anterior(es)</span>}
                  </>
                ) : (
                  <span className="situacao situacao-falta">Não enviado</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Situacao({ validade, vence }: { validade: string | null; vence: boolean }) {
  const s = situacaoDocumento(validade);
  const data = validade ? validade.split("-").reverse().join("/") : null;
  if (s === "sem_validade") {
    return <span className={`situacao ${vence ? "situacao-alerta" : "situacao-ok"}`}>{vence ? "Sem validade informada" : "Não vence"}</span>;
  }
  if (s === "vencido") return <span className="situacao situacao-falta">Vencido em {data}</span>;
  if (s === "vence_logo") return <span className="situacao situacao-alerta">Vence em {data}</span>;
  return <span className="situacao situacao-ok">Válido até {data}</span>;
}

function Edicao({ doc, salvar }: { doc: DocumentoResumo; salvar: (tipo: string, validade: string | null) => Promise<void> }) {
  const [tipo, setTipo] = useState(doc.tipo);
  const [validade, setValidade] = useState(doc.validade ?? "");
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="cofre-edicao">
      <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t.id} value={t.id}>
            {t.rotulo}
          </option>
        ))}
      </select>
      <input className="campo" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} aria-label="Validade" />
      <button
        className="btn btn-primario"
        disabled={salvando}
        onClick={async () => {
          setSalvando(true);
          await salvar(tipo, validade || null);
          setSalvando(false);
        }}
      >
        Salvar
      </button>
    </div>
  );
}

