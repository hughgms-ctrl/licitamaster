"use client";

import { checklistHabilitacao, type DocumentoResumo, type ItemChecklist } from "@/lib/documentos";
import type { FichaRow } from "@/lib/ficha";
import { formatarData, formatarValor } from "@/lib/formato";

/** "15/10/2026 09:00" → ISO, para comparar com a validade das certidões. */
function dataDaSessao(texto: string | null): string | null {
  const m = texto?.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "09"}:${m[5] ?? "00"}:00-03:00`;
}

const ROTULO_ITEM: Record<ItemChecklist["situacao"], string> = {
  ok: "Pronto",
  vence_logo: "Vence antes da sessão",
  vencido: "Vencido",
  falta: "Falta",
};

/**
 * A ficha do edital, organizada na ordem em que o operador decide:
 * o que é → quando e onde → o cliente consegue se habilitar? → o que pode dar
 * errado → o que dá para contestar.
 */
export default function FichaEdital({
  linha,
  cofre,
  encerramento,
  editalMudouDepois,
  nomeCliente,
}: {
  linha: FichaRow;
  cofre: DocumentoResumo[];
  encerramento: string | null;
  editalMudouDepois: boolean;
  nomeCliente: string;
}) {
  const f = linha.ficha;
  const sessao = dataDaSessao(f.sessao.data_hora) ?? encerramento;
  const checklist = checklistHabilitacao(f.documentos_exigidos, cofre, sessao);
  const prontos = checklist.filter((c) => c.situacao === "ok").length;

  return (
    <div className="ficha">
      {editalMudouDepois && (
        <p className="aviso aviso-erro">
          O edital foi retificado no PNCP depois desta leitura. Leia de novo antes de seguir.
        </p>
      )}

      <p className="ficha-resumo">{f.resumo}</p>

      <dl className="fatos">
        <Fato rotulo="Sessão" valor={f.sessao.data_hora} />
        <Fato rotulo="Plataforma" valor={f.sessao.plataforma} link={f.sessao.link} />
        <Fato rotulo="Disputa" valor={f.sessao.modo_disputa} />
        <Fato rotulo="Julgamento" valor={f.sessao.criterio_julgamento} />
        <Fato
          rotulo="Exclusiva ME/EPP"
          valor={{ sim: "Sim", nao: "Não", parcial: "Em parte dos itens", nao_informado: null }[f.exclusiva_me_epp]}
        />
        <Fato rotulo="Impugnação até" valor={f.prazos.impugnacao} />
        <Fato rotulo="Execução" valor={f.prazos.entrega_execucao} />
        <Fato rotulo="Vigência" valor={f.prazos.vigencia} />
        <Fato rotulo="Pagamento" valor={f.prazos.pagamento} />
      </dl>

      <section className="ficha-secao">
        <h4>
          Habilitação de {nomeCliente}{" "}
          <span className={`ficha-placar ${prontos === checklist.length ? "u-verde" : "u-ambar"}`}>
            {prontos} de {checklist.length} prontos
          </span>
        </h4>
        {checklist.length === 0 ? (
          <p className="dica">A leitura não identificou documentos de habilitação no edital.</p>
        ) : (
          <ul className="checklist">
            {checklist.map((c, i) => (
              <li key={`${c.tipo}-${i}`} className={`checklist-${c.situacao}`}>
                <span className="checklist-status">{ROTULO_ITEM[c.situacao]}</span>
                <span className="checklist-nome">{c.rotulo}</span>
                {c.detalhe && <span className="checklist-detalhe">{c.detalhe}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Lista titulo="Qualificação técnica" itens={f.exigencias_tecnicas} />
      <Lista titulo="Qualificação econômica" itens={f.qualificacao_economica} />
      <Lista
        titulo="Visita, amostra e garantia"
        itens={[
          f.visita_tecnica && `Visita técnica: ${f.visita_tecnica}`,
          f.amostra && `Amostra: ${f.amostra}`,
          f.garantia && `Garantia: ${f.garantia}`,
        ].filter((x): x is string => !!x)}
      />
      <Lista titulo="Riscos" itens={f.riscos} />

      {f.clausulas_restritivas.length > 0 && (
        <section className="ficha-secao">
          <h4>Cláusulas que podem ser impugnadas</h4>
          <ul>
            {f.clausulas_restritivas.map((c, i) => (
              <li key={i}>
                <b>{c.clausula}</b> {c.referencia && <span className="dica">({c.referencia})</span>}
                <br />
                {c.por_que}
              </li>
            ))}
          </ul>
          {f.prazos.impugnacao && <p className="dica">Prazo para impugnar: {f.prazos.impugnacao}.</p>}
        </section>
      )}

      <Lista titulo="Perguntas para o pregoeiro" itens={f.perguntas_esclarecimento} />
      <Lista titulo="Penalidades" itens={f.penalidades} />

      {f.itens.length > 0 && (
        <section className="ficha-secao">
          <h4>Itens</h4>
          <ul>
            {f.itens.map((it, i) => (
              <li key={i}>
                {it.descricao}
                {it.quantidade && <span className="dica"> · {it.quantidade}</span>}
                {it.valor_estimado != null && <span className="num"> {formatarValor(it.valor_estimado)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="ficha-rodape">
        Lido em {formatarData(linha.gerado_em)}
        {linha.modelo ? ` por ${linha.modelo}` : ""}, a partir de:{" "}
        {linha.arquivos_lidos.map((a) => a.titulo).join("; ")}.
      </p>
    </div>
  );
}

function Fato({ rotulo, valor, link }: { rotulo: string; valor: string | null | undefined; link?: string | null }) {
  if (!valor) return null;
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer">
            {valor}
          </a>
        ) : (
          valor
        )}
      </dd>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <section className="ficha-secao">
      <h4>{titulo}</h4>
      <ul>
        {itens.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </section>
  );
}
