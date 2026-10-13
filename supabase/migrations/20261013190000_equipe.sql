-- Equipe: quem pode entrar na mesa de operação.
--
-- O login é o Supabase Auth (e-mail e senha), mas ter conta no Auth não
-- basta: o e-mail precisa estar nesta lista. Assim o cadastro pode ficar
-- visível na tela sem virar porta aberta — uma pessoa de fora até cria o
-- usuário no Auth, mas não passa da tela de entrada.
--
-- A primeira conta criada vira `admin` (o sistema faz isso quando a lista
-- está vazia). Depois, só o admin libera e-mails novos.

create table if not exists operadores (
  email          text primary key check (email = lower(email)),
  nome           text,
  papel          text not null default 'operador' check (papel in ('admin', 'operador')),
  liberado_por   text,
  created_at     timestamptz not null default now()
);
alter table operadores enable row level security;
