-- Licitação Master — schema inicial
-- Aplicado pela integração Supabase ↔ GitHub a cada push (pasta
-- supabase/migrations). Também roda à mão no SQL Editor: é idempotente.
--
-- Modelo:
--   clientes ──< perfis           o que cada cliente vende (filtros de busca)
--   licitacoes                    espelho do PNCP, uma linha por contratação
--   clientes ──< disputas >── licitacoes
--                                 a decisão: este cliente disputa esta licitação?
--   eventos                       trilha de auditoria, só cresce

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- CLIENTES — as empresas em nome de quem você disputa
-- ─────────────────────────────────────────────────────────────
create table if not exists clientes (
  id              uuid primary key default gen_random_uuid(),
  razao_social    text not null,
  nome_fantasia   text,
  cnpj            text not null unique,              -- só dígitos
  -- ME/EPP têm exclusividade em itens de até R$ 80 mil e preferência no
  -- desempate (LC 123/2006). Muda a estratégia, então fica explícito.
  porte           text not null default 'ME' check (porte in ('MEI','ME','EPP','demais')),
  contato_nome    text,
  whatsapp        text,                              -- 55 + DDD + número
  email           text,
  -- O que a IA lê para decidir se a licitação serve: o que vende, como
  -- entrega, onde atua, o que NÃO consegue fazer. Quanto mais honesto, menos
  -- licitação errada chega para o cliente aprovar.
  contexto        text not null default '',
  ativo           boolean not null default true,
  -- Link do portal do cliente: /c/<token_portal>. Regenerar invalida o antigo.
  token_portal    text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- PERFIS DE BUSCA — um cliente pode ter vários
-- ─────────────────────────────────────────────────────────────
create table if not exists perfis (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id) on delete cascade,
  nome              text not null,
  ativo             boolean not null default true,
  -- [{ "termo": "manutencao predial", "peso": 40 }, ...]
  termos_positivos  jsonb not null default '[]'::jsonb,
  termos_negativos  text[] not null default '{}',
  ufs               text[] not null default '{}',     -- vazio = Brasil inteiro
  valor_min         numeric,
  valor_max         numeric,
  score_minimo      int not null default 25,
  score_alerta      int not null default 60,
  created_at        timestamptz not null default now()
);
create index if not exists idx_perfis_cliente on perfis (cliente_id);

-- ─────────────────────────────────────────────────────────────
-- LICITAÇÕES — espelho do PNCP
-- Só entra o que casou com o perfil de algum cliente. `raw` guarda o JSON
-- inteiro: dá para repontuar sem recoletar.
-- ─────────────────────────────────────────────────────────────
create table if not exists licitacoes (
  numero_controle_pncp        text primary key,
  modalidade_id               int,
  modalidade_nome             text,
  objeto                      text,
  processo                    text,
  orgao_cnpj                  text,
  orgao_razao_social          text,
  unidade_nome                text,
  uf                          text,
  municipio                   text,
  codigo_ibge                 text,
  valor_estimado              numeric,
  srp                         boolean,
  situacao                    text,
  amparo_legal                text,
  modo_disputa                text,
  data_abertura_proposta      timestamptz,
  data_encerramento_proposta  timestamptz,
  data_publicacao_pncp        timestamptz,
  data_atualizacao_pncp       timestamptz,
  link_sistema_origem         text,
  link_pncp                   text,
  raw                         jsonb not null,
  revisoes                    int not null default 0,   -- quantas vezes o edital mudou
  primeira_coleta             timestamptz not null default now(),
  ultima_coleta               timestamptz not null default now()
);
create index if not exists idx_lic_encerramento on licitacoes (data_encerramento_proposta);
create index if not exists idx_lic_uf           on licitacoes (uf);
create index if not exists idx_lic_objeto_fts   on licitacoes using gin (to_tsvector('portuguese', coalesce(objeto,'')));

-- ─────────────────────────────────────────────────────────────
-- DISPUTAS — licitação × cliente
--
-- Fluxo:
--   sugerida ──► aguardando_cliente ──► aprovada ──► em_preparacao
--      │                 │                              │
--      ▼                 ▼                              ▼
--   descartada        recusada                   proposta_enviada ──► em_disputa
--                                                                       │
--                                                   ganhou / perdeu / desistiu
--
-- `sugerida` é o robô dizendo "isto casa com o perfil". Nada chega ao
-- cliente sem você mandar.
-- ─────────────────────────────────────────────────────────────
create table if not exists disputas (
  id                    uuid primary key default gen_random_uuid(),
  licitacao_id          text not null references licitacoes(numero_controle_pncp) on delete cascade,
  cliente_id            uuid not null references clientes(id) on delete cascade,
  perfil_id             uuid references perfis(id) on delete set null,
  score                 int not null default 0,
  termos_encontrados    text[] not null default '{}',
  status                text not null default 'sugerida',
  analise_ia            jsonb,
  -- Decisão do cliente. O piso é DELE: é quem conhece custo e margem. O
  -- sistema nunca propõe nem dá lance abaixo disso.
  preco_minimo          numeric,
  motivo_recusa         text,
  notas_cliente         text,
  notas_operador        text,
  enviado_cliente_em    timestamptz,
  respondido_em         timestamptz,
  notificado_em         timestamptz,                  -- alerta ao operador
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (licitacao_id, cliente_id)
);

alter table disputas drop constraint if exists disputas_status_check;
alter table disputas add constraint disputas_status_check check (status in (
  'sugerida','descartada','aguardando_cliente','recusada','aprovada',
  'em_preparacao','proposta_enviada','em_disputa','ganhou','perdeu','desistiu'
));

-- Aprovar exige piso. Sem isso um "sim" sem preço passaria para a montagem
-- da proposta e alguém teria que chutar o valor.
alter table disputas drop constraint if exists disputas_aprovada_tem_piso;
alter table disputas add constraint disputas_aprovada_tem_piso check (
  status not in ('aprovada','em_preparacao','proposta_enviada','em_disputa','ganhou')
  or (preco_minimo is not null and preco_minimo > 0)
);

-- ─── A REGRA MAIS IMPORTANTE DO SISTEMA ─────────────────────
-- Um único cliente por licitação, a partir do momento em que ela sai da
-- sua mesa. O mesmo operador representando dois concorrentes na mesma
-- disputa é o padrão clássico de conluio que o TCU rastreia (mesmo
-- representante, mesmo IP) e é crime pela Lei 14.133.
--
-- Fica no banco, e não só na tela, para que nenhum bug, script ou clique
-- duplo consiga violar. Granularidade por licitação inteira, de propósito
-- conservadora: separar por lote/item fica para quando os itens forem
-- coletados.
create unique index if not exists uniq_disputa_cliente_unico
  on disputas (licitacao_id)
  where status in ('aguardando_cliente','aprovada','em_preparacao',
                   'proposta_enviada','em_disputa','ganhou');

create index if not exists idx_disp_status  on disputas (status);
create index if not exists idx_disp_cliente on disputas (cliente_id);

create or replace function tocar_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_disputas_updated on disputas;
create trigger trg_disputas_updated before update on disputas
  for each row execute function tocar_updated_at();

-- ─────────────────────────────────────────────────────────────
-- EVENTOS — trilha de auditoria
-- Cada "sim", cada piso, cada mudança de etapa, com quem, quando e de onde.
-- É o que te protege se um cliente disser "eu nunca aprovei isso".
-- Só aceita INSERT: o trigger barra UPDATE e DELETE até para o service_role.
-- ─────────────────────────────────────────────────────────────
create table if not exists eventos (
  id           bigserial primary key,
  disputa_id   uuid references disputas(id) on delete set null,
  cliente_id   uuid references clientes(id) on delete set null,
  ator         text not null check (ator in ('operador','cliente','sistema')),
  tipo         text not null,
  dados        jsonb not null default '{}'::jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_eventos_disputa on eventos (disputa_id);

create or replace function eventos_imutaveis() returns trigger language plpgsql as $$
begin
  -- O ON DELETE SET NULL das FKs dispara UPDATE aqui; esse é o único
  -- UPDATE permitido (apagar um cliente não pode travar no histórico).
  if tg_op = 'UPDATE'
     and (new.disputa_id is null or new.disputa_id = old.disputa_id)
     and (new.cliente_id is null or new.cliente_id = old.cliente_id)
     and new.id = old.id and new.ator = old.ator and new.tipo = old.tipo
     and new.dados = old.dados and new.created_at = old.created_at
     and new.ip is not distinct from old.ip
     and new.user_agent is not distinct from old.user_agent then
    return new;
  end if;
  raise exception 'eventos é só-inserção: auditoria não se edita';
end $$;
drop trigger if exists trg_eventos_imutaveis on eventos;
create trigger trg_eventos_imutaveis before update or delete on eventos
  for each row execute function eventos_imutaveis();

-- ─────────────────────────────────────────────────────────────
-- MOVER DISPUTA — mudança de etapa + auditoria na MESMA transação.
-- Feito no banco porque o supabase-js não tem transação: em duas chamadas,
-- uma aprovação podia ser gravada sem o evento (ou o evento sem a aprovação).
--
-- `p_de` é a lista de etapas de onde a mudança vale. Se a disputa não está
-- em nenhuma delas (outro clique chegou antes, o cliente já respondeu), nada
-- muda e a função falha com 'transicao_invalida'.
-- `p_cliente`, quando informado, exige que a disputa seja daquele cliente:
-- é o que impede o token de um cliente de mexer na disputa de outro.
-- ─────────────────────────────────────────────────────────────
create or replace function mover_disputa(
  p_disputa       uuid,
  p_de            text[],
  p_para          text,
  p_ator          text,
  p_tipo          text,
  p_dados         jsonb   default '{}'::jsonb,
  p_ip            text    default null,
  p_user_agent    text    default null,
  p_cliente       uuid    default null,
  p_preco_minimo  numeric default null,
  p_motivo        text    default null,
  p_notas_cliente text    default null
) returns disputas language plpgsql as $$
declare
  d disputas;
  anterior text;
begin
  select status into anterior from disputas where id = p_disputa for update;

  update disputas set
    status             = p_para,
    preco_minimo       = coalesce(p_preco_minimo, preco_minimo),
    motivo_recusa      = coalesce(p_motivo, motivo_recusa),
    notas_cliente      = coalesce(p_notas_cliente, notas_cliente),
    enviado_cliente_em = case when p_para = 'aguardando_cliente' then now() else enviado_cliente_em end,
    respondido_em      = case when p_ator = 'cliente' then now() else respondido_em end
  where id = p_disputa
    and status = any(p_de)
    and (p_cliente is null or cliente_id = p_cliente)
  returning * into d;

  if not found then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;

  insert into eventos (disputa_id, cliente_id, ator, tipo, dados, ip, user_agent)
  values (
    d.id, d.cliente_id, p_ator, p_tipo,
    p_dados || jsonb_build_object(
      'de', anterior, 'para', p_para,
      'preco_minimo', p_preco_minimo, 'motivo', p_motivo
    ),
    p_ip, p_user_agent
  );

  return d;
end $$;

-- Só o servidor (service_role) pode mover disputa. No Supabase, função em
-- `public` nasce executável por anon e authenticated — ou seja, por quem
-- tiver a chave publicável. Sem este revoke, qualquer um chamaria
-- /rest/v1/rpc/mover_disputa direto e aprovaria disputas.
revoke execute on function mover_disputa(uuid, text[], text, text, text, jsonb, text, text, uuid, numeric, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function mover_disputa(uuid, text[], text, text, text, jsonb, text, text, uuid, numeric, text, text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function mover_disputa(uuid, text[], text, text, text, jsonb, text, text, uuid, numeric, text, text) to service_role';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- LOG E CURSOR DA COLETA (herdados do radar)
-- ─────────────────────────────────────────────────────────────
create table if not exists sync_runs (
  id              bigserial primary key,
  iniciado_em     timestamptz not null default now(),
  finalizado_em   timestamptz,
  modalidades     int[],
  ciclo           int,
  paginas         int not null default 0,
  paginas_puladas int not null default 0,
  registros       int not null default 0,
  novos           int not null default 0,
  atualizados     int not null default 0,
  alertas         int not null default 0,
  truncado        boolean not null default false,
  erro            text
);

create table if not exists coleta_estado (
  id                int primary key default 1,
  modalidade        int,
  uf                text,
  pagina            int not null default 1,
  ciclo             int not null default 1,
  ciclo_iniciado_em timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint coleta_estado_linha_unica check (id = 1)
);
insert into coleta_estado (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- RLS: tudo trancado. O app fala com o banco só pelo service_role, no
-- servidor. O portal do cliente também passa pelo servidor (token na URL),
-- nunca acessa o Supabase direto.
-- ─────────────────────────────────────────────────────────────
alter table clientes      enable row level security;
alter table perfis        enable row level security;
alter table licitacoes    enable row level security;
alter table disputas      enable row level security;
alter table eventos       enable row level security;
alter table sync_runs     enable row level security;
alter table coleta_estado enable row level security;
