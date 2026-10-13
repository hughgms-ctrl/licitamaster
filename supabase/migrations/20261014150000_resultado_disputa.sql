-- Resultado de cada disputa: o nosso último lance, o lance vencedor e os
-- concorrentes. A sessão acontece fora do sistema (Compras.gov.br e outros
-- portais), então o operador registra à mão. É a matéria-prima da
-- inteligência de preço: por quanto se ganha cada tipo de coisa.
--
-- concorrentes: [{ "nome": "...", "cnpj": "...", "lance": 190100 }]

create table if not exists resultados_disputa (
  disputa_id      uuid primary key references disputas(id) on delete cascade,
  licitacao_id    text not null references licitacoes(numero_controle_pncp) on delete cascade,
  nosso_lance     numeric(14, 2),
  posicao         int check (posicao is null or posicao >= 1),
  participantes   int check (participantes is null or participantes >= 1),
  vencedor_nome   text,
  vencedor_lance  numeric(14, 2),
  concorrentes    jsonb not null default '[]'::jsonb,
  observacao      text,
  registrado_por  text,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_resultados_licitacao on resultados_disputa (licitacao_id);
alter table resultados_disputa enable row level security;
