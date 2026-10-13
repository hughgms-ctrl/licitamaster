-- Preparação do cliente: o que precisa estar pronto antes da primeira disputa
-- (conta gov.br, SICAF, procuração, dados bancários...). Os itens são fixos
-- no código (src/lib/preparo.ts); aqui fica só a situação de cada um:
--   { "<item>": { "status": "pendente|cliente_informou|feito|nao_se_aplica",
--                 "nota": "...", "em": "<iso>", "por": "<email ou cliente>" } }
-- Os documentos de habilitação não ficam aqui: saem do cofre.

alter table clientes add column if not exists preparo jsonb not null default '{}'::jsonb;
