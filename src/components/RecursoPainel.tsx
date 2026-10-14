"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Scale } from "lucide-react";
import { gerarRecurso } from "@/app/acoes";
import type { TipoRecurso } from "@/lib/ai";
import type { DisputaCompleta } from "@/lib/db";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
import { Campo } from "./ui/campo";
import { Aviso } from "./ui/aviso";

const TIPOS: { id: TipoRecurso; rotulo: string; dica: string }[] = [
  { id: "intencao", rotulo: "Intenção de recurso", dica: "Frases curtas para o campo do sistema, logo após o resultado. O prazo é curto." },
  { id: "razoes", rotulo: "Razões de recurso", dica: "O recurso completo, em geral até 3 dias úteis depois da intenção." },
  { id: "contrarrazoes", rotulo: "Contrarrazões", dica: "Resposta ao recurso de um concorrente contra o seu cliente." },
];

/** Rascunho de recurso pela IA, a partir do que aconteceu na sessão. */
export default function RecursoPainel({ d }: { d: DisputaCompleta }) {
  const [tipo, setTipo] = useState<TipoRecurso>(d.status === "ganhou" ? "contrarrazoes" : "intencao");
  const [fatos, setFatos] = useState("");
  const [texto, setTexto] = useState("");
  const [saida, setSaida] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const t = TIPOS.find((x) => x.id === tipo)!;

  return (
    <div className="space-y-3 rounded-md border bg-background/40 p-4 text-sm">
      <span className="inline-flex items-center gap-2 font-medium">
        <Scale className="size-4 text-muted-foreground" />
        Recurso
      </span>
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <Campo rotulo="O que redigir" dica={t.dica}>
          <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecurso)}>
            {TIPOS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.rotulo}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <Campo rotulo="O que aconteceu">
          <Textarea
            rows={3}
            value={fatos}
            onChange={(e) => setFatos(e.target.value)}
            placeholder={
              tipo === "contrarrazoes"
                ? "ex: a Fornecedor B recorreu dizendo que nosso atestado não comprova 10 unidades; o atestado da rede estadual tem 14 escolas."
                : "ex: a vencedora apresentou CND estadual vencida na data da sessão e o pregoeiro aceitou mesmo assim."
            }
          />
        </Campo>
      </div>
      <Button
        size="sm"
        disabled={pendente || fatos.trim().length < 20}
        onClick={() =>
          iniciar(async () => {
            setSaida(null);
            try {
              const s = await gerarRecurso(d.id, tipo, fatos);
              setSaida(s);
              if (s.texto) setTexto(s.texto);
            } catch (e) {
              setSaida({ ok: false, mensagem: (e as Error).message });
            }
          })
        }
      >
        {pendente && <Loader2 className="animate-spin" />}
        {pendente ? "Redigindo… (até 1 min)" : "Redigir rascunho"}
      </Button>
      {saida && <Aviso tom={saida.ok ? "sucesso" : "erro"}>{saida.mensagem}</Aviso>}
      {texto && (
        <div className="space-y-2">
          <Aviso tom="alerta">
            Rascunho da IA. Complete o que está entre [colchetes], confira cada citação marcada com [conferir] e, nos
            primeiros, peça a revisão de quem já fez recurso.
          </Aviso>
          <Textarea rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} className="font-mono text-xs leading-relaxed" />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(texto);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                /* sem clipboard: o texto está no campo para selecionar */
              }
            }}
          >
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar texto"}
          </Button>
        </div>
      )}
    </div>
  );
}
