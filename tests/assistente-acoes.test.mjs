import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AcaoInvalida,
  montarAgendarOrcamento,
  montarBloqueio,
  montarConcluir,
  montarOrcamento,
  precificarItens
} from "../supabase/functions/assistente-bez/acoes.mjs";
import { ferramentasPermitidas, permissoes, promptSistema } from "../supabase/functions/assistente-bez/ferramentas.mjs";
import { createAssistantHandler } from "../supabase/functions/assistente-bez/index.ts";

const day = "2026-11-24";
const now = Date.parse("2026-11-23T12:00:00-03:00");
const catalog = [
  { id: "cat-sofa3", nome: "Sofá 3 módulos", valor: 199, valor_normal: 199 },
  { id: "cat-cad", nome: "Cadeira", valor: 30, valor_normal: 35 }
];
const clients = [
  { id: "cli-1", nome: "João Silva", telefone: "47988887777", endereco: "Av. Brasil, 50", cidade: "Balneário Camboriú" },
  { id: "cli-2", nome: "Maria Clara", telefone: "47977776666" },
  { id: "cli-3", nome: "Maria José", telefone: "47966665555" }
];
const busy = [{ id: "a1", status: "confirmado", tipo: "estofados", inicio_em: day + "T09:00:00-03:00", fim_em: day + "T11:00:00-03:00", clientes: { nome: "Ana" } }];

test("permissões: tudo ligado por padrão e cada nível tira só as suas ferramentas", () => {
  assert.deepEqual(permissoes({}), { consultar: true, redigir: true, agir: true });
  assert.deepEqual(permissoes({ assistente: { agir: false } }), { consultar: true, redigir: true, agir: false });
  const nomes = perm => ferramentasPermitidas(perm).map(f => f.function.name);
  assert.equal(nomes(permissoes({})).length, 16);
  assert.ok(!nomes(permissoes({ assistente: { agir: false } })).some(n => n.startsWith("propor_")));
  assert.deepEqual(nomes(permissoes({ assistente: { consultar: false, agir: false } })), ["modelos_mensagem", "link_whatsapp"]);
  assert.match(promptSistema(new Date(now), { consultar: true, redigir: false, agir: true }), /desligou em Configurações: redigir mensagens/);
  assert.doesNotMatch(promptSistema(new Date(now)), /desligou/);
});

test("bloqueio: horário, dia inteiro, conflitos avisados e datas passadas recusadas", () => {
  const card = montarBloqueio({ data: day, hora_inicio: "10:00", hora_fim: "12:00", motivo: "Dentista" }, { eventos: busy }, now);
  assert.equal(card.tipo, "bloqueio");
  assert.deepEqual(card.payload, { inicio_em: "2026-11-24T13:00:00.000Z", fim_em: "2026-11-24T15:00:00.000Z", motivo: "Dentista" });
  assert.deepEqual(card.linhas[0], ["Quando", "24/11/2026 · 10:00–12:00"]);
  assert.match(card.avisos[0], /09:00–11:00 · Ana/);
  const whole = montarBloqueio({ data: day, dia_inteiro: true }, {}, now);
  assert.equal(whole.payload.inicio_em, "2026-11-24T03:00:00.000Z");
  assert.equal(whole.payload.fim_em, "2026-11-25T03:00:00.000Z");
  assert.throws(() => montarBloqueio({ data: "2026-11-20", dia_inteiro: true }, {}, now), /já passou/);
  assert.throws(() => montarBloqueio({ data: day, hora_inicio: "10:00" }, {}, now), /término/);
  assert.throws(() => montarBloqueio({ data: day, hora_inicio: "12:00", hora_fim: "10:00" }, {}, now), /depois do início/);
});

test("concluir: só atendimentos abertos, avaliação só com WhatsApp válido", () => {
  const ev = { id: "a1", tipo: "estofados", status: "confirmado", inicio_em: "2026-11-23T09:00:00-03:00", fim_em: "2026-11-23T11:00:00-03:00", cliente_id: "cli-1", valor: 300, descricao_servico: "Sofá", clientes: { nome: "João", telefone: "47988887777" } };
  const card = montarConcluir(ev, true, now);
  assert.deepEqual(card.payload, { agendamento_id: "a1", status_atual: "confirmado", pedir_avaliacao: true, cliente_id: "cli-1" });
  assert.equal(card.confirmar, "Concluir e pedir avaliação");
  const noPhone = montarConcluir({ ...ev, clientes: { nome: "João", telefone: "123" } }, true, now);
  assert.equal(noPhone.payload.pedir_avaliacao, false);
  assert.match(noPhone.avisos[0], /Sem WhatsApp válido/);
  assert.match(montarConcluir({ ...ev, inicio_em: "2026-11-30T09:00:00-03:00" }, false, now).avisos[0], /ainda não começou/);
  assert.throws(() => montarConcluir({ ...ev, status: "concluido" }, false, now), /já está concluído/);
  assert.throws(() => montarConcluir({ ...ev, status: "cancelado" }, false, now), /cancelado/);
  assert.throws(() => montarConcluir(undefined, false, now), AcaoInvalida);
});

test("orçamento: preços da tabela, Oferta 40% em sofás, cliente existente ou novo com WhatsApp", () => {
  const card = montarOrcamento({ cliente_nome: "João Silva", itens: [{ nome: "sofá 3 modos", quantidade: 1 }, { nome: "cadeiras", quantidade: 4 }], validade_dias: 7 }, { clientes: clients, catalogo: catalog, oferta40: true }, now);
  assert.equal(card.payload.cliente_id, "cli-1");
  assert.equal(card.payload.novo_cliente, null);
  assert.deepEqual(card.payload.itens.map(i => [i.nome, i.quantidade, i.valor_unitario, i.valor_original, i.modalidade_preco, i.valor_total]), [
    ["Sofá 3 módulos", 1, 199, 331.67, "desconto", 199],
    ["Cadeira", 4, 35, null, "normal", 140]
  ]);
  assert.deepEqual(card.payload.orcamento, { status: "rascunho", validade_em: "2026-11-30", endereco: "Av. Brasil, 50, Balneário Camboriú", observacoes: null, valor_total: 339 });

  const fresh = montarOrcamento({ cliente_nome: "Paula Souza", cliente_telefone: "47 99999-0000", itens: [{ nome: "Tapete", valor_unitario: 80 }] }, { clientes: clients, catalogo: catalog, oferta40: false }, now);
  assert.deepEqual(fresh.payload.novo_cliente, { nome: "Paula Souza", telefone: "47 99999-0000", endereco: null });
  assert.equal(fresh.payload.itens[0].valor_unitario, 80);

  assert.throws(() => montarOrcamento({ cliente_nome: "Maria", itens: [{ nome: "Cadeira" }] }, { clientes: clients, catalogo: catalog }, now), /Maria Clara, Maria José/);
  assert.throws(() => montarOrcamento({ cliente_nome: "Paula Souza", itens: [{ nome: "Cadeira" }] }, { clientes: clients, catalogo: catalog }, now), /informe o WhatsApp/);
  assert.throws(() => precificarItens([{ nome: "Sofá 2 módulos" }], catalog, true), /Sem preço na tabela: Sofá 2 módulos/);
  assert.throws(() => precificarItens([], catalog, true), /quais itens/);
});

test("agendar orçamento: copia itens e valor, avisa conflito e recusa já agendado", () => {
  const quote = {
    id: "o1", cliente_id: "cli-1", status: "enviado", valor_total: 339, endereco: "Rua 1", observacoes: "Portão azul",
    clientes: { nome: "João Silva" },
    orcamento_itens: [{ catalogo_preco_id: "cat-sofa3", nome: "Sofá 3 módulos", quantidade: 1, valor_unitario: 199, valor_total: 199, valor_original: 331.67 }]
  };
  const card = montarAgendarOrcamento(quote, { data: day, hora_inicio: "10:00" }, { eventos: busy }, now);
  assert.equal(card.confirmar, "Agendar mesmo assim");
  assert.match(card.avisos.join(" "), /Duração padrão/);
  assert.match(card.avisos.join(" "), /Conflito: 09:00–11:00/);
  assert.equal(card.payload.fim_em, "2026-11-24T15:00:00.000Z");
  assert.equal(card.payload.campanha, false);
  assert.equal(card.payload.descricao_servico, "Sofá 3 módulos");
  assert.equal(card.payload.itens[0].valor_original, 331.67);
  const free = montarAgendarOrcamento({ ...quote, campanha_cliente_id: "cc1" }, { data: day, hora_inicio: "14:00", duracao_minutos: 90 }, { eventos: busy }, now);
  assert.equal(free.confirmar, "Agendar");
  assert.equal(free.payload.campanha, true);
  assert.throws(() => montarAgendarOrcamento({ ...quote, agendamento_id: "a9" }, { data: day, hora_inicio: "10:00" }, {}, now), /já foi agendado/);
  assert.throws(() => montarAgendarOrcamento({ ...quote, status: "recusado" }, { data: day, hora_inicio: "10:00" }, {}, now), /recusado/);
  assert.throws(() => montarAgendarOrcamento({ ...quote, orcamento_itens: [] }, { data: day, hora_inicio: "10:00" }, {}, now), /não tem itens/);
});

const origin = "http://localhost:8000";
const userId = "a0b713b9-4b00-4bdd-ab2c-8390d2cee1be";
const toolCall = (name, args) => ({ id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } });

function setup({ metadata = {}, script, tables = {} }) {
  const calls = [];
  const bodies = [];
  const config = { base: "https://supabase.example", publishable: "pub-test", quotaKey: "sb_secret_test", deepseekKey: "deepseek-test", origins: [origin] };
  const handler = createAssistantHandler(config, async (url, options = {}) => {
    calls.push({ url: new URL(url), ...options });
    if (url.includes("/auth/")) return Response.json({ id: userId, user_metadata: metadata });
    if (url.includes("/rpc/")) return Response.json("ok");
    if (url.includes("chat/completions")) {
      bodies.push(JSON.parse(options.body));
      return Response.json(script[Math.min(bodies.length - 1, script.length - 1)]);
    }
    const table = new URL(url).pathname.split("/").pop();
    if (table in tables) return Response.json(tables[table]);
    return Response.json([]);
  }, () => new Date(now));
  const ask = () => handler(new Request("https://supabase.example/functions/v1/assistente-bez", {
    method: "POST", headers: { authorization: "Bearer session-test", origin }, body: JSON.stringify({ question: "bloqueia amanhã das 10 às 12" })
  }));
  return { calls, bodies, ask };
}

test("servidor devolve o cartão, não grava nada e respeita permissões", async () => {
  const use = { choices: [{ message: { role: "assistant", content: "", tool_calls: [toolCall("propor_bloqueio", { data: day, hora_inicio: "10:00", hora_fim: "12:00" })] } }] };
  const done = { choices: [{ message: { role: "assistant", content: "Confira o cartão e toque em Bloquear." } }] };
  const on = setup({ script: [use, done] });
  const body = await (await on.ask()).json();
  assert.equal(body.acoes.length, 1);
  assert.equal(body.acoes[0].tipo, "bloqueio");
  assert.equal(JSON.parse(on.bodies[1].messages.at(-1).content).salvo, false);
  assert.ok(on.calls.every(c => !c.method || c.method === "GET" || c.url.pathname.includes("/rpc/") || c.url.hostname.includes("deepseek")));

  // Com "agir" desligado, o modelo nem recebe a ferramenta e o servidor recusa se ela vier mesmo assim.
  const off = setup({ metadata: { assistente: { agir: false } }, script: [use, done] });
  const offBody = await (await off.ask()).json();
  assert.ok(!off.bodies[0].tools.some(t => t.function.name === "propor_bloqueio"));
  assert.equal(offBody.acoes, undefined);
  assert.match(off.bodies[1].messages.at(-1).content, /Desligado pela equipe/);

  // Tudo desligado: responde sem gastar cota nem chamar a IA.
  const none = setup({ metadata: { assistente: { consultar: false, redigir: false, agir: false } }, script: [done] });
  const noneBody = await (await none.ask()).json();
  assert.match(noneBody.answer, /desligado/);
  assert.equal(none.calls.length, 1);
});

test("ids inválidos e erros de validação voltam ao modelo como pergunta", async () => {
  const use = { choices: [{ message: { role: "assistant", content: "", tool_calls: [
    toolCall("propor_concluir", { agendamento_id: "x;drop" }),
    toolCall("propor_orcamento", { cliente_nome: "Maria", itens: [{ nome: "Cadeira" }] })
  ] } }] };
  const done = { choices: [{ message: { role: "assistant", content: "Qual Maria?" } }] };
  const t = setup({ script: [use, done], tables: { clientes: clients, catalogo_precos: catalog } });
  const body = await (await t.ask()).json();
  assert.equal(body.acoes, undefined);
  const results = t.bodies[1].messages.filter(m => m.role === "tool").map(m => JSON.parse(m.content).erro);
  assert.match(results[0], /agendamento_id inválido/);
  assert.match(results[1], /Mais de um cliente parecido/);
  assert.ok(!t.calls.some(c => c.url.pathname.endsWith("/agendamentos")));
});

test("endereço: agendar orçamento usa o do orçamento ou do cadastro e pergunta se não houver nenhum", () => {
  const quote = { id: "o1", cliente_id: "c1", status: "enviado", valor_total: 100, endereco: null,
    clientes: { nome: "Bruna", endereco: "Rua 2", bairro: "Centro", cidade: "Itapema" },
    orcamento_itens: [{ nome: "Cadeira", quantidade: 1, valor_unitario: 100, valor_total: 100 }] };
  assert.equal(montarAgendarOrcamento(quote, { data: day, hora_inicio: "10:00" }, {}, now).payload.endereco, "Rua 2, Centro, Itapema");
  assert.equal(montarAgendarOrcamento({ ...quote, endereco: "Rua 9" }, { data: day, hora_inicio: "10:00" }, {}, now).payload.endereco, "Rua 9");
  assert.throws(() => montarAgendarOrcamento({ ...quote, clientes: { nome: "Bruna" } }, { data: day, hora_inicio: "10:00" }, {}, now), /Pergunte o endereço/);
  assert.equal(montarAgendarOrcamento({ ...quote, clientes: { nome: "Bruna" } }, { data: day, hora_inicio: "10:00", endereco: "Rua 5" }, {}, now).payload.endereco, "Rua 5");
});

test("endereço: agendar direto sem endereço pergunta antes de mostrar o cartão", async () => {
  const ask = args => ({ choices: [{ message: { role: "assistant", content: "", tool_calls: [toolCall("propor_agendamento", args)] } }] });
  const done = { choices: [{ message: { role: "assistant", content: "Qual o endereço?" } }] };
  const base = { data: day, hora_inicio: "10:00", cliente_nome: "Paula Nova", itens: [{ nome: "Cadeira", quantidade: 1 }] };
  const sem = setup({ script: [ask(base), done], tables: { clientes: clients, catalogo_precos: catalog } });
  const body = await (await sem.ask()).json();
  assert.equal(body.bookingDraft, undefined);
  assert.match(sem.bodies[1].messages.at(-1).content, /Pergunte o endereço/);
  const com = setup({ script: [ask({ ...base, endereco: "Rua 1" }), done], tables: { clientes: clients, catalogo_precos: catalog } });
  assert.equal((await (await com.ask()).json()).bookingDraft.endereco, "Rua 1");
  const cadastro = setup({ script: [ask({ ...base, cliente_nome: "João Silva" }), done], tables: { clientes: clients, catalogo_precos: catalog } });
  assert.match((await (await cadastro.ask()).json()).bookingDraft.endereco, /Av\. Brasil/);
});

test("pagamento: estofados concluído é pago; faxinas e apartamentos seguem o que foi marcado", async () => {
  const { pagamentoEfetivo, resumoAReceber, resumoFaturamento } = await import("../supabase/functions/assistente-bez/ferramentas.mjs");
  const { montarPagamento } = await import("../supabase/functions/assistente-bez/acoes.mjs");
  assert.equal(pagamentoEfetivo({ tipo: "estofados", status: "concluido", status_pagamento: "pendente" }), "pago");
  assert.equal(pagamentoEfetivo({ tipo: "faxina", status: "concluido", status_pagamento: "pendente" }), "pendente");
  assert.equal(pagamentoEfetivo({ tipo: "faxina", status: "confirmado" }), null);
  const evs = [
    { id: "f1", tipo: "faxina", status: "concluido", status_pagamento: "pendente", valor: 150, inicio_em: "2026-11-20T09:00:00-03:00", fim_em: "2026-11-20T13:00:00-03:00", clientes: { nome: "Dona Maria", telefone: "47999990001" } },
    { id: "p1", tipo: "apartamento", status: "concluido", status_pagamento: "parcial", valor: 200, inicio_em: "2026-11-21T09:00:00-03:00", fim_em: "2026-11-21T11:00:00-03:00", apartamentos: { nome: "Apto 101", contato_nome: "Carlos", contato_telefone: "47988880000" } },
    { id: "f2", tipo: "faxina", status: "concluido", status_pagamento: "pago", valor: 150 },
    { id: "e1", tipo: "estofados", status: "concluido", status_pagamento: "pendente", valor: 300 }
  ];
  const r = resumoAReceber(evs);
  assert.equal(r.quantidade, 2);
  assert.equal(r.valor, 350);
  assert.deepEqual(r.atendimentos.map(a => [a.cliente, a.telefone]), [["Dona Maria", "47999990001"], ["Apto 101", "47988880000"]]);
  assert.deepEqual(resumoFaturamento(evs).a_receber_faxinas_apartamentos, { atendimentos: 2, valor: 350 });

  const card = montarPagamento(evs[0], "pago");
  assert.deepEqual(card.payload, { agendamento_id: "f1", anterior: "pendente", status_pagamento: "pago" });
  assert.deepEqual(card.linhas[3], ["Pagamento", "Pendente → Pago"]);
  assert.equal(card.confirmar, "Marcar como pago");
  assert.throws(() => montarPagamento(evs[3], "pago"), /estofados, concluir já significa pago/);
  assert.throws(() => montarPagamento(evs[2], "pago"), /já está como pago/);
  assert.throws(() => montarPagamento({ ...evs[0], status: "cancelado" }, "pago"), /cancelado/);
  assert.throws(() => montarPagamento(evs[0], "talvez"), /Situação inválida/);
});
