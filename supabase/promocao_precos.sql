-- Promoção global da Tabela de Preços (uma linha por usuário).
-- Quando ativa, o preço da modalidade "Desconto" dos serviços do escopo passa a ser Normal - percentual,
-- calculado no painel; nenhum valor de catalogo_precos é alterado. categorias vazio = todas.
begin;

create table if not exists public.promocao_precos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) unique,
  ativa boolean not null default false,
  percentual numeric(5,2) not null default 0 check (percentual >= 0 and percentual <= 100),
  categorias text[] not null default '{}',
  ate date,
  updated_at timestamptz not null default now()
);

alter table public.promocao_precos enable row level security;
drop policy if exists promocao_precos_owner on public.promocao_precos;
create policy promocao_precos_owner on public.promocao_precos for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

commit;
