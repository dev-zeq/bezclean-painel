# Bezclean Painel

Painel operacional da Bezclean.

## Base atual

- Login por e-mail e senha
- Agenda, clientes e bloqueios de horário
- Catálogo de orçamento carregado a partir da tabela de preços:
  - `catalogo_precos`
  - `modelos_sofa`
  - `condicoes_limpeza`
  - `regioes_atendimento`

Os dados são isolados por usuário com RLS no Supabase. Leads e agendamentos antigos continuam na planilha até a importação revisada.
