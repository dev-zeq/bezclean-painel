# Validação — três preços e modalidades

## Status e origem

Este checklist acompanha a **proposta nova** em `precos_tres_faixas_proposta.sql`.
O SQL completo originalmente preparado na Etapa 02 não foi localizado no Notion nem no
histórico pesquisável do GitHub; portanto, este arquivo não deve ser apresentado como
recuperação do script original.

A proposta foi reconstruída a partir do registro auditado da Etapa 02:

- `catalogo_precos` tinha 28 registros ativos e RLS com isolamento por `owner_id`;
- havia 20 orçamentos e 34 itens;
- itens históricos preservam `valor_unitario`, `valor_original` e `valor_total`;
- não há modalidade `manual`, desconto progressivo automático ou unificação de
  Cadeiras, Poltronas, Sofás ou demais categorias.

O acesso atual ao projeto Bez Clean `qunaqtxadifmwbmycqum` não está disponível nesta
sessão. Por isso, as consultas de pré-validação abaixo são obrigatórias no ambiente de
teste antes de qualquer aplicação.

## 1. Backup e criação do ambiente de teste

1. Crie uma branch/projeto de teste isolado a partir do banco de produção. Não aponte o
   painel publicado para esse ambiente.
2. Registre data, hora, ref do projeto e a revisão Git da branch
   `feat/tabela-de-precos`.
3. Faça um backup lógico do teste **antes** da migração (schema e dados) e confirme que
   o arquivo pode ser restaurado. Quando disponível, mantenha também o backup nativo do
   Supabase.
4. Guarde as contagens antes da execução:

   ```sql
   select count(*) as catalogo_ativo
   from public.catalogo_precos
   where ativo is true;

   select count(*) as orcamentos from public.orcamentos;
   select count(*) as itens from public.orcamento_itens;
   ```

5. Confirme esquema e RLS:

   ```sql
   select table_name, column_name, data_type, is_nullable
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('catalogo_precos', 'orcamento_itens')
   order by table_name, ordinal_position;

   select c.relname as tabela, c.relrowsecurity as rls_habilitado
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('catalogo_precos', 'orcamento_itens');

   select tablename, policyname, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public'
     and tablename in ('catalogo_precos', 'orcamento_itens')
   order by tablename, policyname;
   ```

   Pare a execução se `valor`, `owner_id`, RLS ou as políticas por proprietário não
   corresponderem ao auditado.

## 2. Aplicação no ambiente de teste

1. Revise o arquivo SQL linha a linha e confirme que ele continua marcado como
   **proposta nova**.
2. Execute o arquivo inteiro em uma única sessão no ambiente de teste. O arquivo usa
   `BEGIN … COMMIT`: em caso de erro, execute `ROLLBACK` e corrija a divergência antes
   de tentar novamente.
3. Não altere nenhum preço manualmente como parte da aplicação.
4. Após sucesso, confira:

   ```sql
   select
     count(*) filter (where valor_normal is null) as normal_nulo,
     count(*) filter (where valor_desconto is null) as desconto_nulo,
     count(*) filter (where valor_especial is null) as especial_nulo,
     count(*) filter (where valor <> valor_normal) as legado_divergente
   from public.catalogo_precos;

   select modalidade_preco, count(*)
   from public.orcamento_itens
   group by modalidade_preco
   order by modalidade_preco nulls first;

   select conname, convalidated
   from pg_constraint
   where conrelid in ('public.catalogo_precos'::regclass, 'public.orcamento_itens'::regclass)
     and (
       conname like 'catalogo_precos_valor_%'
       or conname = 'orcamento_itens_modalidade_preco_valida'
     );
   ```

   Esperado: `normal_nulo` e `legado_divergente` iguais a zero. `desconto_nulo`
   e `especial_nulo` podem ser maiores que zero, pois significam preço ainda não
   configurado. Itens históricos continuam com `modalidade_preco IS NULL`; e as
   constraints aparecem validadas.

## 3. Teste do trigger bidirecional

Use apenas um serviço de teste pertencente ao usuário de teste. Faça cada cenário dentro
de transação e encerre com `ROLLBACK`, para não alterar o catálogo de teste.

1. **Novo modelo (normal → legado):** atualize apenas `valor_normal`; ao consultar a
   linha, `valor` deve ser idêntico.
2. **Legado (legado → normal):** atualize apenas `valor`; ao consultar a linha,
   `valor_normal` deve ser idêntico.
3. **Conflito explícito:** em um `SAVEPOINT`, tente mudar `valor` e
   `valor_normal` para números diferentes na mesma instrução. O resultado esperado é
   erro `P0001`. Em seguida execute `ROLLBACK TO SAVEPOINT`.
4. **Inserção legada:** crie um serviço de teste informando somente `valor` e os demais
   campos obrigatórios do esquema real. O trigger deve preencher `valor_normal`.
   `valor_desconto` e `valor_especial` devem permanecer `NULL`.
5. **Inserção nova:** crie um serviço de teste com somente `valor_normal` e os demais
   campos obrigatórios. O trigger deve preencher `valor`; desconto e especial devem
   permanecer `NULL` até configuração explícita.
6. Confirme que desconto igual ou acima do normal permanece permitido no banco. A
   interface deve avisar e a Etapa 04 não pode exibir economia para esse caso.

## 4. RLS e histórico

1. Com sessão autenticada do usuário A, leia e edite apenas um catálogo de A.
2. Com sessão autenticada do usuário B, tente ler e editar o mesmo registro de A.
   O resultado deve ser zero linhas/negado pelo RLS, sem expor dados.
3. Verifique que qualquer `UPDATE` mantém `owner_id` do registro.
4. Compare, antes e depois, os itens de orçamentos existentes:

   ```sql
   select id, orcamento_id, catalogo_preco_id, nome,
          valor_original, valor_unitario, valor_total, modalidade_preco
   from public.orcamento_itens
   order by created_at, id;
   ```

   Valores, quantidades e totais históricos não podem mudar. Apenas a nova coluna deve
   existir com `NULL` para esses itens.

## 5. Integração e regressão — antes de produção

1. Só avance quando a Etapa 04 carregar `valor_normal`, `valor_desconto` e
   `valor_especial`, salvar `modalidade_preco` e persistir o preço unitário já usado
   no orçamento.
2. Normal deve estar disponível sempre. Desconto e Especial só podem ser oferecidos quando
   o preço correspondente estiver configurado (não nulo); a interface não deve sugerir
   modalidade sem preço.
3. Teste Normal, Desconto e Especial disponíveis, inclusive alteração manual do unitário
   sem mudar a modalidade.
4. Em Desconto, risque o normal somente quando `valor_normal > valor_unitario`.
   Não aplique desconto automático por quantidade.
4. Teste PDF de `pwa.js`, WhatsApp, parcelamento, conversão para Agenda, edição e
   reabertura de orçamento.
5. Teste a Tabela de Preços em celular e desktop, inclusive erro de RLS e rede.
6. Execute os advisors do Supabase e faça revisão visual e autenticada antes de abrir
   qualquer PR para `main`.

## 6. Rollback

O rollback preferencial é restaurar o backup verificado do ambiente de teste.

Não use `DROP COLUMN` como atalho se a Etapa 04 já tiver gravado
`modalidade_preco` ou se a tabela de preços tiver sido usada: isso descarta informação.

Antes dessa integração, e **somente no ambiente de teste**, o rollback técnico pode:

1. desativar/remover o trigger `catalogo_precos_espelhar_valor_normal`;
2. remover a função `public.catalogo_precos_espelhar_valor_normal()`;
3. remover as constraints novas;
4. remover as colunas novas apenas após confirmar, no backup, que nenhum dado precisa ser
   preservado.

Em produção, restaure o backup e investigue a causa; não execute um rollback destrutivo
sem uma revisão específica.
