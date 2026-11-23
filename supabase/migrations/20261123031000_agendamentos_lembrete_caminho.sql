-- Controle de "Aviso a caminho / Atraso" para agendamentos de estofados (OpenBot).
-- Migração aditiva: mantém queries, RPCs e políticas RLS (owner_id) atuais intactas.

begin;

alter table public.agendamentos
  add column if not exists lembrete_caminho_modo text not null default 'automatico',
  add column if not exists lembrete_caminho_novo_horario text null,
  add column if not exists lembrete_caminho_observacao text null,
  add column if not exists lembrete_caminho_status text not null default 'pendente',
  add column if not exists lembrete_caminho_enviado_em timestamptz null,
  add column if not exists lembrete_caminho_atualizado_em timestamptz null;

alter table public.agendamentos
  drop constraint if exists agendamentos_lembrete_caminho_modo_check,
  add constraint agendamentos_lembrete_caminho_modo_check
    check (lembrete_caminho_modo in ('automatico', 'atraso', 'pausado'));

alter table public.agendamentos
  drop constraint if exists agendamentos_lembrete_caminho_status_check,
  add constraint agendamentos_lembrete_caminho_status_check
    check (lembrete_caminho_status in ('pendente', 'enviado', 'pulado'));

alter table public.agendamentos
  drop constraint if exists agendamentos_lembrete_caminho_novo_horario_check,
  add constraint agendamentos_lembrete_caminho_novo_horario_check
    check (
      lembrete_caminho_novo_horario is null
      or lembrete_caminho_novo_horario ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );

commit;
