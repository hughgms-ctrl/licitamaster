/**
 * Ordem da triagem: o que olhar primeiro. Não esconde nada; só decide quem
 * vem antes. Soma a nota do perfil, o veredito da IA (quando já analisou) e
 * a urgência do prazo. Sem dependência de servidor: a mesa e o agendador usam.
 */
export function prioridade(
  d: { score: number; analise_ia?: { veredito?: string | null } | null },
  encerramento: string | null | undefined,
  agora = Date.now()
): number {
  let p = d.score;
  const v = d.analise_ia?.veredito;
  if (v === "vale_a_pena") p += 40;
  else if (v === "talvez") p += 10;
  else if (v === "nao_vale") p -= 60;
  if (encerramento) {
    const horas = (new Date(encerramento).getTime() - agora) / 36e5;
    if (horas >= 0 && horas < 48) p += 20;
    else if (horas >= 0 && horas < 24 * 7) p += 8;
  }
  return p;
}
