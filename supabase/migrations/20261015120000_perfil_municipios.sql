-- Área de atuação por cidade: além dos estados inteiros (ufs), o perfil pode
-- atender cidades soltas, como "Serra/ES". ufs e municipios vazios = Brasil inteiro.
alter table perfis add column if not exists municipios text[] not null default '{}';
