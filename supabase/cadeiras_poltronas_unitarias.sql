-- Cadeiras e Poltronas como serviços unitários (quantidade livre × preço unitário editável).
-- PROPOSTA — executar em produção somente após confirmação do responsável.
--
-- O que faz (aditivo + desativação reversível):
--   1. Cria "Cadeiras" (categoria cadeiras) e "Poltrona" (categoria poltrona), tipo base, ativos.
--      Preços iniciais editáveis em Configurações → Tabela de Preços; Desconto/Especial ficam NULL.
--   2. Desativa (ativo = false) os 7 serviços por faixa: Até 2 / 4 / 6 / 8 ou mais cadeiras;
--      1 peça / 2 peças / 3 peças ou mais. NADA é apagado ou renomeado: orçamentos e agenda
--      históricos continuam apontando para esses registros com nomes e valores intactos.
-- Não altera orcamentos, orcamento_itens, agendamentos nem agendamento_itens.
-- Reversível: ver supabase/cadeiras_poltronas_unitarias_rollback.sql.
begin;

do $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.catalogo_precos
  where id = '475efb51-8174-453c-ac45-08452ca26253';  -- "6 cadeiras"
  if v_owner is null then
    raise exception 'Serviço de referência não encontrado; revise o catálogo antes de executar';
  end if;

  insert into public.catalogo_precos(owner_id, categoria, codigo, nome, valor, valor_normal, tipo, ativo, destaque, observacoes)
  values
    (v_owner, 'cadeiras', 'cadeira',  'Cadeiras', 29.90, 29.90, 'base', true, false, 'Preço por cadeira; informe a quantidade no orçamento'),
    (v_owner, 'poltrona', 'poltrona', 'Poltrona', 120.00, 120.00, 'base', true, false, 'Preço por poltrona, puff ou peça individual; informe a quantidade no orçamento')
  on conflict (owner_id, categoria, codigo) do nothing;

  update public.catalogo_precos set ativo = false, updated_at = now()
  where owner_id = v_owner and ativo
    and id in (
      '361d82ad-b61f-41de-a396-1ef43a786958',  -- Até 2 cadeiras
      '2d54c3e8-173f-471e-b527-caf95c9a53c2',  -- 4 cadeiras
      '475efb51-8174-453c-ac45-08452ca26253',  -- 6 cadeiras
      '1a8a0bc0-e8b7-487d-a014-c92fee459438',  -- 8 ou mais cadeiras
      '8e9e5bfd-c816-4f5c-b5cf-1f95f5e7c018',  -- 1 peça
      '029574c3-87a4-46cb-925e-d4f0f0bf687b',  -- 2 peças
      '76e44f75-2502-4daf-9a44-49b541e91036'   -- 3 peças ou mais
    );
end
$$;

commit;
