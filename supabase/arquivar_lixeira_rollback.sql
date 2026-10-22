-- Reverte arquivar_lixeira.sql. ATENÇÃO: registros hoje arquivados/na lixeira voltam a aparecer
-- (as colunas deixam de existir). Para preservar o estado, exporte antes:
--   select id from public.orcamentos where excluido_em is not null; (idem agendamentos / clientes.arquivado_em)
begin;
drop function if exists public.orcamento_excluir(uuid,boolean);
drop function if exists public.orcamento_restaurar(uuid);
drop function if exists public.agendamento_excluir(uuid);
drop function if exists public.agendamento_restaurar(uuid);
drop trigger  if exists agendamentos_proteger_lixeira on public.agendamentos;
drop function if exists public.agendamentos_proteger_lixeira();
-- Restaura a versão anterior de campanha_agendar_orcamento (sem os filtros de lixeira)
create or replace function public.campanha_agendar_orcamento(p_orcamento_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_endereco text default null::text)
returns uuid language plpgsql set search_path to '' as $function$
declare q public.orcamentos; novo uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':agenda_campanha',0));
  select * into q from public.orcamentos where id=p_orcamento_id and owner_id=auth.uid() for update;
  if not found or q.campanha_cliente_id is null then raise exception 'Orçamento da campanha não encontrado.'; end if;
  if q.agendamento_id is not null then return q.agendamento_id; end if;
  if q.status in ('recusado','expirado') then raise exception 'Revise a situação do orçamento antes de agendar.'; end if;
  if p_inicio is null or p_fim is null or p_fim<p_inicio+interval '30 minutes' then raise exception 'Informe data e duração válidas.'; end if;
  if exists(select 1 from public.agendamentos where owner_id=auth.uid() and status<>'cancelado' and inicio_em<p_fim and fim_em>p_inicio)
     or exists(select 1 from public.bloqueios_agenda where owner_id=auth.uid() and inicio_em<p_fim and fim_em>p_inicio) then
    raise exception 'Este horário está ocupado ou bloqueado. Escolha outro.'; end if;
  if not exists(select 1 from public.orcamento_itens where orcamento_id=q.id) then raise exception 'Adicione serviços ao orçamento.'; end if;
  insert into public.agendamentos(cliente_id,inicio_em,fim_em,endereco,descricao_servico,valor,observacoes,campanha_cliente_id)
    values(q.cliente_id,p_inicio,p_fim,p_endereco,
      (select string_agg(quantidade||'× '||nome,' + ') from public.orcamento_itens where orcamento_id=q.id),
      q.valor_total,q.observacoes,q.campanha_cliente_id) returning id into novo;
  insert into public.agendamento_itens(agendamento_id,catalogo_preco_id,nome,quantidade,valor_unitario,valor_total,observacoes)
    select novo,catalogo_preco_id,nome,quantidade,valor_unitario,valor_total,observacoes from public.orcamento_itens where orcamento_id=q.id;
  update public.orcamentos set status='aprovado',agendamento_id=novo,updated_at=now() where id=q.id;
  return novo;
end;
$function$;
drop index if exists public.clientes_arquivado_idx, public.orcamentos_excluido_idx, public.agendamentos_excluido_idx;
alter table public.orcamentos   drop column if exists agendamento_excluido_id;
alter table public.orcamentos   drop column if exists excluido_em;
alter table public.agendamentos drop column if exists excluido_em;
alter table public.clientes     drop column if exists arquivado_em;
commit;
