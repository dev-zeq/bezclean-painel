-- Desfaz supabase/agenda_unificada.sql.
-- ATENÇÃO: só execute depois de conferir que não há limpezas de apartamento que você queira manter.
-- O passo 1 falha de propósito se existir agendamento sem cliente, para não perder dados.

-- 1) Cliente volta a ser obrigatório (falha se houver agendamento só de apartamento).
alter table public.agendamentos drop constraint if exists agendamentos_destino_check;
alter table public.agendamentos alter column cliente_id set not null;

-- 2) Remove tipo e vínculo com apartamento.
drop index if exists public.agendamentos_apartamento_idx;
alter table public.agendamentos drop constraint if exists agendamentos_tipo_check;
alter table public.agendamentos drop column if exists apartamento_id;
alter table public.agendamentos drop column if exists tipo;

-- 3) Remove o cadastro de apartamentos.
drop table if exists public.apartamentos;

-- O valor 'provisorio' do tipo status_agendamento permanece: o Postgres não remove valores de enum.
-- Ele é inofensivo se nenhum agendamento o usar.
