-- PROPOSTA NOVA — NÃO é o script original da Etapa 02.
-- Elaborada em 15/10/2026 porque o SQL completo planejado não foi localizado
-- no Notion nem no histórico pesquisável do repositório.
--
-- OBJETIVO
--   1. Adicionar as três referências de preço ao catálogo:
--      valor_normal, valor_desconto e valor_especial.
--   2. Manter o campo legado catalogo_precos.valor sincronizado de forma
--      bidirecional com valor_normal, com conflito explícito.
--   3. Adicionar modalidade_preco aos itens novos de orçamento sem alterar
--      valores ou modalidade dos registros históricos.
--
-- PRÉ-CONDIÇÕES OBRIGATÓRIAS
-- - Executar SOMENTE em ambiente de teste isolado, após backup verificável.
-- - Confirmar o esquema real e as políticas RLS antes da execução.
-- - Não executar em produção, não editar catálogo existente e não publicar
--   esta branch até a integração da Etapa 04 estar aprovada.
--
-- ESQUEMA DE REFERÊNCIA DA AUDITORIA DA ETAPA 02
-- public.catalogo_precos: id, owner_id, nome, valor, ativo, categoria, tipo,
--   destaque; 28 registros ativos na data da auditoria.
-- public.orcamento_itens: itens já persistem valor_unitario, valor_original e
--   valor_total; 34 itens históricos. Nenhum deles é atualizado por este SQL.
--
-- A migração falha se tabelas/colunas mínimas ou RLS não estiverem presentes.
-- Isso é intencional: pare e revise, em vez de adaptar silenciosamente.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalogo_precos') IS NULL THEN
    RAISE EXCEPTION 'Tabela obrigatória ausente: public.catalogo_precos';
  END IF;
  IF to_regclass('public.orcamento_itens') IS NULL THEN
    RAISE EXCEPTION 'Tabela obrigatória ausente: public.orcamento_itens';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalogo_precos'
      AND column_name IN ('id', 'owner_id', 'nome', 'valor', 'ativo')
    GROUP BY table_schema, table_name
    HAVING count(*) = 5
  ) THEN
    RAISE EXCEPTION 'catalogo_precos não corresponde ao esquema auditado (id, owner_id, nome, valor, ativo)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orcamento_itens'
      AND column_name IN ('id', 'orcamento_id', 'catalogo_preco_id', 'nome', 'valor_unitario', 'valor_total')
    GROUP BY table_schema, table_name
    HAVING count(*) = 6
  ) THEN
    RAISE EXCEPTION 'orcamento_itens não corresponde ao esquema auditado';
  END IF;

  IF NOT COALESCE((
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.catalogo_precos'::regclass
  ), false) THEN
    RAISE EXCEPTION 'RLS deve permanecer habilitado em public.catalogo_precos';
  END IF;

  IF NOT COALESCE((
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.orcamento_itens'::regclass
  ), false) THEN
    RAISE EXCEPTION 'RLS deve permanecer habilitado em public.orcamento_itens';
  END IF;
END
$$;

-- Estrutura aditiva: nenhum serviço é inserido, alterado ou removido aqui.
ALTER TABLE public.catalogo_precos
  ADD COLUMN IF NOT EXISTS valor_normal numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_desconto numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_especial numeric(12,2);

-- Backfill conservador: o valor legado é a referência normal obrigatória.
-- Desconto e especial permanecem NULL até serem configurados na Tabela de Preços.
-- Não toca em orcamentos nem em orcamento_itens.
UPDATE public.catalogo_precos
SET valor_normal = valor
WHERE valor_normal IS NULL;


-- Proteções de domínio. Apenas valor_normal é obrigatório. As CHECK constraints
-- aceitam NULL para desconto/especial; o banco permite desconto >= normal e a
-- interface avisa sem calcular economia fictícia.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalogo_precos'::regclass
      AND conname = 'catalogo_precos_valor_normal_nao_negativo'
  ) THEN
    ALTER TABLE public.catalogo_precos
      ADD CONSTRAINT catalogo_precos_valor_normal_nao_negativo
      CHECK (valor_normal >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalogo_precos'::regclass
      AND conname = 'catalogo_precos_valor_desconto_nao_negativo'
  ) THEN
    ALTER TABLE public.catalogo_precos
      ADD CONSTRAINT catalogo_precos_valor_desconto_nao_negativo
      CHECK (valor_desconto >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalogo_precos'::regclass
      AND conname = 'catalogo_precos_valor_especial_nao_negativo'
  ) THEN
    ALTER TABLE public.catalogo_precos
      ADD CONSTRAINT catalogo_precos_valor_especial_nao_negativo
      CHECK (valor_especial >= 0) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.catalogo_precos
  ALTER COLUMN valor_normal SET NOT NULL;

ALTER TABLE public.catalogo_precos
  VALIDATE CONSTRAINT catalogo_precos_valor_normal_nao_negativo,
  VALIDATE CONSTRAINT catalogo_precos_valor_desconto_nao_negativo,
  VALIDATE CONSTRAINT catalogo_precos_valor_especial_nao_negativo;

-- Histórico: NULL significa "orçamento anterior à escolha explícita de modalidade".
-- Não há UPDATE em itens já salvos.
ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS modalidade_preco text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orcamento_itens'::regclass
      AND conname = 'orcamento_itens_modalidade_preco_valida'
  ) THEN
    ALTER TABLE public.orcamento_itens
      ADD CONSTRAINT orcamento_itens_modalidade_preco_valida
      CHECK (modalidade_preco IS NULL OR modalidade_preco IN ('normal', 'desconto', 'especial'))
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.orcamento_itens
  VALIDATE CONSTRAINT orcamento_itens_modalidade_preco_valida;

-- Compatibilidade valor <-> valor_normal:
-- - insert legado com apenas valor: preenche valor_normal;
-- - insert novo com apenas valor_normal: preenche valor;
-- - update de um lado: espelha o outro;
-- - update dos dois lados com valores divergentes: interrompe com erro,
--   evitando que a aplicação escolha silenciosamente um valor.
CREATE OR REPLACE FUNCTION public.catalogo_precos_espelhar_valor_normal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.valor_normal := COALESCE(NEW.valor_normal, NEW.valor);
    NEW.valor := COALESCE(NEW.valor, NEW.valor_normal);

    IF NEW.valor IS DISTINCT FROM NEW.valor_normal THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Conflito entre valor e valor_normal em catalogo_precos';
    END IF;

    -- Desconto e especial são opcionais e permanecem NULL quando não configurados.
    RETURN NEW;
  END IF;

  IF NEW.valor_normal IS DISTINCT FROM OLD.valor_normal
     AND NEW.valor IS DISTINCT FROM OLD.valor
     AND NEW.valor IS DISTINCT FROM NEW.valor_normal THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Conflito entre valor e valor_normal em catalogo_precos';
  ELSIF NEW.valor_normal IS DISTINCT FROM OLD.valor_normal THEN
    NEW.valor := NEW.valor_normal;
  ELSIF NEW.valor IS DISTINCT FROM OLD.valor THEN
    NEW.valor_normal := NEW.valor;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalogo_precos_espelhar_valor_normal ON public.catalogo_precos;

CREATE TRIGGER catalogo_precos_espelhar_valor_normal
BEFORE INSERT OR UPDATE OF valor, valor_normal
ON public.catalogo_precos
FOR EACH ROW
EXECUTE FUNCTION public.catalogo_precos_espelhar_valor_normal();

COMMENT ON COLUMN public.catalogo_precos.valor_normal IS
  'Preço de referência normal; sincronizado com o campo legado valor.';
COMMENT ON COLUMN public.catalogo_precos.valor_desconto IS
  'Preço de referência opcional para a modalidade desconto; NULL significa não configurado.';
COMMENT ON COLUMN public.catalogo_precos.valor_especial IS
  'Preço de referência opcional para a modalidade especial; NULL significa não configurado.';
COMMENT ON COLUMN public.orcamento_itens.modalidade_preco IS
  'normal, desconto ou especial; NULL preserva itens históricos anteriores à migração.';

COMMIT;

-- Após executar SOMENTE no teste, siga integralmente:
-- supabase/precos_tres_faixas_validacao.md
