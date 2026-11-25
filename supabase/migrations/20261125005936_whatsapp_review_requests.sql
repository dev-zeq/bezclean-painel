create table public.whatsapp_review_requests (
  client_id uuid primary key references public.clientes(id) on delete cascade,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  message_id text
);

alter table public.whatsapp_review_requests enable row level security;
revoke all on public.whatsapp_review_requests from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_review_requests to service_role;
