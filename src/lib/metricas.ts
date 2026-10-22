/**
 * Números da operação, calculados do que o sistema já registra: os eventos
 * (cada ação de cada pessoa), o tempo medido pelo navegador e o resultado
 * das disputas. Sem dependência de servidor: recebe as linhas e devolve
 * os totais.
 */

export interface EventoLinha {
  disputa_id: string | null;
  ator: string;
  tipo: string;
  dados: { operador?: string | null; para?: string | null } | null;
  created_at: string;
}

export interface TempoLinha {
  operador: string;
  disputa_id: string | null;
  segundos: number;
}

export interface FechadaLinha {
  id: string;
  status: "ganhou" | "perdeu";
  cliente_id: string;
  /** valor contratado, ou o nosso lance se o contrato não foi lançado */
  valor: number | null;
  percentualExito: number | null;
  minutos: number;
}

export interface PorOperador {
  operador: string;
  acoes: number;
  disputas: number;
  enviadas: number;
  minutos: number;
}

export interface Metricas {
  porOperador: PorOperador[];
  minutosTotal: number;
  minutosEmDisputas: number;
  disputasComTempo: number;
  /** minutos humanos médios por licitação trabalhada */
  minutosPorDisputa: number | null;
  minutosPorGanha: number | null;
  enviadas: number;
  aprovadas: number;
  recusadas: number;
  analisesAutomaticas: number;
  editaisAutomaticos: number;
  ganhas: number;
  perdidas: number;
  taxaVitoria: number | null;
  valorGanho: number;
  exitoPrevisto: number;
  /** quanto do trabalho a máquina fez sozinha (análises e leituras) */
  fracaoAutomatica: number | null;
}

export function calcularMetricas(eventos: EventoLinha[], tempos: TempoLinha[], fechadas: FechadaLinha[]): Metricas {
  const ops = new Map<string, { acoes: number; disputas: Set<string>; enviadas: number; segundos: number }>();
  const op = (email: string) => {
    let o = ops.get(email);
    if (!o) ops.set(email, (o = { acoes: 0, disputas: new Set(), enviadas: 0, segundos: 0 }));
    return o;
  };

  let enviadas = 0;
  let aprovadas = 0;
  let recusadas = 0;
  let analisesAutomaticas = 0;
  let editaisAutomaticos = 0;
  let trabalhoHumano = 0;
  for (const e of eventos) {
    if (e.tipo === "enviada_ao_cliente") enviadas++;
    if (e.tipo === "aprovada_pelo_cliente") aprovadas++;
    if (e.tipo === "recusada_pelo_cliente") recusadas++;
    if (e.ator === "sistema" && e.tipo === "analise_ia") analisesAutomaticas++;
    if (e.ator === "sistema" && e.tipo === "edital_lido") editaisAutomaticos++;
    if (e.ator === "operador" && (e.tipo === "analise_ia" || e.tipo === "edital_lido")) trabalhoHumano++;
    if (e.ator !== "operador") continue;
    const o = op(e.dados?.operador || "sem nome");
    o.acoes++;
    if (e.disputa_id) o.disputas.add(e.disputa_id);
    if (e.tipo === "enviada_ao_cliente") o.enviadas++;
  }

  let segundosTotal = 0;
  let segundosEmDisputas = 0;
  const comTempo = new Set<string>();
  for (const t of tempos) {
    segundosTotal += t.segundos;
    op(t.operador).segundos += t.segundos;
    if (t.disputa_id) {
      segundosEmDisputas += t.segundos;
      comTempo.add(t.disputa_id);
    }
  }

  const ganhas = fechadas.filter((f) => f.status === "ganhou");
  const perdidas = fechadas.length - ganhas.length;
  const valorGanho = ganhas.reduce((s, f) => s + (f.valor ?? 0), 0);
  const exitoPrevisto = ganhas.reduce((s, f) => s + ((f.valor ?? 0) * (f.percentualExito ?? 0)) / 100, 0);
  const minutosGanhas = ganhas.reduce((s, f) => s + f.minutos, 0);
  const automatico = analisesAutomaticas + editaisAutomaticos;

  return {
    porOperador: [...ops.entries()]
      .map(([operador, o]) => ({
        operador,
        acoes: o.acoes,
        disputas: o.disputas.size,
        enviadas: o.enviadas,
        minutos: Math.round(o.segundos / 60),
      }))
      .sort((a, b) => b.minutos - a.minutos || b.acoes - a.acoes),
    minutosTotal: Math.round(segundosTotal / 60),
    minutosEmDisputas: Math.round(segundosEmDisputas / 60),
    disputasComTempo: comTempo.size,
    minutosPorDisputa: comTempo.size ? Math.round(segundosEmDisputas / 60 / comTempo.size) : null,
    minutosPorGanha: ganhas.length ? Math.round(minutosGanhas / ganhas.length) : null,
    enviadas,
    aprovadas,
    recusadas,
    analisesAutomaticas,
    editaisAutomaticos,
    ganhas: ganhas.length,
    perdidas,
    taxaVitoria: fechadas.length ? ganhas.length / fechadas.length : null,
    valorGanho,
    exitoPrevisto,
    fracaoAutomatica: automatico + trabalhoHumano ? automatico / (automatico + trabalhoHumano) : null,
  };
}

/** 95 → "1h35"; 40 → "40 min". */
export function formatarMinutos(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
