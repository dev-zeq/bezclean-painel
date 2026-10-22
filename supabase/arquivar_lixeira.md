# Arquivar clientes e lixeira (orçamentos e agendamentos)

Exclusão **lógica**: nada é apagado fisicamente e nenhuma exclusão em cascata é criada.
SQL: `arquivar_lixeira.sql` (rollback: `arquivar_lixeira_rollback.sql`). Teste do SQL: `testes/lixeira.test.mjs` (21 verificações em Postgres local).

## Auditoria do esquema (somente leitura, 22/10/2026)
- FKs: `orcamentos.cliente_id` e `agendamentos.cliente_id` → `clientes` **ON DELETE RESTRICT**; `orcamento_itens.orcamento_id` e `agendamento_itens.agendamento_id` → **CASCADE**; `orcamentos.agendamento_id` → `agendamentos` **SET NULL**. Ou seja, apagar de verdade um agendamento/orçamento destruiria itens e soltaria vínculos — por isso o painel usa exclusão lógica.
- RLS: uma política `ALL` por `owner_id = auth.uid()` em clientes, orcamentos, orcamento_itens, agendamentos e agendamento_itens. As colunas novas herdam essa proteção; as funções são `SECURITY INVOKER`.
- Triggers existentes (campanhas) validam vínculos em orçamentos/agendamentos e o WhatsApp único por cliente; continuam funcionando. `campanha_agendar_orcamento` passa a ignorar atendimentos da lixeira no conflito de horário.

## O que muda no banco
| Tabela | Coluna nova | Significado |
|---|---|---|
| clientes | `arquivado_em` | arquivado (NULL = ativo) |
| orcamentos | `excluido_em`, `agendamento_excluido_id` | na lixeira; lembra o atendimento removido para religar ao restaurar |
| agendamentos | `excluido_em` | na lixeira |

Funções: `orcamento_excluir(id, com_agendamento)`, `orcamento_restaurar(id)`, `agendamento_excluir(id)`, `agendamento_restaurar(id)`. Gatilho de proteção: atendimento **concluído** ou com **pagamento registrado** não pode ir para a lixeira (nem por fora do painel).

## Regras na interface
- **Clientes**: Arquivar/Reativar (Mais ações). Arquivado some da lista e da seleção de novos orçamentos/agendamentos/campanhas; histórico permanece; filtro Ativos/Arquivados.
- **Orçamentos**: Excluir → Lixeira (confirmação); lixeira com Restaurar. Ligado a atendimento agendado: só exclui junto com o atendimento (aviso explícito); ligado a atendimento concluído/pago: bloqueado; ligado a cancelado: exclui só o orçamento.
- **Agenda**: *Cancelar atendimento* (mantém no histórico) é diferente de *Excluir atendimento (teste)* (lixeira). Concluído/pago: sem opção de excluir. Excluir um atendimento faz o orçamento ligado voltar para "enviado"; restaurar religa.

## Impacto, backup e rollback
- Impacto: aditivo (3 tabelas, 4 colunas NULL, 4 funções, 1 gatilho, 3 índices parciais, 1 função de campanha recriada). Painel atual em produção continua funcionando após o SQL (ignora as colunas). **Aplique o SQL antes do deploy do código** (o código novo consulta as colunas).
- Backup antes: snapshot das 3 tabelas (`create table backup_AAAAMMDD... as table ...`) e exportação externa como em `/home/zeqmiranda/bezclean-backups/`.
- Rollback: `arquivar_lixeira_rollback.sql` (registros arquivados/na lixeira voltam a aparecer; anote os ids antes). Código: `git revert`.

## Testes realizados
SQL (PGlite): excluir/restaurar, vínculo com atendimento (junto/bloqueado/cancelado), proteção de concluído/pago (função e update direto), isolamento por usuário, reaplicação e rollback. Interface (navegador, banco simulado): arquivar/reativar, filtros, lixeira de orçamentos, bloqueios, Agenda (cancelar × excluir, lixeira, restaurar), seleção de cliente sem arquivados, celular (375 px).
