-- Dados do cliente que vão na proposta de preços: endereço e representante
-- legal (quem assina). Antes eram digitados a cada proposta.
alter table clientes add column if not exists endereco text;
alter table clientes add column if not exists cidade_uf text;
alter table clientes add column if not exists representante_nome text;
alter table clientes add column if not exists representante_cpf text;
alter table clientes add column if not exists representante_cargo text;

-- Proposta ajustada salva: o que o operador conferiu e editou na tela
-- (itens, valores, condições). Uma por disputa; salvar de novo substitui.
create table if not exists propostas_disputa (
  disputa_id   uuid primary key references disputas(id) on delete cascade,
  dados        jsonb not null,
  total        numeric(14, 2),
  salvo_por    text,
  updated_at   timestamptz not null default now()
);
alter table propostas_disputa enable row level security;
