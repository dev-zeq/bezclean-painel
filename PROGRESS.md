# Progresso — Painel Bezclean

Última revisão: 06/10/2026

Este arquivo registra o estado técnico do projeto. O acompanhamento geral também está no Notion, na página [Bezclean — Desenvolvimento do Painel](https://app.notion.com/p/3d9e5b50c622810298a5fb55c659affd).

## Resumo atual

- Em produção: login, agenda, clientes, orçamentos, mensagens, campanhas e PWA.
- Hospedagem: GitHub Pages com domínio configurado.
- Banco: Supabase com RLS para isolamento dos dados por usuário.
- Branch principal: `main`.
- Validação pendente: fluxo autenticado completo no banco real e revisão visual final em celular e computador.

## Concluído

### Base do projeto

- [x] Estrutura e arquitetura inicial do painel
- [x] Repositório no GitHub
- [x] GitHub Pages e domínio
- [x] Banco de dados no Supabase
- [x] Tabelas e políticas RLS por usuário
- [x] Manifesto, service worker e instalação como PWA

### Agenda

- [x] Criação e edição de agendamentos
- [x] Conclusão e cancelamento de atendimentos
- [x] Visualizações diária e mensal
- [x] Bloqueios de horário e indisponibilidades
- [x] Catálogo de serviços
- [x] Busca e cadastro rápido de clientes
- [x] Layout responsivo para uso móvel

### Clientes

- [x] Cadastro e edição
- [x] Busca por nome, WhatsApp, bairro ou cidade
- [x] Endereço, contato e observações
- [x] Histórico de agendamentos e orçamentos
- [x] Atalho para WhatsApp
- [x] Indicadores de agendados e recorrentes

### Orçamentos

- [x] Criação e edição de orçamentos
- [x] Itens, quantidades, observações e valores ajustáveis
- [x] Preço original e preço promocional
- [x] Status e validade padrão de sete dias
- [x] Conversão de orçamento aprovado em agendamento
- [x] Envio do texto pelo WhatsApp
- [x] Geração de PDF
- [x] Exibição de opção de parcelamento

### Mensagens

- [x] Modelos editáveis
- [x] Modelo de orçamento
- [x] Modelo de confirmação de agendamento
- [x] Modelo de lembrete
- [x] Modelo de pós-atendimento
- [x] Modelo de cobrança

Os modelos existem, mas confirmação, lembrete, pós-atendimento e cobrança ainda não estão integrados automaticamente aos respectivos fluxos.

### Campanhas

- [x] Campanha para reativação de clientes antigos
- [x] Cadastro rápido com reaproveitamento de telefone existente
- [x] Modelos e variações de mensagens
- [x] Abertura do WhatsApp sem confirmação automática de envio
- [x] Confirmação explícita de mensagem enviada
- [x] Registro de resposta, interesse e não interesse
- [x] Vínculo com orçamentos e agendamentos
- [x] Indicadores de potencial, agendado, realizado e meta
- [x] Migração aplicada no Supabase
- [x] RLS habilitado nas tabelas da campanha
- [x] Testes automatizados da lógica principal e do controlador

## Pendente

### Validação e acabamento

- [ ] Testar Agenda, Clientes, Orçamentos e Campanhas com usuário autenticado no Supabase real
- [ ] Validar conflito de horário e duplo clique
- [ ] Confirmar isolamento e rejeição de registros pertencentes a outro usuário
- [ ] Revisar visualmente em Safari/iPhone, entre 320 e 390 px
- [ ] Revisar visualmente em computador
- [ ] Testar teclado, abertura e fechamento de diálogos e retorno do WhatsApp
- [ ] Confirmar preservação das mensagens ao retornar do WhatsApp

### Financeiro

- [ ] Registrar pagamentos
- [ ] Registrar formas de pagamento
- [ ] Controlar valores a receber
- [ ] Criar resumo de faturamento
- [ ] Adicionar filtros por período
- [ ] Gerar recibo em PDF a partir do atendimento ou pagamento
- [ ] Preencher o recibo com cliente, serviços, valores e forma de pagamento
- [ ] Usar logo e dados cadastrais da Bezclean no recibo
- [ ] Preparar o envio futuro do recibo pelo WhatsApp

### WhatsApp e automações

- [ ] Integrar modelos de confirmação, lembrete e pós-atendimento aos fluxos operacionais
- [ ] Planejar integração com a API oficial do WhatsApp

## Próximos passos recomendados

1. Executar a validação manual completa com usuário autenticado.
2. Fazer a revisão visual final no celular e no computador.
3. Corrigir os problemas encontrados na validação.
4. Criar o módulo Financeiro e o recibo em PDF.
5. Integrar os modelos de mensagens aos fluxos operacionais.

## Testes

Execute:

```bash
node tests/campanhas-core.test.cjs
node tests/campanhas-controller.test.cjs
```

Na revisão de 06/10/2026, os 7 testes do núcleo e todos os cenários do controlador de Campanhas passaram.

Os testes atuais usam uma fixture em memória. Eles não validam o layout, o navegador real nem as permissões do projeto Supabase em produção.

## Referências técnicas

- Migração de Campanhas: `supabase/campanhas_mvp.sql`
- Notas de validação: `tests/README.md`
- Aplicação principal da Agenda: `assets/js/app.js`
- Lógica de Campanhas: `assets/js/campanhas-core.js` e `assets/js/campanhas.js`

## Ideias futuras

- [ ] Dashboard geral com indicadores
- [ ] Relatórios
- [ ] Automação de pós-venda
- [ ] Novos recursos de marketing
