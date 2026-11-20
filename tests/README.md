Execute `node tests/campanhas-core.test.cjs` e `node tests/campanhas-controller.test.cjs`.

Core: 7 cenários com valores conhecidos, normalização de telefone, último serviço concluído, cancelamento, contagem cumulativa e fuso brasileiro.
Controller: fixture em memória testa cadastro/reuso de telefone, vínculo único na campanha, abertura do WhatsApp sem confirmar envio, confirmação explícita, interesse, atualização dos valores após concluir atendimento, falha de conexão, novo cadastro e edição de modelo sem alterar histórico.

Os testes do controlador usam DOM mínimo; não validam layout ou o banco real. A fixture não envia WhatsApp e não acessa o Supabase.

Antes da publicação:
1. Aplicar `supabase/campanhas_mvp.sql` no projeto bezclean-painel.
2. Conferir políticas atuais de Clientes/Orçamentos/Agenda; as novas operações são SECURITY INVOKER e dependem delas.
3. Testar com usuário autenticado: iniciar, adicionar número existente em formatos distintos, adicionar cliente novo, abrir WhatsApp, confirmar envio, responder, marcar potencial R$ 600, criar orçamento, converter para agenda, concluir e cancelar, conferindo valores.
4. Conferir rejeição de vínculos pertencentes a outro usuário e execução sem autenticação; testar duplo clique e conflito de horário.
5. Validar visualmente em Safari/iPhone (320–390 px), teclado, fechar diálogos, retorno do WhatsApp e preservação da mensagem.
6. Publicar a branch somente após banco e fluxo real aprovados. O service worker foi atualizado para 20261005a.

Atualização de 05/10/2026: o usuário executou a migração com sucesso no Supabase. O conector confirmou as três novas tabelas, RLS habilitado e todos os campos adicionais nas tabelas existentes. O advisor não apontou problemas nas tabelas da campanha.

Consultas SQL continuam bloqueadas porque o ambiente exige aprovação e a política é `never`. O acesso ao painel pelo navegador também foi recusado. Os cenários autenticados e a inspeção visual de Safari/iPhone ainda não foram executados nesta sessão. O usuário autorizou publicar para teste no celular e computador com essas limitações informadas.

`node tests/orcamento-acrescimo.test.cjs`: cálculo do "+40% riscado" (preço riscado = preço final + 40%) e reconhecimento de itens salvos com essa opção.

`node tests/orcamento-seletor.test.cjs`: seletor rápido de itens (atalhos sem preço, soma de quantidade ao repetir o atalho, regra da Oferta 40% só para sofás, ligada/desligada e preferência salva no perfil).

`node tests/orcamento-datas.test.cjs`: datas de criação dos orçamentos no horário de Brasília ("Hoje, 14:30", "Ontem, 09:10", "18/11, 16:45") e o que conta como "feito hoje".

## Agenda e Assistente Bez

Com Node.js 22.18 ou mais recente, rode `node --test tests/*.test.cjs tests/*.test.mjs`. Para validar os tipos da Edge Function, rode `deno check supabase/functions/assistente-bez/index.ts`.

A prévia local abre com `node tests/agenda-preview.mjs` em [127.0.0.1:8126](http://127.0.0.1:8126/). Entre com `teste@example.test` e a senha `agenda-teste`. Os dados são fictícios e as alterações duram até reiniciar o servidor. O teste de navegador usa os componentes reais e uma API local. A interpretação da pergunta e a persistência das cotas são simuladas.

1. Alterne Dia, Semana e Mês e abra o atendimento de teste.
2. Edite o valor, agende uma faxina num horário ocupado e confira a opção de continuar após o aviso de conflito.
3. Adicione um bloqueio, abra Apartamentos e restaure o atendimento presente na Lixeira.
4. Abra o Assistente Bez pelo botão flutuante e pergunte “Quais horários estão livres hoje?” e “Tem atendimento em Itapema hoje?”. Feche e reabra para conferir se as mensagens continuam na conversa.
5. Alterne o tema e confira a navegação em largura de celular.
