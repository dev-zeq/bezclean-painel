-- Execute somente se também for necessário retirar o controle de cotas,
-- depois de desativar assistente-bez. As contagens serão descartadas.
begin;

drop function if exists public.assistente_bez_reservar_consulta(uuid);
drop table if exists assistente_bez_private.quota;
drop schema if exists assistente_bez_private;

commit;
