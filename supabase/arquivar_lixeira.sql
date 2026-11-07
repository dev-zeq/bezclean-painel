-- Arquivar clientes, lixeira de orçamentos e agendamentos (exclusão lógica).
-- PROPOSTA — executar em produção somente após autorização. Backup antes: ver arquivar_lixeira.md.
--
-- Nada é apagado fisicamente. Colunas novas (todas NULL por padrão = comportamento atual):
--   clientes.arquivado_em, orcamentos.excluido_em, agendamentos.excluido_em,
--   orcamentos.agendamento_excluido_id (lembra o atendimento que foi para a lixeira, para religar ao restaurar).
-- As operações que mexem em mais de um registro são funções (SECURITY INVOKER: RLS por owner_id continua valendo):
--   orcamento_excluir / orcamento_restaurar / agendamento_excluir / agendamento_restaurar.
-- Regra de proteção no banco: atendimento concluído ou com pagamento registrado NÃO vai para a lixeira.
-- Também ajusta campanha_agendar_orcamento para ignorar atendimentos da lixeira ao checar conflito de horário.
begin;

alter table public.clientes     add column if not exists arquivado_em timestamptz;
alter table public.agendamentos add column if not exists excluido_em  timestamptz;
alter table public.orcamentos   add column if not exists excluido_em  timestamptz;
alter table public.orcamentos   add column if not exists agendamento_excluido_id uuid
  references public.agendamentos(id) on delete set null;

create index if not exists clientes_arquivado_idx     on public.clientes(owner_id)     where arquivado_em is not null;
create index if not exists orcamentos_excluido_idx    on public.orcamentos(owner_id)   where excluido_em  is not null;
create index if not exists agendamentos_excluido_idx  on public.agendamentos(owner_id) where excluido_em  is not null;

-- Proteção no banco: atendimento concluído ou com pagamento registrado não pode ser excluído (nem por fora do painel).
create or replace function public.agendamentos_proteger_lixeira()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.excluido_em is not null and old.excluido_em is null
     and (old.status = 'concluido' or old.status_pagamento <> 'pendente') then
    raise exception 'Atendimento concluído ou com pagamento registrado não pode ser excluído. Use Cancelar, se necessário.';
  end if;
  return new;
end;
$$;
drop trigger if exists agendamentos_proteger_lixeira on public.agendamentos;
create trigger agendamentos_proteger_lixeira before update of excluido_em on public.agendamentos
  for each row execute function public.agendamentos_proteger_lixeira();

-- Orçamento -> lixeira. Se estiver ligado a um atendimento ativo, só exclui junto (p_com_agendamento = true).
create or replace function public.orcamento_excluir(p_id uuid, p_com_agendamento boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare q public.orcamentos; a public.agendamentos; agora timestamptz := now();
begin
  select * into q from public.orcamentos where id = p_id and owner_id = auth.uid() and excluido_em is null for update;
  if not found then raise exception 'Orçamento não encontrado ou já está na lixeira.'; end if;
  if q.agendamento_id is not null then
    select * into a from public.agendamentos where id = q.agendamento_id and owner_id = auth.uid() and excluido_em is null for update;
    if found then
      if a.status = 'concluido' or a.status_pagamento <> 'pendente' then
        raise exception 'Este orçamento está ligado a um atendimento concluído ou pago e não pode ser excluído.';
      end if;
      if a.status <> 'cancelado' and not coalesce(p_com_agendamento, false) then
        raise exception 'AGENDAMENTO_VINCULADO: este orçamento está ligado a um atendimento agendado.';
      end if;
      if a.status <> 'cancelado' then
        update public.agendamentos set excluido_em = agora, updated_at = agora where id = a.id;
      end if;
    end if;
  end if;
  update public.orcamentos set excluido_em = agora, updated_at = agora where id = q.id;
end;
$$;

-- Restaura o orçamento e, se foi para a lixeira junto com o atendimento, o atendimento também.
create or replace function public.orcamento_restaurar(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare q public.orcamentos;
begin
  select * into q from public.orcamentos where id = p_id and owner_id = auth.uid() and excluido_em is not null for update;
  if not found then raise exception 'Orçamento não encontrado na lixeira.'; end if;
  if q.agendamento_id is not null then
    update public.agendamentos set excluido_em = null, updated_at = now()
      where id = q.agendamento_id and owner_id = auth.uid() and excluido_em = q.excluido_em;
  end if;
  update public.orcamentos set excluido_em = null, updated_at = now() where id = q.id;
end;
$$;

-- Atendimento -> lixeira. Orçamentos ligados voltam a "enviado" e sem agendamento (lembrando o vínculo).
create or replace function public.agendamento_excluir(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.agendamentos; agora timestamptz := now();
begin
  select * into a from public.agendamentos where id = p_id and owner_id = auth.uid() and excluido_em is null for update;
  if not found then raise exception 'Atendimento não encontrado ou já está na lixeira.'; end if;
  if a.status = 'concluido' or a.status_pagamento <> 'pendente' then
    raise exception 'Atendimento concluído ou com pagamento registrado não pode ser excluído. Use Cancelar, se necessário.';
  end if;
  update public.agendamentos set excluido_em = agora, updated_at = agora where id = a.id;
  update public.orcamentos
     set agendamento_excluido_id = a.id, agendamento_id = null,
         status = case when status = 'aprovado' then 'enviado' else status end, updated_at = agora
   where agendamento_id = a.id and owner_id = auth.uid() and excluido_em is null;
end;
$$;

create or replace function public.agendamento_restaurar(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.agendamentos;
begin
  select * into a from public.agendamentos where id = p_id and owner_id = auth.uid() and excluido_em is not null for update;
  if not found then raise exception 'Atendimento não encontrado na lixeira.'; end if;
  update public.agendamentos set excluido_em = null, updated_at = now() where id = a.id;
  update public.orcamentos
     set agendamento_id = a.id, agendamento_excluido_id = null,
         status = case when status = 'enviado' then 'aprovado' else status end, updated_at = now()
   where agendamento_excluido_id = a.id and owner_id = auth.uid() and excluido_em is null;
end;
$$;

revoke execute on function public.orcamento_excluir(uuid,boolean), public.orcamento_restaurar(uuid),
  public.agendamento_excluir(uuid), public.agendamento_restaurar(uuid) from public, anon;
grant execute on function public.orcamento_excluir(uuid,boolean), public.orcamento_restaurar(uuid),
  public.agendamento_excluir(uuid), public.agendamento_restaurar(uuid) to authenticated;

-- Conflito de horário da campanha ignora atendimentos na lixeira (único ajuste na função existente).
create or replace function public.campanha_agendar_orcamento(p_orcamento_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_endereco text default null::text)
returns uuid language plpgsql set search_path to '' as $function$
declare q public.orcamentos; novo uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':agenda_campanha',0));
  select * into q from public.orcamentos where id=p_orcamento_id and owner_id=auth.uid() and excluido_em is null for update;
  if not found or q.campanha_cliente_id is null then raise exception 'Orçamento da campanha não encontrado.'; end if;
  if q.agendamento_id is not null then return q.agendamento_id; end if;
  if q.status in ('recusado','expirado') then raise exception 'Revise a situação do orçamento antes de agendar.'; end if;
  if p_inicio is null or p_fim is null or p_fim<p_inicio+interval '30 minutes' then raise exception 'Informe data e duração válidas.'; end if;
  if exists(select 1 from public.agendamentos where owner_id=auth.uid() and excluido_em is null and status<>'cancelado' and inicio_em<p_fim and fim_em>p_inicio)
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

commit;
