-- Depois de ganhar: o contrato e o que acontece com ele (empenho, entrega,
-- nota fiscal, pagamento do órgão). Uma linha por disputa ganha.
-- eventos: [{ "id": "...", "tipo": "empenho|entrega|nota|pagamento", "data": "2026-10-20",
--             "valor": 12345.67, "descricao": "..." }]
create table if not exists contratos_disputa (
  disputa_id        uuid primary key references disputas(id) on delete cascade,
  numero            text,
  valor_contratado  numeric(14, 2),
  assinado_em       date,
  vigencia_fim      date,
  eventos           jsonb not null default '[]'::jsonb,
  observacao        text,
  atualizado_por    text,
  updated_at        timestamptz not null default now()
);
alter table contratos_disputa enable row level security;

-- Como cada cliente paga a assessoria.
alter table clientes add column if not exists mensalidade numeric(12, 2);
alter table clientes add column if not exists percentual_exito numeric(5, 2);
alter table clientes add column if not exists asaas_cliente_id text;

-- Cobranças feitas ao cliente (mensalidade ou êxito). Com o Asaas
-- configurado, guarda o id e o link da fatura; sem ele, é só o registro.
create table if not exists cobrancas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  tipo          text not null check (tipo in ('mensalidade', 'exito')),
  referencia    text not null,
  valor         numeric(12, 2) not null check (valor > 0),
  vencimento    date not null,
  asaas_id      text,
  link          text,
  situacao      text not null default 'emitida',
  criado_por    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cobrancas_cliente on cobrancas (cliente_id, created_at desc);
alter table cobrancas enable row level security;
