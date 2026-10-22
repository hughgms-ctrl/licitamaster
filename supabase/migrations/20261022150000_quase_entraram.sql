-- Licitações que ficaram de fora por pouco: casaram termos do ramo do
-- cliente, mas a nota não chegou no mínimo, ou um veto (termo negativo,
-- faixa de valor, área) cortou. Uma linha por licitação e cliente; a coleta
-- atualiza e apaga as de prazo vencido. `raw` guarda a contratação do PNCP
-- para trazer para a triagem sem buscar de novo.
create table if not exists quase_entraram (
  numero_controle_pncp        text not null,
  cliente_id                  uuid not null references clientes(id) on delete cascade,
  perfil_id                   uuid references perfis(id) on delete set null,
  score                       integer not null,
  termos                      text[] not null default '{}',
  tipo                        text not null,
  motivo                      text not null,
  objeto                      text,
  orgao                       text,
  uf                          text,
  municipio                   text,
  modalidade                  text,
  valor_estimado              numeric(16, 2),
  data_encerramento_proposta  timestamptz,
  link                        text,
  raw                         jsonb not null,
  visto_em                    timestamptz not null default now(),
  primary key (numero_controle_pncp, cliente_id)
);
create index if not exists idx_quase_cliente on quase_entraram (cliente_id, data_encerramento_proposta);
alter table quase_entraram enable row level security;
