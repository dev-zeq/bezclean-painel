# Progresso — Painel Bezclean

## Agenda e Assistente Bez — 20/11/2026

- As listas de agendamentos na conversa abrem os detalhes da Agenda pelo identificador retornado pelo Supabase. Os testes locais passaram em Chromium e WebKit, e o teste com duas contas no Postgres local confirmou o isolamento dos resultados e a proteção das cotas.
- O Assistente Bez abre pelo botão flutuante no canto direito do computador e no esquerdo do celular. No celular, a conversa ocupa até 86% da tela, com mensagens roláveis e o campo de texto acima do teclado. As mensagens da sessão continuam visíveis ao reabrir.
- A branch `feat/proposta-agenda-visual` integra as visões de dia, semana e mês da proposta ao Supabase. A Agenda reutiliza as operações do painel para cadastro, edição, conflitos, status, bloqueios, apartamentos e lixeira.
- O Assistente Bez por texto usa o DeepSeek para interpretar a pergunta. A Edge Function lê a Agenda com o token da sessão e monta a resposta localmente. A revisão por SQL somente leitura confirmou as colunas e o RLS por `owner_id` nas tabelas envolvidas.
- Na consulta de cobertura, 8 dos 16 atendimentos fora da lixeira e sem cancelamento tinham cidade, e 8 tinham bairro, no próprio agendamento ou no cliente vinculado. A busca informa quando há registros que ficaram de fora por localidade incompleta.
- Cada consulta aceita até 31 dias e reserva cota antes de chamar o provedor. Limites de desenvolvimento de 5 por minuto e 30 por dia por conta e 200 por dia para o projeto. A migração cria somente a estrutura de cota.
- A suíte Node, a validação da Edge Function com Deno, a migração e a reversão em Postgres isolado e os fluxos no navegador com dados fictícios passaram. A decisão foi seguir sem projeto de homologação.
- Após a autorização, a presença do segredo foi confirmada no projeto. A migração registrada como `20261120220241` foi aplicada e a Edge Function `assistente-bez` foi ativada. A função rejeitou chamadas sem sessão, com sessão inválida ou de origem fora do painel. O teste autenticado com o DeepSeek real retornou oito agendamentos no período consultado, antes da publicação do frontend.
- A prévia e o roteiro de ativação e reversão estão em [teste da Agenda](tests/README.md) e [implantação do Assistente Bez](supabase/assistente-bez.md). Voz fica para uma etapa posterior.

Última revisão geral do painel em 06/10/2026.

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
