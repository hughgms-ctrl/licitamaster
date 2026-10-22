-- Tempo de trabalho da equipe, medido sozinho: enquanto a mesa ou a página
-- de uma licitação está aberta e a pessoa mexe nela, o navegador conta os
-- segundos e manda em blocos. disputa_id nulo = tempo na triagem/mesa.
create table if not exists tempo_trabalho (
  id          bigserial primary key,
  operador    text not null,
  disputa_id  uuid references disputas(id) on delete set null,
  cliente_id  uuid references clientes(id) on delete set null,
  segundos    integer not null check (segundos > 0 and segundos <= 900),
  created_at  timestamptz not null default now()
);
create index if not exists idx_tempo_criado on tempo_trabalho (created_at desc);
create index if not exists idx_tempo_disputa on tempo_trabalho (disputa_id);
alter table tempo_trabalho enable row level security;
