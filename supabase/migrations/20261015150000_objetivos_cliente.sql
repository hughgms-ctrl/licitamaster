-- Objetivos do cliente (perfil, risco, capital, lucro, meta e prazo). A IA usa
-- para avaliar cada licitação e a calculadora de preço, para o lucro mínimo.
alter table clientes add column if not exists objetivos jsonb not null default '{}'::jsonb;
