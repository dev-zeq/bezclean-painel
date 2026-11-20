# Assistente Bez

A Agenda acessa o Supabase com a sessão já usada pelo painel. A função também valida o token em `/auth/v1/user` e usa o token do usuário para ler `agendamentos`, `bloqueios_agenda` e, para a busca por local, cidade e bairro de `clientes`. As políticas RLS conferidas permitem acesso por `owner_id` ao papel `authenticated`.

O DeepSeek recebe a pergunta digitada e a data de referência de São Paulo em uma chamada a `deepseek-flash`. A resposta final é formatada pela função com os horários e estados consultados. Registros do Supabase, nomes, descrições, endereços, valores e tokens ficam fora da chamada ao modelo. Telefones, e-mails e links em perguntas são rejeitados. Texto livre pode conter outros dados pessoais, por isso a interface orienta a equipe a evitá-los.

As listas de atendimentos incluem os identificadores do próprio usuário para abrir os detalhes na Agenda. Ao tocar num resultado, o painel consulta novamente o Supabase com a sessão atual e o RLS se aplica também a essa leitura.

As consultas aceitam até 400 caracteres, 31 dias e 200 registros por tabela. A disponibilidade é estimada entre 08h e 18h e lista janelas a partir de 30 minutos. As localidades vêm primeiro do agendamento e, quando ausentes, do cadastro vinculado. A busca sinaliza os registros que ficaram de fora por falta da localidade consultada. A função reserva cota antes da chamada ao modelo e retorna HTTP 429 ao atingir 5 consultas por minuto ou 30 por dia por conta, ou 200 por dia no projeto. A cota é compartilhada pelas instâncias e o dia vira à meia-noite em São Paulo.

## Validação antes da publicação

O Postgres local cobre o isolamento entre duas identidades, as cotas e a reversão. A prévia local cobre o fluxo de abrir detalhes pela conversa. A chamada ao DeepSeek usa um provedor simulado nesses testes. O projeto de produção é `bezclean-painel` (`qunaqtxadifmwbmycqum`). A conferência de catálogo encontrou RLS por `owner_id` nas tabelas da Agenda. O segredo `DEEPSEEK_API_KEY` foi encontrado na lista do projeto. Em 20/11/2026, uma consulta autenticada confirmou o funcionamento do DeepSeek e retornou oito agendamentos.

## Ativação em produção, após aprovação

1. Confirme o nome `DEEPSEEK_API_KEY` na lista de segredos do projeto, sem abrir ou copiar seu valor. Use o segredo existente se estiver configurado.
2. Aplique a [migração de cota](migrations/20261120220241_assistente_bez_limites.sql) ao projeto `bezclean-painel`. Ela cria o esquema privado `assistente_bez_private`, a tabela `quota` com RLS e a RPC `public.assistente_bez_reservar_consulta(uuid)`, executável por `service_role`. A migração só cria os objetos de cota. As tabelas e políticas da Agenda seguem em uso.
3. Publique a Edge Function `assistente-bez` com `index.ts` e `core.mjs`. A função valida a sessão no Supabase e usa a sessão para ler a Agenda. A chave de servidor autentica somente a reserva de cota. A origem padrão é `https://painel.bezclean.com.br`.
4. Verifique a recusa sem sessão e execute, com uma conta autorizada, uma consulta por data sem dados pessoais. Confirme a resposta real do DeepSeek e o resultado com os identificadores esperados. Em caso de falha, pause antes de publicar o frontend.
5. Publique a branch `feat/proposta-agenda-visual` no GitHub Pages via `main`. A versão `20261120d` atualiza a interface da Agenda, a conversa por texto e o cache do PWA. Confira no domínio publicado a abertura de um atendimento pela conversa.

## Reversão

A referência anterior ao lançamento é a `main` em `5af70cc`, com cache `20261119g`. Se a publicação passar por um commit de merge, reverta esse merge num novo commit. Atualize a versão do cache no service worker, no PWA e nos HTMLs com um identificador novo para que as instalações recebam os arquivos restaurados. Verifique que a versão anterior voltou ao domínio.

Desative `assistente-bez` separadamente, se necessário. Os contadores podem ficar no esquema privado. Se for preciso removê-los, execute o [SQL de reversão](assistente_bez_limites_rollback.sql) depois de desativar a função. O SQL remove a RPC, a tabela e o esquema de cotas e descarta as contagens. Os agendamentos existentes são preservados.
