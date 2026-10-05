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

Estado desta sessão: migração e consultas SQL foram rejeitadas pelo conector porque exigem aprovação e a política do ambiente é `never`. Testes de layout no navegador local também ficaram bloqueados. A produção não foi alterada.
