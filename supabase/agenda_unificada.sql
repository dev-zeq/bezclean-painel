-- Agenda unificada: estofados, faxinas e limpezas de apartamentos no mesmo calendário.
-- Migração somente aditiva: não altera nem apaga registros existentes.
-- Agendamentos atuais ficam com tipo = 'estofados' (valor padrão da nova coluna).

-- 1) Status "provisório" (executar sozinho, antes do restante).
alter type public.status_agendamento add value if not exists 'provisorio' before 'agendado';

-- 2) Cadastro de apartamentos.
create table if not exists public.apartamentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  edificio text,
  endereco text,
  contato_nome text,
  contato_telefone text,
  observacoes text,
  ativo boolean not null default true,
  airbnb boolean not null default false, -- apartamento administrado pela Bez Clean no Airbnb
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.apartamentos add column if not exists airbnb boolean not null default false;
create index if not exists apartamentos_owner_idx on public.apartamentos (owner_id);
alter table public.apartamentos enable row level security;
drop policy if exists "Apartamento: proprietário acessa seus dados" on public.apartamentos;
create policy "Apartamento: proprietário acessa seus dados" on public.apartamentos
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
revoke all on public.apartamentos from anon;
grant select, insert, update, delete on public.apartamentos to authenticated;

-- 3) Tipo de atendimento e vínculo com apartamento nos agendamentos.
alter table public.agendamentos
  add column if not exists tipo text not null default 'estofados',
  add column if not exists apartamento_id uuid references public.apartamentos(id) on delete restrict;
alter table public.agendamentos drop constraint if exists agendamentos_tipo_check;
alter table public.agendamentos add constraint agendamentos_tipo_check
  check (tipo in ('estofados', 'faxina', 'apartamento'));
create index if not exists agendamentos_apartamento_idx on public.agendamentos (apartamento_id)
  where apartamento_id is not null;

-- 4) Limpeza de apartamento não tem cliente: cliente passa a ser opcional,
--    desde que exista cliente OU apartamento.
alter table public.agendamentos alter column cliente_id drop not null;
alter table public.agendamentos drop constraint if exists agendamentos_destino_check;
alter table public.agendamentos add constraint agendamentos_destino_check
  check (cliente_id is not null or apartamento_id is not null);
