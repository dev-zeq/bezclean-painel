begin;

alter table public.agendamento_itens
  add column valor_original numeric,
  add constraint agendamento_itens_oferta_40_check check (
    valor_original is null
    or (valor_original > valor_unitario and valor_original = round(valor_unitario / 0.60, 2))
  );

create function public.agendamento_salvar_direto(
  p_id uuid, p_edicao boolean, p_agendamento jsonb, p_itens jsonb, p_novo_cliente jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ag public.agendamentos%rowtype;
  id_salvo uuid;
begin
  if (select auth.uid()) is null or p_id is null or p_edicao is null then
    raise exception 'Sessão ou agendamento inválido.';
  end if;
  ag := jsonb_populate_record(null::public.agendamentos, p_agendamento);
  if ag.fim_em <= ag.inicio_em or coalesce(jsonb_typeof(p_itens), '') <> 'array' then
    raise exception 'Confira os horários e os serviços do atendimento.';
  end if;
  if ag.tipo = 'estofados' and jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um serviço.';
  end if;

  -- Uma nova tentativa do mesmo rascunho reutiliza o agendamento já salvo.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  if not p_edicao and exists (select 1 from public.agendamentos where id = p_id and excluido_em is null) then
    return p_id;
  end if;

  if ag.tipo = 'apartamento' then
    if not exists (select 1 from public.apartamentos where id = ag.apartamento_id) then
      raise exception 'Selecione um apartamento do painel.';
    end if;
    ag.cliente_id := null;
  else
    ag.apartamento_id := null;
    if p_novo_cliente is not null and ag.cliente_id is null then
      insert into public.clientes (nome, telefone, endereco)
      values (p_novo_cliente->>'nome', p_novo_cliente->>'telefone', ag.endereco)
      returning id into ag.cliente_id;
    end if;
    if not exists (select 1 from public.clientes where id = ag.cliente_id) then
      raise exception 'Selecione um cliente do painel.';
    end if;
  end if;

  if p_edicao then
    update public.agendamentos set
      tipo = ag.tipo, cliente_id = ag.cliente_id, apartamento_id = ag.apartamento_id,
      inicio_em = ag.inicio_em, fim_em = ag.fim_em, endereco = ag.endereco,
      descricao_servico = ag.descricao_servico, valor = ag.valor,
      observacoes = ag.observacoes, status = ag.status
    where id = p_id and excluido_em is null
    returning id into id_salvo;
    if id_salvo is null then raise exception 'Atendimento não encontrado.'; end if;
    delete from public.agendamento_itens where agendamento_id = id_salvo;
  else
    insert into public.agendamentos (
      id, tipo, cliente_id, apartamento_id, inicio_em, fim_em, endereco, descricao_servico, valor, observacoes, status
    ) values (
      p_id, ag.tipo, ag.cliente_id, ag.apartamento_id, ag.inicio_em, ag.fim_em, ag.endereco, ag.descricao_servico, ag.valor, ag.observacoes, ag.status
    ) returning id into id_salvo;
  end if;

  if ag.tipo = 'estofados' then
    insert into public.agendamento_itens (
      agendamento_id, catalogo_preco_id, nome, quantidade, valor_unitario, valor_total, valor_original, observacoes
    )
    select id_salvo, i.catalogo_preco_id, i.nome, i.quantidade, i.valor_unitario, i.valor_total, i.valor_original, i.observacoes
    from jsonb_populate_recordset(null::public.agendamento_itens, p_itens) as i;
  end if;
  return id_salvo;
end;
$$;

revoke all on function public.agendamento_salvar_direto(uuid, boolean, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.agendamento_salvar_direto(uuid, boolean, jsonb, jsonb, jsonb) to authenticated;

commit;
