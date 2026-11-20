begin;

create schema assistente_bez_private;

create table assistente_bez_private.quota (
  dia date not null,
  titular text not null,
  total integer not null check (total > 0),
  minuto timestamptz not null,
  total_minuto integer not null check (total_minuto > 0),
  primary key (dia, titular)
);

alter table assistente_bez_private.quota enable row level security;
revoke all on schema assistente_bez_private from public, anon, authenticated;
revoke all on assistente_bez_private.quota from public, anon, authenticated;
grant usage on schema assistente_bez_private to service_role;
grant select, insert, update, delete on assistente_bez_private.quota to service_role;

create function public.assistente_bez_reservar_consulta(p_usuario uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  instante timestamptz;
  hoje date;
  minuto_atual timestamptz;
  global_total integer;
  usuario assistente_bez_private.quota%rowtype;
begin
  if p_usuario is null then
    raise exception 'Usuário obrigatório';
  end if;

  -- Uma única reserva por vez para limitar também o orçamento global.
  perform pg_catalog.pg_advisory_xact_lock(176845723, 1);
  instante := pg_catalog.clock_timestamp();
  hoje := (instante at time zone 'America/Sao_Paulo')::date;
  minuto_atual := pg_catalog.date_trunc('minute', instante);

  select total into global_total from assistente_bez_private.quota
  where dia = hoje and titular = 'global';
  select * into usuario from assistente_bez_private.quota
  where dia = hoje and titular = p_usuario::text;

  if global_total >= 200 or usuario.total >= 30 then return 'dia'; end if;
  if usuario.minuto = minuto_atual and usuario.total_minuto >= 5 then return 'minuto'; end if;

  delete from assistente_bez_private.quota where dia < hoje;
  insert into assistente_bez_private.quota as q (dia, titular, total, minuto, total_minuto)
  values (hoje, 'global', 1, minuto_atual, 1), (hoje, p_usuario::text, 1, minuto_atual, 1)
  on conflict (dia, titular) do update
    set total = q.total + 1,
        total_minuto = case when q.minuto = excluded.minuto then q.total_minuto + 1 else 1 end,
        minuto = excluded.minuto;
  return 'ok';
end;
$$;

revoke execute on function public.assistente_bez_reservar_consulta(uuid) from public, anon, authenticated;
grant execute on function public.assistente_bez_reservar_consulta(uuid) to service_role;

commit;
