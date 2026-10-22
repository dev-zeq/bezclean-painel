# Aplicação em produção — três preços (pendente de autorização)

Projeto `qunaqtxadifmwbmycqum` (bezclean-painel, sa-east-1, Postgres 17). Nada abaixo foi executado.

## Estado verificado (SELECT, 22/10/2026)

- Catálogo: 28 serviços (28 ativos). Orçamentos: **23**. Itens: **40** (16 com `valor_original`).
- Colunas novas ausentes; RLS ativo em `catalogo_precos` e `orcamento_itens`; nenhum trigger em `catalogo_precos`.
- A migração foi testada em Postgres real local (idempotência, trigger, constraints, histórico intacto).

## Impacto

- Só adiciona 3 colunas no catálogo (`valor_normal` preenchido com `valor`; desconto/especial NULL), 1 coluna nos itens (NULL = histórico), 4 constraints e 1 trigger.
- Não altera nenhum orçamento ou item; nenhum preço do catálogo muda. Execução em uma transação (`BEGIN…COMMIT`): erro = nada é aplicado.
- Bloqueio breve (milissegundos) em tabelas minúsculas.
- Compatibilidade: o painel **em produção hoje** continua funcionando (ignora colunas novas; o trigger mantém `valor` ↔ `valor_normal`). Portanto aplicar o SQL antes do deploy é seguro.
- Atenção: a branch só deve ir ao ar **depois** do SQL (ela seleciona as colunas novas).

## Backup (antes do SQL)

1. Confirmar no painel Supabase → Database → Backups que existe backup diário/PITR recente (não consultável por aqui).
2. Snapshot lógico dentro do banco, em schema não exposto pela API:

```sql
create schema if not exists backup_20261022;
create table backup_20261022.catalogo_precos as table public.catalogo_precos;
create table backup_20261022.orcamentos as table public.orcamentos;
create table backup_20261022.orcamento_itens as table public.orcamento_itens;
-- conferir: 28 / 23 (ou atual) / 40 (ou atual)
select (select count(*) from backup_20261022.catalogo_precos), (select count(*) from backup_20261022.orcamentos), (select count(*) from backup_20261022.orcamento_itens);
```

## Aplicação

Executar `precos_tres_faixas_proposta.sql` inteiro (commit `637af5c` corrige o delimitador), depois as consultas de `precos_tres_faixas_validacao.md` (contagens iguais, `valor_normal = valor` nos 28, itens históricos inalterados).

## Rollback

Antes de qualquer preço novo ser configurado (reversão limpa):

```sql
begin;
drop trigger if exists catalogo_precos_espelhar_valor_normal on public.catalogo_precos;
drop function if exists public.catalogo_precos_espelhar_valor_normal();
alter table public.catalogo_precos
  drop constraint if exists catalogo_precos_valor_normal_nao_negativo,
  drop constraint if exists catalogo_precos_valor_desconto_nao_negativo,
  drop constraint if exists catalogo_precos_valor_especial_nao_negativo,
  drop column if exists valor_normal, drop column if exists valor_desconto, drop column if exists valor_especial;
alter table public.orcamento_itens
  drop constraint if exists orcamento_itens_modalidade_preco_valida,
  drop column if exists modalidade_preco;
commit;
```

Se a Tabela de Preços já foi usada: antes do rollback, `update public.catalogo_precos set valor = valor_normal;` (o trigger já mantém iguais). Descontos/especiais configurados e modalidades dos itens novos seriam perdidos. Os dados originais podem ser conferidos no schema `backup_20261022`. Depois do rollback, reverter o deploy do painel.

## Autorização necessária

Responda "autorizo" para: (1) criar o snapshot `backup_20261022`; (2) aplicar a migração; (3) rodar a validação. Merge e deploy exigem autorização separada.

## Aplicado em 22/10/2026

- Snapshot `backup_20261022` criado (28/23/40) e backup externo verificado. Migração `precos_tres_faixas` aplicada via apply_migration.
- Validação: contagens e hashes das colunas originais idênticos ao pré-migração; `valor_normal = valor` nos 28; nenhum desconto/especial/modalidade preenchido; RLS e políticas intactas; trigger e 4 constraints validadas.
- Advisor: aviso novo `function_search_path_mutable` na função do trigger. Correção (pendente, opcional): `ALTER FUNCTION public.catalogo_precos_espelhar_valor_normal() SET search_path = public, pg_temp;` — já refletida no SQL do repositório.
- Descartar o snapshot só depois da publicação estável: `drop schema backup_20261022 cascade;`

## Ajuste de search_path (aplicado em produção em 22/10/2026)

`alter function public.catalogo_precos_espelhar_valor_normal() set search_path = public, pg_temp;` — confirmado em `pg_proc.proconfig`.

## Checklist de merge/deploy (pendente de autorização)

Estado: `main` está 0 commits à frente da branch (31 atrás) → merge sem conflitos, fast-forward. Publicação = GitHub Pages a partir da `main` (domínio `painel.bezclean.com.br`). O banco já está migrado.

1. **Antes:** testes locais passam (feito); backup externo + snapshot `backup_20261022` (feito).
2. **Merge:** `git checkout main && git merge --ff-only feat/tabela-de-precos && git push origin main`.
3. **Aguardar o Pages** (1–3 min). O service worker novo (`20261022a`) troca o cache sozinho; no celular instalado como PWA, fechar e reabrir o app uma ou duas vezes.
4. **Smoke test logado (≈5 min):**
   - Configurações → Tabela de Preços abre e lista 28 serviços; editar um preço de Desconto de um serviço de teste e reverter (ou não mexer em nada).
   - Novo orçamento: adicionar Sofá, trocar Normal → Desconto → editar preço; salvar; abrir detalhes (riscado só no Desconto); Gerar PDF; Abrir WhatsApp.
   - Abrir um orçamento antigo: valores e riscado iguais aos de antes; editar e salvar sem alterar nada.
   - Aprovar e agendar um orçamento de teste; conferir Agenda; apagar o teste depois.
   - Conferir no celular (375 px) o seletor de Modalidade.
5. **Rollback do deploy:** `git revert -m 1 <merge>` (ou `git reset`+push forçado só se você autorizar) e push; o banco migrado continua compatível com o painel antigo (colunas novas ignoradas, trigger mantém `valor`).
6. **Rollback do banco (só se necessário):** SQL em "Rollback" acima.
7. **Depois de estável (dias):** `drop schema backup_20261022 cascade;` e, no Supabase Auth, avaliar a proteção contra senhas vazadas (separado).
