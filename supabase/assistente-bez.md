# Assistente Bez

A Agenda acessa o Supabase com a sessão já usada pelo painel. A função também valida o token em `/auth/v1/user` e usa o token do usuário para ler `agendamentos`, `bloqueios_agenda`, `clientes`, `apartamentos` e `catalogo_precos`. As políticas RLS conferidas permitem acesso por `owner_id` ao papel `authenticated`.

## Como funciona (desde 27/11/2026)

O Assistente Bez segue o modelo da assistente da Elis: o DeepSeek (`deepseek-flash`) recebe uma **caixa de ferramentas** e decide quais usar, em até 6 rodadas por pergunta. Cada ferramenta é executada pela Edge Function com o token da sessão (RLS por `owner_id`), e o resultado volta para o modelo escrever a resposta.

| Ferramenta | O que faz | Grava algo? |
|---|---|---|
| `ver_agenda` | Atendimentos e bloqueios de até 31 dias, com cliente, telefone, serviço, valor, pagamento e endereço; filtro opcional por cidade/bairro. O painel mostra a lista clicável. | Não |
| `horarios_livres` | Janelas livres de 30 min ou mais entre 08h e 18h. | Não |
| `buscar_clientes` | Até 15 clientes por nome, telefone, bairro ou cidade, com os últimos atendimentos. | Não |
| `clientes_para_retorno` | Clientes com último atendimento concluído há N meses (padrão 6) e nada marcado no futuro. | Não |
| `orcamentos_pendentes` | Orçamentos em rascunho/enviado e aprovados que ainda não viraram agendamento. | Não |
| `faturamento` | Até 366 dias: concluído (recebido), ticket médio, pagamento pendente, previsto, por tipo e itens mais vendidos. É receita: o painel não tem despesas. | Não |
| `tabela_precos` | Catálogo ativo, Oferta 40% e promoção. | Não |
| `modelos_mensagem` | Modelos da página Mensagens (sem os de campanha). | Não |
| `link_whatsapp` | Monta o botão `wa.me` com a mensagem pronta (máx. 10 por resposta). **Não envia**: a equipe abre o WhatsApp e envia. | Não |
| `propor_agendamento` | Mesmo rascunho de antes (`buildBookingDraft`): tabela de preços, Oferta 40%, cliente/apartamento e conflitos. Sem endereço (fala ou cadastro), a assistente pergunta antes de mostrar o cartão (apartamentos usam o endereço do prédio). | Não: só grava quando a equipe toca em **Confirmar e agendar** (`agendamento_salvar_direto`) |
| `propor_orcamento` | Cartão de orçamento novo (rascunho): cliente existente ou novo (com WhatsApp), preços da tabela (`valor_normal`), Oferta 40% em sofás, validade opcional. | No **Confirmar**: `clientes` (se novo) → `orcamentos` → `orcamento_itens`, como a página de Orçamentos; se os itens falharem, o orçamento é apagado |
| `propor_agendar_orcamento` | Cartão para agendar um orçamento existente com os mesmos itens e valor, com aviso de conflito. Endereço: o dito, o do orçamento ou o do cadastro; sem nenhum, a assistente pergunta antes. | No **Confirmar**: `agendamento_salvar_direto` + orçamento vira `aprovado` com `agendamento_id`; orçamento de campanha usa `campanha_agendar_orcamento` |
| `propor_bloqueio` | Cartão para bloquear horário ou dia inteiro, avisando o que já existe no horário. | No **Confirmar**: insert em `bloqueios_agenda` |
| `propor_concluir` | Cartão para marcar atendimento como concluído e, opcionalmente, pedir avaliação (só cliente ativo com WhatsApp válido). | No **Confirmar**: `status = concluido` só se o status não mudou; depois a function `pedir-avaliacao` (uma vez por cliente) |

**Como as ações funcionam:** o servidor valida e monta o cartão (dados faltando, cliente ambíguo, item sem preço, data no passado ou orçamento já agendado voltam como erro para a IA perguntar). Quem grava é o navegador, com a sessão da própria equipe e pelos mesmos caminhos dos botões do painel, só depois do toque em confirmar. "Cancelar" não altera nada. Máximo de 5 cartões por resposta.

**Permissões (Configurações → Assistente Bez):** três chaves, guardadas em `user_metadata.assistente` (o que nunca foi configurado vale como ligado): **Consultar**, **Redigir mensagens** e **Agir com confirmação**. O servidor só entrega à IA as ferramentas liberadas e confere de novo antes de executar; com tudo desligado, responde sem chamar a IA nem gastar cota.

Erros de uma ferramenta (período grande demais, telefone inválido, resultado acima de 20 mil caracteres) voltam para o modelo como mensagem, e ele explica ou tenta de novo com um filtro menor. O tempo total por pergunta é limitado a 110 s.

**Memória da conversa:** o navegador manda as últimas 8 mensagens (só texto, até 1.500 caracteres cada) junto com a pergunta, para entender "e amanhã?". Ela fica só na memória da aba e some ao recarregar ou sair. O servidor não guarda conversas.

**Fora do escopo, de propósito:** editar, remarcar, cancelar e excluir.

## Privacidade e limites

**Mudança em relação à versão anterior (decisão de 27/11/2026, "opção A"):** antes, nenhum registro do Supabase ia para o DeepSeek. Agora, para responder, o servidor envia ao DeepSeek os dados que cada ferramenta consultou: nomes, telefones, endereços e observações de clientes, valores de atendimentos e orçamentos, e o histórico curto da conversa. Isso fica sob a política de privacidade e retenção do DeepSeek (empresa chinesa), que deve ser lida antes de usar com dados reais de clientes (LGPD). Só os dados da conta logada são lidos (RLS), e nada é enviado sem alguém perguntar. Tokens, chaves e identificadores de sessão não vão ao modelo.

Os textos guardados no painel (observações, nomes) são tratados como dados, não como instruções; mesmo assim, como o modelo nunca grava nada sozinho, o pior efeito possível de um texto malicioso é uma resposta errada ou um rascunho que a equipe recusa.

Mensagens aceitam até 600 caracteres, sem e-mails ou links (áudios WAV/Ogg até 60 segundos / 4 MiB). A cota continua: 5 perguntas por minuto e 30 por dia por conta, 200 por dia no projeto, reservada antes de chamar o ASR/DeepSeek (uma pergunta conta uma vez, mesmo usando várias ferramentas).

## Atualização em produção, após aprovação

1. Confirme que `DEEPSEEK_API_KEY` segue configurada nos segredos do projeto.
2. Publique a Edge Function `assistente-bez` com **quatro** arquivos: `index.ts`, `core.mjs`, `ferramentas.mjs` e `acoes.mjs`. Não há migração nova.
3. Publique o painel (cache `20261127b`).
4. Teste com a conta real: "agenda de hoje", "orçamentos em aberto", "clientes há mais de 6 meses sem atendimento", "faturamento do mês", "escreve um lembrete para <cliente>" (o botão abre o WhatsApp sem enviar) e um agendamento por áudio (o cartão aparece e nada é salvo antes de confirmar). Depois, um cartão de cada ação: bloqueio de teste (apague em Indisponíveis), orçamento de teste, agendar esse orçamento, concluir um atendimento sem avaliação e, por fim, desligar "Agir" em Configurações e ver a assistente recusar.
5. Se o DeepSeek não aceitar ferramentas no modelo `deepseek-flash`, a resposta volta "indisponível": nesse caso reverta só a function (passo de reversão abaixo).

## Validação antes da publicação

O Postgres local cobre o isolamento entre duas identidades, as cotas e a reversão. A prévia local cobre o fluxo de abrir detalhes pela conversa. A chamada ao DeepSeek usa um provedor simulado nesses testes (inclusive o laço de ferramentas da versão de 27/11/2026, que ainda não foi testado com o DeepSeek real). O projeto de produção é `bezclean-painel` (`qunaqtxadifmwbmycqum`). A conferência de catálogo encontrou RLS por `owner_id` nas tabelas da Agenda. O segredo `DEEPSEEK_API_KEY` foi encontrado na lista do projeto. Em 20/11/2026, uma consulta autenticada confirmou o funcionamento do DeepSeek e retornou oito agendamentos.

## Ativação em produção, após aprovação

1. Confirme o nome `DEEPSEEK_API_KEY` na lista de segredos do projeto, sem abrir ou copiar seu valor. Use o segredo existente se estiver configurado.
2. Aplique a [migração de cota](migrations/20261120220241_assistente_bez_limites.sql) ao projeto `bezclean-painel`. Ela cria o esquema privado `assistente_bez_private`, a tabela `quota` com RLS e a RPC `public.assistente_bez_reservar_consulta(uuid)`, executável por `service_role`. A migração só cria os objetos de cota. As tabelas e políticas da Agenda seguem em uso.
3. Publique a Edge Function `assistente-bez` com `index.ts` e `core.mjs`. A função valida a sessão no Supabase e usa a sessão para ler a Agenda. A chave de servidor autentica somente a reserva de cota. A origem padrão é `https://painel.bezclean.com.br`.
4. Verifique a recusa sem sessão e execute, com uma conta autorizada, uma consulta por data sem dados pessoais. Confirme a resposta real do DeepSeek e o resultado com os identificadores esperados. Em caso de falha, pause antes de publicar o frontend.
5. Publique a branch `feat/proposta-agenda-visual` no GitHub Pages via `main`. A versão `20261120d` atualiza a interface da Agenda, a conversa por texto e o cache do PWA. Confira no domínio publicado a abertura de um atendimento pela conversa.

## Reversão

A referência anterior ao lançamento é a `main` em `5af70cc`, com cache `20261119g`. Se a publicação passar por um commit de merge, reverta esse merge num novo commit. Atualize a versão do cache no service worker, no PWA e nos HTMLs com um identificador novo para que as instalações recebam os arquivos restaurados. Verifique que a versão anterior voltou ao domínio.

Desative `assistente-bez` separadamente, se necessário. Os contadores podem ficar no esquema privado. Se for preciso removê-los, execute o [SQL de reversão](assistente_bez_limites_rollback.sql) depois de desativar a função. O SQL remove a RPC, a tabela e o esquema de cotas e descarta as contagens. Os agendamentos existentes são preservados.
