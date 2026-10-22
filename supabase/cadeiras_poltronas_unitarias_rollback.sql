-- Reverte cadeiras_poltronas_unitarias.sql: reativa as faixas antigas e remove os dois serviços
-- unitários SOMENTE se ainda não foram usados em nenhum orçamento/agendamento.
begin;
update public.catalogo_precos set ativo = true, updated_at = now()
where id in (
  '361d82ad-b61f-41de-a396-1ef43a786958','2d54c3e8-173f-471e-b527-caf95c9a53c2',
  '475efb51-8174-453c-ac45-08452ca26253','1a8a0bc0-e8b7-487d-a014-c92fee459438',
  '8e9e5bfd-c816-4f5c-b5cf-1f95f5e7c018','029574c3-87a4-46cb-925e-d4f0f0bf687b',
  '76e44f75-2502-4daf-9a44-49b541e91036');
delete from public.catalogo_precos c
where ((c.categoria = 'cadeiras' and c.codigo = 'cadeira') or (c.categoria = 'poltrona' and c.codigo = 'poltrona'))
  and not exists (select 1 from public.orcamento_itens i where i.catalogo_preco_id = c.id)
  and not exists (select 1 from public.agendamento_itens i where i.catalogo_preco_id = c.id);
-- Se algum dos dois já foi usado, apenas desative: update ... set ativo = false where categoria/codigo acima.
commit;
