-- Reversão da regra "estofados concluído = pago". Não desfaz a marcação dos antigos como pagos.
begin;
drop trigger if exists agendamentos_estofados_concluido_pago on public.agendamentos;
drop function if exists public.agendamentos_estofados_concluido_pago();
commit;
