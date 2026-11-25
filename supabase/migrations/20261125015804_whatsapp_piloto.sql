create table public.whatsapp_piloto_mensagens (
  message_id text primary key,
  received_at timestamptz not null default now(),
  sender text not null check (sender = '5547920039182'),
  kind text not null,
  body jsonb not null,
  processed_at timestamptz
);
alter table public.whatsapp_piloto_mensagens enable row level security;
revoke all on public.whatsapp_piloto_mensagens from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_piloto_mensagens to service_role;
