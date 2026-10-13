-- Etapa 2: ficha do edital (leitura por IA) e cofre de documentos do cliente.

-- ─────────────────────────────────────────────────────────────
-- FICHAS DE EDITAL
-- Uma por licitação: o edital é o mesmo para qualquer cliente. O que muda
-- por cliente (quais documentos ele já tem) é calculado na hora, cruzando
-- `documentos_exigidos` com o cofre dele.
-- ─────────────────────────────────────────────────────────────
create table if not exists fichas_edital (
  licitacao_id     text primary key references licitacoes(numero_controle_pncp) on delete cascade,
  ficha            jsonb not null,
  -- quais arquivos do PNCP a IA leu: [{titulo, paginas?, bytes}]
  arquivos_lidos   jsonb not null default '[]'::jsonb,
  -- data de atualização do edital no PNCP quando a ficha foi gerada:
  -- se o edital for retificado depois, a ficha está velha
  versao_pncp      timestamptz,
  modelo           text,
  gerado_em        timestamptz not null default now()
);
alter table fichas_edital enable row level security;

-- ─────────────────────────────────────────────────────────────
-- COFRE DE DOCUMENTOS
-- Certidões, contrato social, atestados… de cada cliente. O arquivo fica no
-- Storage (bucket privado `documentos`); aqui fica o que importa para a
-- habilitação: o tipo e até quando vale.
-- ─────────────────────────────────────────────────────────────
create table if not exists documentos_cliente (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  tipo           text not null,
  descricao      text,
  arquivo_path   text not null,
  nome_arquivo   text not null,
  bytes          int,
  emitido_em     date,
  validade       date,               -- null = não vence (ex: contrato social)
  enviado_por    text not null check (enviado_por in ('operador','cliente')),
  -- o que a IA leu do arquivo, para conferência
  leitura_ia     jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_docs_cliente on documentos_cliente (cliente_id, tipo);
alter table documentos_cliente enable row level security;

-- Bucket privado: só o servidor (service_role) lê e escreve. O navegador
-- envia o arquivo por uma URL assinada de uso único que o servidor gera.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
