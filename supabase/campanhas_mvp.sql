begin;

create function public.campanha_normalizar_telefone(p_telefone text)
returns text language sql immutable strict set search_path = '' as $$
  select case when length(n) in (10,11) then '55'||n
              when length(n) in (12,13) and left(n,2)='55' then n
              else null end
  from (select regexp_replace(regexp_replace(trim(p_telefone),'^00',''),'[^0-9]','','g') n) t;
$$;
alter table public.clientes add column telefone_normalizado text
  generated always as (public.campanha_normalizar_telefone(telefone)) stored;
create index clientes_telefone_normalizado_idx on public.clientes(owner_id,telefone_normalizado);

create function public.campanha_validar_telefone_cliente()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare numero text;
begin
  numero := public.campanha_normalizar_telefone(new.telefone);
  if numero is null then return new; end if;
  if tg_op='UPDATE' then
    if new.owner_id=old.owner_id and numero=public.campanha_normalizar_telefone(old.telefone) then return new; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text||numero,0));
  if exists(select 1 from public.clientes c where c.owner_id=new.owner_id and c.telefone_normalizado=numero and c.id<>new.id) then
    raise exception 'Este WhatsApp já existe em Clientes. Selecione o cadastro existente.';
  end if;
  return new;
end;
$$;
create trigger campanha_telefone_cliente before insert or update of telefone,owner_id on public.clientes
for each row execute function public.campanha_validar_telefone_cliente();

create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  nome text not null check(length(trim(nome))>0),
  meta_faturamento numeric(12,2) not null check(meta_faturamento>0),
  inicio_em date not null,
  fim_em date not null check(fim_em>=inicio_em),
  status text not null default 'ativa' check(status in ('ativa','encerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,nome)
);
create table public.campanha_clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  campanha_id uuid not null references public.campanhas(id),
  cliente_id uuid not null references public.clientes(id),
  origem text not null default 'painel' check(origem in ('painel','whatsapp_servico_realizado')),
  status_comercial text not null default 'nao_contatado'
    check(status_comercial in ('nao_contatado','mensagem_enviada','respondeu','interessado','nao_interessado')),
  valor_potencial numeric(12,2) check(valor_potencial>=0),
  primeiro_contato_em timestamptz,
  ultima_resposta_em timestamptz,
  interessado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campanha_id,cliente_id)
);
alter table public.modelos_mensagem add column campanha_id uuid references public.campanhas(id);
alter table public.orcamentos add column campanha_cliente_id uuid references public.campanha_clientes(id);
alter table public.agendamentos add column campanha_cliente_id uuid references public.campanha_clientes(id);
create table public.campanha_contatos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  campanha_cliente_id uuid not null references public.campanha_clientes(id),
  modelo_mensagem_id uuid references public.modelos_mensagem(id),
  tipo text not null check(tipo in ('abertura_whatsapp','envio_confirmado','resposta','interesse','nao_interessado')),
  texto_utilizado text,
  created_at timestamptz not null default now()
);
create index campanha_clientes_owner_idx on public.campanha_clientes(owner_id,campanha_id);
create index campanha_clientes_cliente_idx on public.campanha_clientes(cliente_id);
create index campanha_contatos_participante_idx on public.campanha_contatos(campanha_cliente_id,created_at desc);
create index campanha_contatos_owner_idx on public.campanha_contatos(owner_id);
create index orcamentos_campanha_idx on public.orcamentos(campanha_cliente_id) where campanha_cliente_id is not null;
create index agendamentos_campanha_idx on public.agendamentos(campanha_cliente_id) where campanha_cliente_id is not null;
create index modelos_mensagem_campanha_idx on public.modelos_mensagem(campanha_id) where campanha_id is not null;

alter table public.campanhas enable row level security;
alter table public.campanha_clientes enable row level security;
alter table public.campanha_contatos enable row level security;
create policy campanhas_owner on public.campanhas for all to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy campanha_clientes_owner on public.campanha_clientes for all to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy campanha_contatos_owner on public.campanha_contatos for all to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
grant select,insert,update,delete on public.campanhas,public.campanha_clientes,public.campanha_contatos to authenticated;
revoke all on public.campanhas,public.campanha_clientes,public.campanha_contatos from anon;

create function public.campanha_validar_vinculo()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare participante public.campanha_clientes;
begin
  if tg_table_name='campanha_clientes' then
    if tg_op='UPDATE' then
      if new.cliente_id<>old.cliente_id or new.campanha_id<>old.campanha_id or new.owner_id<>old.owner_id then
        raise exception 'Não é possível trocar o cliente ou a campanha deste vínculo.';
      end if;
    end if;
    if not exists(select 1 from public.campanhas c where c.id=new.campanha_id and c.owner_id=new.owner_id)
       or not exists(select 1 from public.clientes c where c.id=new.cliente_id and c.owner_id=new.owner_id) then
      raise exception 'Campanha ou cliente inválido.';
    end if;
  elsif tg_table_name='modelos_mensagem' then
    if new.campanha_id is not null and not exists(select 1 from public.campanhas c where c.id=new.campanha_id and c.owner_id=new.owner_id) then
      raise exception 'Campanha inválida para o modelo.';
    end if;
  elsif new.campanha_cliente_id is not null then
    select * into participante from public.campanha_clientes c where c.id=new.campanha_cliente_id and c.owner_id=new.owner_id;
    if not found then raise exception 'Cliente da campanha inválido.'; end if;
    if tg_table_name in ('orcamentos','agendamentos') then
      if new.cliente_id<>participante.cliente_id then raise exception 'O cliente não corresponde à campanha.'; end if;
      if tg_table_name='orcamentos' then
        if new.agendamento_id is not null then
          if not exists(select 1 from public.agendamentos a where a.id=new.agendamento_id and a.owner_id=new.owner_id
            and a.cliente_id=new.cliente_id and a.campanha_cliente_id=new.campanha_cliente_id) then
            raise exception 'O agendamento não corresponde à campanha.';
          end if;
        end if;
      end if;
    elsif tg_table_name='campanha_contatos' then
      if new.modelo_mensagem_id is not null then
        if not exists(select 1 from public.modelos_mensagem m where m.id=new.modelo_mensagem_id and m.owner_id=new.owner_id
          and m.campanha_id=participante.campanha_id) then raise exception 'Modelo inválido para a campanha.'; end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger campanha_vinculo before insert or update on public.campanha_clientes for each row execute function public.campanha_validar_vinculo();
create trigger campanha_vinculo before insert or update on public.campanha_contatos for each row execute function public.campanha_validar_vinculo();
create trigger campanha_vinculo before insert or update on public.modelos_mensagem for each row execute function public.campanha_validar_vinculo();
create trigger campanha_vinculo before insert or update on public.orcamentos for each row execute function public.campanha_validar_vinculo();
create trigger campanha_vinculo before insert or update on public.agendamentos for each row execute function public.campanha_validar_vinculo();

create function public.campanha_adicionar_cliente(p_campanha_id uuid,p_nome text,p_telefone text,
  p_cliente_id uuid default null,p_origem text default 'whatsapp_servico_realizado')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare usuario uuid:=auth.uid(); numero text; cliente uuid; quantidade integer; participante uuid;
begin
  if usuario is null or not exists(select 1 from public.campanhas where id=p_campanha_id and owner_id=usuario and status='ativa') then
    raise exception 'Campanha não encontrada ou encerrada.'; end if;
  numero:=public.campanha_normalizar_telefone(p_telefone);
  if p_cliente_id is not null then
    select id into cliente from public.clientes where id=p_cliente_id and owner_id=usuario;
    if cliente is null then raise exception 'Cliente não encontrado.'; end if;
  else
    if numero is null then raise exception 'Informe WhatsApp com DDD (10 ou 11 dígitos), com ou sem +55.'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(usuario::text||numero,0));
    select count(*) into quantidade from public.clientes where owner_id=usuario and telefone_normalizado=numero;
    if quantidade>1 then raise exception 'Mais de um cliente usa este número. Selecione o cadastro existente.'; end if;
    select id into cliente from public.clientes where owner_id=usuario and telefone_normalizado=numero;
    if cliente is null then
      if length(trim(coalesce(p_nome,'')))=0 then raise exception 'Informe o nome.'; end if;
      insert into public.clientes(nome,telefone) values(trim(p_nome),numero) returning id into cliente;
    end if;
  end if;
  insert into public.campanha_clientes(campanha_id,cliente_id,origem) values(p_campanha_id,cliente,p_origem)
    on conflict(campanha_id,cliente_id) do update set cliente_id=excluded.cliente_id returning id into participante;
  return participante;
end;
$$;

create function public.campanha_registrar_contato(p_id uuid,p_tipo text,p_evento_id uuid,
  p_modelo_id uuid default null,p_texto text default null,p_valor numeric default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.campanha_clientes;
begin
  select * into c from public.campanha_clientes where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Cliente da campanha não encontrado.'; end if;
  if exists(select 1 from public.campanha_contatos where id=p_evento_id and campanha_cliente_id=p_id) then return; end if;
  insert into public.campanha_contatos(id,campanha_cliente_id,tipo,modelo_mensagem_id,texto_utilizado)
    values(p_evento_id,p_id,p_tipo,p_modelo_id,p_texto);
  update public.campanha_clientes set
    status_comercial=case
      when p_tipo='interesse' then 'interessado'
      when p_tipo='nao_interessado' then 'nao_interessado'
      when p_tipo='resposta' and status_comercial in ('nao_contatado','mensagem_enviada') then 'respondeu'
      when p_tipo='envio_confirmado' and status_comercial='nao_contatado' then 'mensagem_enviada'
      else status_comercial end,
    primeiro_contato_em=case when p_tipo='envio_confirmado' then coalesce(primeiro_contato_em,now()) else primeiro_contato_em end,
    ultima_resposta_em=case when p_tipo in ('resposta','interesse','nao_interessado') then now() else ultima_resposta_em end,
    interessado_em=case when p_tipo='interesse' then coalesce(interessado_em,now()) else interessado_em end,
    valor_potencial=case when p_tipo='interesse' then coalesce(p_valor,valor_potencial) else valor_potencial end,
    updated_at=now()
  where id=p_id;
end;
$$;

create function public.campanha_agendar_orcamento(p_orcamento_id uuid,p_inicio timestamptz,p_fim timestamptz,p_endereco text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
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
$$;

create function public.campanha_iniciar_mvp()
returns uuid language plpgsql security invoker set search_path = '' as $$
declare campanha uuid; usuario uuid:=auth.uid(); m jsonb; chave_modelo text;
begin
  if usuario is null then raise exception 'Entre no painel para iniciar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(usuario::text||':campanha_mvp',0));
  insert into public.campanhas(nome,meta_faturamento,inicio_em,fim_em)
    values('50% OFF — Clientes Bez Clean',2400,date '2026-10-05',date '2026-10-18')
    on conflict(owner_id,nome) do update set nome=excluded.nome returning id into campanha;
  for m in select value from jsonb_array_elements('[
    {"titulo":"Sofá em destaque","conteudo":"Oi, {nome}! Aqui é o Ezequiel, da Bez Clean 😊 Estamos com condições de até 50% OFF para clientes que já atendemos: sofá de R$ 398 por R$ 199. Também posso montar um combo com colchão ou cadeiras. Quer que eu te passe um orçamento?"},
    {"titulo":"Voltar a cuidar","conteudo":"Olá, {nome}! Tudo bem? Estamos com uma campanha de até 50% OFF para clientes Bez Clean. O sofá de R$ 398 está por R$ 199, conforme o modelo. Se quiser aproveitar para higienizar colchão ou cadeiras também, monto uma condição para você. Tem algum estofado precisando de cuidado?"},
    {"titulo":"Convite curto","conteudo":"Oi, {nome}! Ezequiel da Bez Clean por aqui 😊 Liberamos condições de até 50% OFF para clientes antigos, com sofá de R$ 398 por R$ 199. Quer que eu confira o valor para o seu sofá ou monte um combo?"},
    {"titulo":"Combo da casa","conteudo":"Olá, {nome}! Que tal aproveitar para cuidar do sofá e do colchão juntos? Estamos com condições de até 50% OFF para clientes Bez Clean. O sofá de R$ 398 sai por R$ 199, conforme o modelo, e posso incluir cadeiras no orçamento. Me conta o que você gostaria de higienizar?"},
    {"titulo":"Agenda da semana","conteudo":"Oi, {nome}! Estou organizando os atendimentos da Bez Clean desta semana e da próxima, com condições de até 50% OFF para clientes que já atendemos. Sofá de R$ 398 por R$ 199, conforme o modelo. Quer um orçamento para aproveitar?"},
    {"titulo":"Retomada do contato","conteudo":"Oi, {nome}! Como você está? Aqui é o Ezequiel, da Bez Clean. Estou passando para te avisar da nossa condição para clientes antigos: até 50% OFF, com sofá de R$ 398 por R$ 199. Se tiver colchão ou cadeiras para incluir, também monto um combo. Posso te passar os valores?"},
    {"titulo":"Pedido de avaliação","conteudo":"Olá, {nome}! Estamos com uma campanha Bez Clean para quem já foi nosso cliente: condições de até 50% OFF. O sofá de R$ 398 está por R$ 199, conforme o modelo. Se você me mandar uma foto do que quer higienizar, preparo um orçamento. Quer aproveitar?"},
    {"titulo":"Condição especial","conteudo":"Oi, {nome}! Separei uma condição da Bez Clean para clientes antigos 😊 Até 50% OFF na campanha, com sofá de R$ 398 por R$ 199, conforme o modelo. Também dá para combinar sofá, colchão e cadeiras. Quer que eu monte uma opção para você?"}
  ]'::jsonb) loop
    chave_modelo:='campanha_'||campanha::text||'_'||(m->>'titulo');
    if not exists(select 1 from public.modelos_mensagem where owner_id=usuario and chave=chave_modelo) then
      insert into public.modelos_mensagem(chave,titulo,conteudo,campanha_id) values(chave_modelo,m->>'titulo',m->>'conteudo',campanha);
    end if;
  end loop;
  return campanha;
end;
$$;

create function public.campanha_vincular_registro(p_participante_id uuid,p_tipo text,p_registro_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.campanha_clientes; q public.orcamentos; a public.agendamentos;
begin
  select * into c from public.campanha_clientes where id=p_participante_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Cliente da campanha não encontrado.'; end if;
  if p_tipo='orcamento' then
    select * into q from public.orcamentos where id=p_registro_id and owner_id=auth.uid() and cliente_id=c.cliente_id for update;
    if not found then raise exception 'Orçamento não encontrado para este cliente.'; end if;
    if q.campanha_cliente_id is not null and q.campanha_cliente_id<>c.id then raise exception 'Este orçamento já pertence a outra campanha.'; end if;
    if q.agendamento_id is not null then
      select * into a from public.agendamentos where id=q.agendamento_id and owner_id=auth.uid() and cliente_id=c.cliente_id for update;
      if not found or (a.campanha_cliente_id is not null and a.campanha_cliente_id<>c.id) then raise exception 'O atendimento pertence a outro cliente ou campanha.'; end if;
      update public.agendamentos set campanha_cliente_id=c.id,updated_at=now() where id=a.id;
    end if;
    update public.orcamentos set campanha_cliente_id=c.id,updated_at=now() where id=q.id;
  elsif p_tipo='agendamento' then
    select * into a from public.agendamentos where id=p_registro_id and owner_id=auth.uid() and cliente_id=c.cliente_id for update;
    if not found then raise exception 'Agendamento não encontrado para este cliente.'; end if;
    if a.campanha_cliente_id is not null and a.campanha_cliente_id<>c.id then raise exception 'Este atendimento já pertence a outra campanha.'; end if;
    if exists(select 1 from public.orcamentos where agendamento_id=a.id and campanha_cliente_id is not null and campanha_cliente_id<>c.id) then
      raise exception 'O orçamento deste atendimento pertence a outra campanha.'; end if;
    update public.agendamentos set campanha_cliente_id=c.id,updated_at=now() where id=a.id;
    update public.orcamentos set campanha_cliente_id=c.id,updated_at=now() where agendamento_id=a.id and owner_id=auth.uid();
  else raise exception 'Tipo de registro inválido.';
  end if;
end;
$$;

revoke execute on function public.campanha_adicionar_cliente(uuid,text,text,uuid,text) from public,anon;
revoke execute on function public.campanha_registrar_contato(uuid,text,uuid,uuid,text,numeric) from public,anon;
revoke execute on function public.campanha_agendar_orcamento(uuid,timestamptz,timestamptz,text) from public,anon;
revoke execute on function public.campanha_iniciar_mvp() from public,anon;
revoke execute on function public.campanha_vincular_registro(uuid,text,uuid) from public,anon;
revoke execute on function public.campanha_validar_vinculo(),public.campanha_validar_telefone_cliente() from public,anon;
grant execute on function public.campanha_adicionar_cliente(uuid,text,text,uuid,text),public.campanha_registrar_contato(uuid,text,uuid,uuid,text,numeric),public.campanha_agendar_orcamento(uuid,timestamptz,timestamptz,text),public.campanha_iniciar_mvp() to authenticated;
grant execute on function public.campanha_vincular_registro(uuid,text,uuid) to authenticated;
commit;
