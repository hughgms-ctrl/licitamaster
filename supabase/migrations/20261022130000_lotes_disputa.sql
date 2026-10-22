-- Licitação em lotes: os que o cliente escolheu no portal, com o preço
-- mínimo de cada um. preco_minimo continua sendo a soma.
-- [{ "chave": "L1", "rotulo": "Lote 1", "descricao": "...", "valor_estimado": 1000, "preco_minimo": 900 }]
alter table disputas add column if not exists lotes jsonb;
