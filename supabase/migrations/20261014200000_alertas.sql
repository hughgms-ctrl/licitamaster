-- Alertas automáticos já enviados, para não repetir o mesmo aviso todo dia.
-- chave: "doc:<id do documento>:<situação>", "sessao:<disputa>:<data>",
--        "pend:<disputa>:<tipo do documento>:<situação>".
create table if not exists alertas_enviados (
  chave       text primary key,
  enviado_em  timestamptz not null default now()
);
alter table alertas_enviados enable row level security;
