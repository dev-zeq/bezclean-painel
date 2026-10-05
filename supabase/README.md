Campanhas: migração aditiva, sem apagar registros existentes.
Aplicar campanhas_mvp.sql no projeto bezclean-painel antes de publicar o frontend.
Todas as funções de operação usam SECURITY INVOKER e RLS do usuário autenticado.
Cadastros existentes com telefones repetidos são preservados; novos cadastros ou alterações que criem repetição são rejeitados.
Os totais são derivados dos agendamentos e orçamentos, sem tabela de faturamento paralelo.
