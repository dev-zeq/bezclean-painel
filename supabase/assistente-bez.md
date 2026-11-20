# Assistente Bez

A Agenda acessa o Supabase com a sessão já usada pelo painel. A função também valida o token em `/auth/v1/user` e usa o token do usuário para ler `agendamentos`, `bloqueios_agenda` e, para a busca por local, cidade e bairro de `clientes`. As políticas RLS conferidas permitem acesso por `owner_id` ao papel `authenticated`.

O DeepSeek recebe a pergunta digitada e a data de referência de São Paulo em uma chamada a `deepseek-flash`. A resposta final é formatada pela função com os horários e estados consultados. Registros do Supabase, nomes, descrições, endereços, valores e tokens ficam fora da chamada ao modelo. Telefones, e-mails e links em perguntas são rejeitados. Texto livre pode conter outros dados pessoais, por isso a interface orienta a equipe a evitá-los.

As consultas aceitam até 400 caracteres, 31 dias e 200 registros por tabela. A disponibilidade é estimada entre 08h e 18h e lista janelas a partir de 30 minutos. As localidades vêm primeiro do agendamento e, quando ausentes, do cadastro vinculado. A busca sinaliza os registros que ficaram de fora por falta da localidade consultada. A função reserva cota antes da chamada ao modelo e retorna HTTP 429 ao atingir 5 consultas por minuto ou 30 por dia por conta, ou 200 por dia no projeto. A cota é compartilhada pelas instâncias e o dia vira à meia-noite em São Paulo.

## Teste hospedado

1. Use um projeto Supabase de desenvolvimento com o esquema da Agenda, RLS equivalente e agendamentos fictícios de duas contas. Aponte o cliente do painel de teste para esse projeto.
2. Aplique a [migração de cota](migrations/20261120211147_assistente_bez_limites.sql) ao projeto de teste. Ela acrescenta um esquema privado com contadores e uma RPC exclusiva de `service_role`.
3. Configure `DEEPSEEK_API_KEY` como segredo da Edge Function e `ASSISTENTE_ALLOWED_ORIGINS` com a origem do painel de teste. O runtime usa as chaves Supabase fornecidas pelo projeto. Publique somente a função `assistente-bez` no projeto de teste.
4. Confira o isolamento entre contas, a recusa sem sessão, a pesquisa por local, a resposta de disponibilidade e o retorno 429 após atingir a cota.

## Ativação em produção

Após aprovar o teste hospedado e combinar a publicação, aplique a mesma migração ao projeto do painel, configure o segredo do DeepSeek, publique a Edge Function e valide a consulta com uma conta autorizada. Depois publique os arquivos da branch e o service worker atualizado no GitHub Pages. A migração acrescenta somente os contadores e a RPC. Os agendamentos existentes continuam nas tabelas atuais.

Se for preciso recuar, publique novamente a versão anterior do frontend. A Edge Function pode ser desativada separadamente. Os contadores podem ficar no esquema privado.
