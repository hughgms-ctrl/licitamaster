-- Configurações do sistema editadas pelo painel (hoje: o motor de IA).
--
-- Uma linha por assunto (`chave`), com o conteúdo em `valor`. Segredos (a
-- chave de API) entram já cifrados pelo servidor com AES-256-GCM: quem ler a
-- tabela — inclusive por um backup vazado — não vê a chave.

create table if not exists configuracoes (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now()
);

alter table configuracoes enable row level security;
