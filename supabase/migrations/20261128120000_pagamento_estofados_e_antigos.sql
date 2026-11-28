-- Pagamento dos atendimentos.
-- Estofados: a equipe só conclui depois de receber, então concluir = pago.
-- Faxinas e apartamentos: podem pagar depois; o painel e o Assistente Bez marcam o pagamento à mão.
begin;

-- Concluídos antigos que ficaram como pendentes passam a pagos (pedido da equipe em 28/11/2026).
update public.agendamentos
   set status_pagamento = 'pago'
 where status = 'concluido'
   and status_pagamento = 'pendente';

create function public.agendamentos_estofados_concluido_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'estofados' and new.status = 'concluido' and new.status_pagamento = 'pendente' then
    new.status_pagamento := 'pago';
  end if;
  return new;
end;
$$;

revoke all on function public.agendamentos_estofados_concluido_pago() from public, anon, authenticated;

create trigger agendamentos_estofados_concluido_pago
before insert or update of status, tipo on public.agendamentos
for each row execute function public.agendamentos_estofados_concluido_pago();

commit;
