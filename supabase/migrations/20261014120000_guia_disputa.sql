-- Guia da disputa: passos do roteiro já cumpridos em cada disputa.
--   { "<fase>.<passo>": "<iso de quando marcou>" }
-- Os passos são fixos no código (src/lib/guia.ts).

alter table disputas add column if not exists guia jsonb not null default '{}'::jsonb;
