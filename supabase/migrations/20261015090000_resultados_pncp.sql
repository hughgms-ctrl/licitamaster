-- Resultado oficial de cada licitação, consultado no PNCP depois do prazo:
-- quanto foi homologado em cada item e para quem. É a base de mercado da
-- inteligência de preço (vale para qualquer licitação coletada, não só as
-- que disputamos).
-- itens: [{ "numero": 1, "descricao": "...", "estimado": 1000, "homologado": 850,
--           "fornecedor": "...", "cnpj": "..." }]
create table if not exists resultados_pncp (
  licitacao_id        text primary key references licitacoes(numero_controle_pncp) on delete cascade,
  itens               jsonb not null default '[]'::jsonb,
  valor_estimado      numeric(16, 2),
  valor_homologado    numeric(16, 2),
  tem_resultado       boolean not null default false,
  consultado_em       timestamptz not null default now()
);
create index if not exists idx_resultados_pncp_consulta on resultados_pncp (tem_resultado, consultado_em);
alter table resultados_pncp enable row level security;
