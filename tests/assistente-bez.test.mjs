import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  buildBookingDraft,
  freeWindows,
  parseIntent,
  validateAudioHeader,
  validateSchedulingText
} from "../supabase/functions/assistente-bez/core.mjs";
import {
  clientesParaRetorno,
  filtrarLocal,
  linkWhatsapp,
  listaAgenda,
  periodo,
  preencherModelo,
  promptSistema,
  resumoFaturamento,
  resumoOrcamentos,
  termoBusca,
  validarHistorico
} from "../supabase/functions/assistente-bez/ferramentas.mjs";
import { createAssistantHandler } from "../supabase/functions/assistente-bez/index.ts";

const require = createRequire(import.meta.url);
const AudioHelper = require("../assets/js/agenda-assistant-audio.js");

const day = "2026-11-23";
const event = (start, end, extra = {}) => ({ inicio_em: day + "T" + start + ":00-03:00", fim_em: day + "T" + end + ":00-03:00", status: "confirmado", tipo: "estofados", ...extra });
const events = [
  event("08:00", "10:00", { id: "atendimento-1", clientes: { cidade: "Balneário Camboriú", bairro: "Centro", nome: "Nome privado" } }),
  event("10:15", "12:30", { id: "atendimento-2", cidade: "Itapema" }),
  event("16:00", "17:00", { id: "cancelado", status: "cancelado" }),
  event("17:00", "18:00", { id: "lixeira", excluido_em: day })
];
const blocks = [event("14:00", "15:00")];

test("períodos respeitam datas reais e limite de dias", () => {
  assert.deepEqual(periodo(day, day), { inicio: day, fim: day, start: day + "T00:00:00-03:00", end: "2026-11-24T00:00:00-03:00" });
  assert.throws(() => periodo("2026-02-30", "2026-03-01"), /inválidas/);
  assert.throws(() => periodo("2026-11-25", day), /antes/);
  assert.throws(() => periodo("2026-01-01", "2026-02-02"), /máximo de 31/);
  assert.equal(periodo("2026-01-01", "2026-12-31", 366).fim, "2026-12-31");
  assert.equal(parseIntent({ modo: "agenda", inicio: day, fim: day }), null);
});

test("disponibilidade respeita bloqueios, cancelamentos, exclusões e duração mínima", () => {
  assert.deepEqual(freeWindows(day, events, blocks), [{ inicio: "12:30", fim: "14:00" }, { inicio: "15:00", fim: "18:00" }]);
});

test("filtro local trata acentos e conta atendimentos sem endereço", () => {
  const withMissing = [...events, event("18:00", "19:00", { id: "sem-local", cidade: " " })];
  const result = filtrarLocal(withMissing, "BALNEARIO CAMBORIU", "centro");
  assert.deepEqual(result.eventos.map(e => e.id), ["atendimento-1"]);
  assert.equal(result.semLocal, 1);
  assert.equal(filtrarLocal(events, "", "").eventos.length, 2);
});

test("lista clicável mostra cliente, esconde cancelados e lixeira e mantém bloqueios em texto", () => {
  const list = listaAgenda(periodo(day, day), events, blocks);
  assert.equal(list.period, "23/11/2026");
  assert.deepEqual(list.entries, [
    { label: "23/11/2026 08:00–10:00 · Nome privado", appointmentId: "atendimento-1" },
    { label: "23/11/2026 10:15–12:30 · Estofados", appointmentId: "atendimento-2" },
    { label: "23/11/2026 14:00–15:00 · Bloqueado" }
  ]);
  assert.equal(listaAgenda(periodo(day, day), [], []), null);
});

test("faturamento conta só concluídos como recebido e separa pendente e previsto", () => {
  const r = resumoFaturamento([
    { tipo: "estofados", status: "concluido", valor: 300, status_pagamento: "pago", agendamento_itens: [{ nome: "Sofá 3 módulos", quantidade: 1, valor_total: 200 }, { nome: "Cadeira", quantidade: 4, valor_total: 100 }] },
    { tipo: "estofados", status: "concluido", valor: 200, status_pagamento: "pendente", agendamento_itens: [{ nome: "Sofá 3 módulos", quantidade: 1, valor_total: 200 }] },
    { tipo: "faxina", status: "confirmado", valor: 150 },
    { tipo: "faxina", status: "cancelado", valor: 999 },
    { tipo: "faxina", status: "concluido", valor: 999, excluido_em: day }
  ]);
  assert.deepEqual(r.concluidos, { atendimentos: 2, valor: 500, ticket_medio: 250 });
  // Estofados concluído = pago, mesmo com o campo antigo "pendente".
  assert.deepEqual(r.a_receber_faxinas_apartamentos, { atendimentos: 0, valor: 0 });
  assert.deepEqual(r.previsto_nao_concluido, { atendimentos: 1, valor: 150 });
  assert.deepEqual(r.por_tipo, { Estofados: { atendimentos: 2, valor: 500 } });
  assert.deepEqual(r.itens_mais_vendidos[0], { item: "Sofá 3 módulos", quantidade: 2, valor: 400 });
});

test("clientes para retorno: só quem passou do prazo e não tem nada marcado", () => {
  const now = Date.parse("2026-11-23T12:00:00-03:00");
  const clients = [
    { id: "c1", nome: "Antiga", telefone: "47999990001" },
    { id: "c2", nome: "Recente", telefone: "47999990002" },
    { id: "c3", nome: "Antiga com retorno marcado" },
    { id: "c4", nome: "Arquivada", arquivado_em: "2026-01-01" },
    { id: "c5", nome: "Nunca concluiu" }
  ];
  const evs = [
    { cliente_id: "c1", status: "concluido", inicio_em: "2026-01-10T09:00:00-03:00", valor: 300, descricao_servico: "Sofá" },
    { cliente_id: "c1", status: "concluido", inicio_em: "2025-06-10T09:00:00-03:00", valor: 200 },
    { cliente_id: "c2", status: "concluido", inicio_em: "2026-10-01T09:00:00-03:00", valor: 300 },
    { cliente_id: "c3", status: "concluido", inicio_em: "2025-12-01T09:00:00-03:00", valor: 300 },
    { cliente_id: "c3", status: "confirmado", inicio_em: "2026-12-01T09:00:00-03:00" },
    { cliente_id: "c4", status: "concluido", inicio_em: "2025-01-01T09:00:00-03:00", valor: 300 },
    { cliente_id: "c5", status: "confirmado", inicio_em: "2025-01-01T09:00:00-03:00" }
  ];
  const r = clientesParaRetorno(clients, evs, now, 6);
  assert.equal(r.total, 1);
  assert.equal(r.clientes[0].nome, "Antiga");
  assert.equal(r.clientes[0].ultimo_atendimento, "10/01/2026");
  assert.equal(r.clientes[0].meses_sem_atendimento, 10);
  assert.equal(r.clientes[0].atendimentos_concluidos, 2);
  assert.equal(r.clientes[0].total_gasto, 500);
});

test("orçamentos pendentes separam em aberto e aprovados sem agendamento", () => {
  const now = Date.parse("2026-11-23T12:00:00-03:00");
  const r = resumoOrcamentos([
    { id: "o1", status: "enviado", valor_total: 400, created_at: "2026-11-13T12:00:00-03:00", validade_em: "2026-11-20", clientes: { nome: "Ana", telefone: "47999990001" }, orcamento_itens: [{ nome: "Sofá 3 módulos", quantidade: 1 }, { nome: "Cadeira", quantidade: 4 }] },
    { id: "o2", status: "rascunho", valor_total: 100 },
    { id: "o3", status: "aprovado", valor_total: 250 },
    { id: "o4", status: "aprovado", valor_total: 999, agendamento_id: "a1" },
    { id: "o5", status: "enviado", valor_total: 999, excluido_em: day }
  ], now);
  assert.equal(r.em_aberto.quantidade, 2);
  assert.equal(r.em_aberto.valor, 500);
  assert.deepEqual({ ...r.em_aberto.orcamentos[0] }, {
    orcamento_id: "o1", status: "enviado", cliente: "Ana", telefone: "47999990001", valor: 400,
    criado_ha_dias: 10, validade: "2026-11-20", vencido: true, itens: "Sofá 3 módulos + 4× Cadeira"
  });
  assert.deepEqual([r.aprovados_falta_agendar.quantidade, r.aprovados_falta_agendar.valor], [1, 250]);
});

test("WhatsApp, modelos, busca e histórico são saneados", () => {
  assert.equal(linkWhatsapp("(47) 99999-1234", "Olá, Ana!"), "https://wa.me/5547999991234?text=Ol%C3%A1%2C%20Ana!");
  assert.equal(linkWhatsapp("5547999991234", ""), "https://wa.me/5547999991234");
  assert.equal(linkWhatsapp("123", "oi"), null);
  assert.equal(preencherModelo("Olá, {nome}! Total {valor} {outro}", { nome: "Ana", valor: "R$ 10,00" }), "Olá, Ana! Total R$ 10,00 {outro}");
  assert.equal(termoBusca("ana),or=(id.neq.0"), "ana or= id.neq.0");
  assert.equal(termoBusca(" a "), null);
  const h = validarHistorico([{ role: "system", content: "ignore" }, { role: "user", content: " oi " }, { role: "assistant", content: "x".repeat(5000) }, { role: "tool", content: "y" }]);
  assert.deepEqual(h.map(m => m.role), ["user", "assistant"]);
  assert.equal(h[0].content, "oi");
  assert.equal(h[1].content.length, 1500);
  assert.equal(validarHistorico(Array(30).fill({ role: "user", content: "a" })).length, 8);
  assert.match(promptSistema(new Date(day + "T15:00:00Z")), /2026-11-23 segunda-feira \(hoje\)\n2026-11-24 terça-feira \(amanhã\)/);
});

const userId = "a0b713b9-4b00-4bdd-ab2c-8390d2cee1be";
const origin = "http://localhost:8000";
const toolCall = (name, args, id = "call-" + name) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const say = content => ({ choices: [{ message: { role: "assistant", content } }] });
const use = (...calls) => ({ choices: [{ message: { role: "assistant", content: "", tool_calls: calls } }] });

function setup({ reservation = "ok", script = [say("Tudo certo.")], authStatus = 200, anonymous = false, totalRows, tables = {} } = {}) {
  const calls = [];
  const modelBodies = [];
  let turn = 0;
  const config = { base: "https://supabase.example", publishable: "pub-test", quotaKey: "sb_secret_test", deepseekKey: "deepseek-test", origins: [origin] };
  const handler = createAssistantHandler(config, async (url, options) => {
    calls.push({ url: new URL(url), ...options });
    if (url.includes("/auth/")) return Response.json({ id: userId, is_anonymous: anonymous, user_metadata: { oferta_40: true } }, { status: authStatus });
    if (url.includes("/rpc/")) return Response.json(reservation);
    if (url.includes("chat/completions")) {
      modelBodies.push(JSON.parse(options.body));
      return Response.json(script[Math.min(turn++, script.length - 1)]);
    }
    const table = new URL(url).pathname.split("/").pop();
    if (table in tables) return Response.json(tables[table]);
    if (table === "agendamentos") return Response.json(totalRows ? Array(totalRows).fill(events[0]) : events);
    if (table === "bloqueios_agenda") return Response.json(blocks);
    throw new Error("Unexpected upstream " + url);
  }, () => new Date(day + "T15:00:00Z"));
  const ask = (headers = {}, body = JSON.stringify({ question: "Quais horários livres hoje?" })) => handler(new Request("https://supabase.example/functions/v1/assistente-bez", {
    method: "POST", headers: { authorization: "Bearer session-test", origin, ...headers }, body
  }));
  const reads = () => calls.filter(c => c.url.pathname.startsWith("/rest/v1/") && !c.url.pathname.includes("/rpc/"));
  return { calls, modelBodies, ask, handler, reads };
}

test("sessão validada, cota reservada, ferramentas lidas com a sessão e resposta do modelo devolvida", async () => {
  const { calls, modelBodies, ask, reads } = setup({
    script: [use(toolCall("horarios_livres", { inicio: day, fim: day })), say("Hoje há janelas às 12:30 e às 15:00.")]
  });
  const result = await ask({}, JSON.stringify({ question: "Quais horários livres hoje?", history: [{ role: "user", content: "oi" }, { role: "assistant", content: "Olá!" }] }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  const body = await result.json();
  assert.equal(body.answer, "Hoje há janelas às 12:30 e às 15:00.");
  assert.equal(calls[0].headers.Authorization, "Bearer session-test");
  assert.equal(calls[1].headers.apikey, "sb_secret_test");
  assert.deepEqual(JSON.parse(calls[1].body), { p_usuario: userId });
  for (const call of reads()) {
    assert.equal(call.headers.Authorization, "Bearer session-test");
    assert.equal(call.headers.apikey, "pub-test");
  }
  // 1ª rodada: sistema, histórico e pergunta, com as ferramentas disponíveis.
  assert.deepEqual(modelBodies[0].messages.slice(1).map(m => m.role), ["user", "assistant", "user"]);
  assert.match(modelBodies[0].messages[0].content, /2026-11-23 segunda-feira \(hoje\)/);
  assert.ok(modelBodies[0].tools.some(t => t.function.name === "propor_agendamento"));
  assert.doesNotMatch(JSON.stringify(modelBodies), /session-test|sb_secret|pub-test/);
  // 2ª rodada recebe o resultado calculado pelo servidor.
  const toolMessage = modelBodies[1].messages.at(-1);
  assert.equal(toolMessage.role, "tool");
  assert.equal(toolMessage.tool_call_id, "call-horarios_livres");
  assert.deepEqual(JSON.parse(toolMessage.content).livres_por_dia, { [day]: ["12:30–14:00", "15:00–18:00"] });
});

test("ver_agenda entrega dados ao modelo e lista clicável ao painel; WhatsApp vira botão", async () => {
  const { modelBodies, ask } = setup({
    script: [
      use(toolCall("ver_agenda", { inicio: day, fim: day }), toolCall("link_whatsapp", { telefone: "(47) 99999-1234", nome: "Ana", mensagem: "Olá, Ana!" })),
      say("Você tem 2 atendimentos hoje.")
    ]
  });
  const body = await (await ask()).json();
  assert.equal(body.agenda.entries[0].appointmentId, "atendimento-1");
  assert.deepEqual(body.links, [{ label: "WhatsApp · Ana", url: "https://wa.me/5547999991234?text=Ol%C3%A1%2C%20Ana!" }]);
  const agendaResult = JSON.parse(modelBodies[1].messages.find(m => m.tool_call_id === "call-ver_agenda").content);
  assert.equal(agendaResult.atendimentos.length, 2);
  assert.equal(agendaResult.atendimentos[0].cliente, "Nome privado");
});

test("erros de ferramenta voltam ao modelo sem derrubar a conversa e o laço tem limite", async () => {
  const bad = setup({ script: [use(toolCall("ver_agenda", { inicio: "2026-01-01", fim: "2026-03-01" })), say("Peça um período menor.")] });
  const res = await bad.ask();
  assert.equal(res.status, 200);
  assert.match(bad.modelBodies[1].messages.at(-1).content, /máximo de 31 dias/);

  const overflow = setup({ totalRows: 201, script: [use(toolCall("ver_agenda", { inicio: day, fim: day })), say("ok")] });
  await overflow.ask();
  assert.match(overflow.modelBodies[1].messages.at(-1).content, /intervalo menor/);

  const unknown = setup({ script: [use(toolCall("apagar_tudo", {})), say("Não posso.")] });
  await unknown.ask();
  assert.match(unknown.modelBodies[1].messages.at(-1).content, /desconhecida/);

  const looping = setup({ script: [use(toolCall("horarios_livres", { inicio: day, fim: day }))] });
  const looped = await (await looping.ask()).json();
  assert.equal(looping.modelBodies.length, 7);
  assert.equal(looping.modelBodies.at(-1).tools, undefined);
  assert.match(looped.answer, /Não consegui responder/);
});

test("recusa sessão ausente, inválida ou anônima e origem não permitida", async () => {
  const session = setup({ authStatus: 401 });
  assert.equal((await session.ask({ authorization: "" })).status, 401);
  assert.equal((await session.ask({ origin: "https://other.example" })).status, 403);
  assert.equal((await session.ask()).status, 401);
  assert.equal(session.calls.length, 1);
  const anonymous = setup({ anonymous: true });
  assert.equal((await anonymous.ask()).status, 401);
  assert.equal(anonymous.calls.length, 1);
});

test("cota bloqueia a IA e mensagens grandes são recusadas antes", async () => {
  const limited = setup({ reservation: "minuto" });
  const denied = await limited.ask();
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get("retry-after"), "60");
  assert.equal(limited.calls.length, 2);
  const daily = setup({ reservation: "dia" });
  assert.equal((await daily.ask()).status, 429);
  assert.equal(daily.calls.length, 2);
  const large = setup();
  assert.equal((await large.ask({}, JSON.stringify({ question: "é".repeat(13000) }))).status, 413);
  assert.equal(large.calls.length, 1);
  const tooLong = setup();
  assert.equal((await tooLong.ask({}, JSON.stringify({ question: "a".repeat(601) }))).status, 400);
});

test("ferramentas de clientes, orçamentos, faturamento, preços e modelos consultam as tabelas certas", async () => {
  const { modelBodies, ask, reads } = setup({
    tables: {
      clientes: [{ id: "c1", nome: "Ana", telefone: "47999990001" }],
      orcamentos: [{ id: "o1", status: "enviado", valor_total: 300, clientes: { nome: "Ana" } }],
      catalogo_precos: [{ nome: "Sofá 3 módulos", valor: 199, categoria: "sofa" }],
      promocao_precos: [],
      modelos_mensagem: [{ titulo: "Lembrete", chave: "lembrete", conteudo: "Olá, {nome}!" }]
    },
    script: [
      use(
        toolCall("buscar_clientes", { termo: "Ana" }),
        toolCall("orcamentos_pendentes", {}),
        toolCall("faturamento", { inicio: "2026-11-01", fim: "2026-11-30" }),
        toolCall("tabela_precos", { busca: "sofá" }),
        toolCall("modelos_mensagem", {}),
        toolCall("clientes_para_retorno", { meses_min: 6 })
      ),
      say("Pronto.")
    ]
  });
  assert.equal((await ask()).status, 200);
  const results = Object.fromEntries(modelBodies[1].messages.filter(m => m.role === "tool").map(m => [m.tool_call_id, JSON.parse(m.content)]));
  assert.equal(results["call-buscar_clientes"].clientes[0].nome, "Ana");
  assert.equal(results["call-orcamentos_pendentes"].em_aberto.valor, 300);
  assert.ok("concluidos" in results["call-faturamento"]);
  assert.equal(results["call-tabela_precos"].itens[0].valor, 199);
  assert.equal(results["call-tabela_precos"].oferta_40_em_sofas, true);
  assert.equal(results["call-modelos_mensagem"].modelos[0].chave, "lembrete");
  assert.equal(results["call-clientes_para_retorno"].meses_minimos, 6);
  for (const r of Object.values(results)) assert.equal(r.erro, undefined);
  const search = reads().find(c => c.url.pathname.endsWith("/clientes") && c.url.searchParams.get("or"));
  assert.equal(search.url.searchParams.get("arquivado_em"), "is.null");
  assert.match(search.url.searchParams.get("or"), /^\(nome\.ilike\.\*Ana\*,/);
  const revenue = reads().find(c => c.url.searchParams.get("select")?.includes("agendamento_itens"));
  assert.equal(revenue.url.searchParams.get("and"), "(inicio_em.gte.2026-11-01T00:00:00-03:00,inicio_em.lt.2026-12-01T00:00:00-03:00)");
  assert.equal(revenue.url.searchParams.get("excluido_em"), "is.null");
});

test("valida textos longos de agendamento com telefone e cabeçalhos de áudio WAV/Ogg", () => {
  const valid = validateSchedulingText("Agenda amanhã às 14h sofá 3 lugares para Maria (47) 99999-1234 na Rua 230");
  assert.match(valid, /99999-1234/);
  assert.throws(() => validateSchedulingText("Veja https://exemplo.com"), /inválida/);
  assert.throws(() => validateSchedulingText("a".repeat(601)), /inválida/);

  const wavBytes = new Uint8Array(64);
  wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  assert.deepEqual(validateAudioHeader(wavBytes), { ext: "wav", mime: "audio/wav" });

  const oggBytes = new Uint8Array(64);
  oggBytes.set([0x4f, 0x67, 0x67, 0x53], 0); // OggS
  assert.deepEqual(validateAudioHeader(oggBytes), { ext: "ogg", mime: "audio/ogg" });

  assert.equal(validateAudioHeader(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0, 0])), null);
});

test("buildBookingDraft vincula catálogo, Oferta 40%, conflitos e nunca inventa preços", () => {
  const catalog = [
    { id: "cat-sofa3", nome: "Sofá 3 módulos", valor: 199, categoria: "sofa", tipo: "base" },
    { id: "cat-sofa2-antigo", nome: "Sofá 2 lugares", valor: 399, categoria: "sofa", tipo: "base" },
    { id: "cat-cad", nome: "Cadeira", valor: 30, categoria: "cadeiras", tipo: "base" }
  ];
  const clients = [
    { id: "cli-1", nome: "João Silva", telefone: "47988887777", endereco: "Av. Brasil, 50", cidade: "Balneário Camboriú" },
    { id: "cli-2", nome: "Maria Clara", telefone: "47977776666" }
  ];

  // Cliente novo sem telefone + itens do catálogo (15:00–17:00 só cruza com cancelado/lixeira -> 0 conflitos)
  const newDraft = buildBookingDraft(parseIntent({
    modo: "agendar",
    agendamento: {
      tipo: "estofados",
      data: day,
      hora_inicio: "15:00",
      cliente_nome: "Ana Beatriz",
      endereco: "Rua 230, 120, Meia Praia",
      itens: [
        { nome: "Sofá de 3 modos", quantidade: 1 },
        { nome: "Cadeiras", quantidade: 4 }
      ]
    }
  }), { clients, catalog, events, blocks, offer40: true });

  assert.equal(newDraft.bookingDraft.clientStatus, "new");
  assert.deepEqual(newDraft.bookingDraft.newClient, { nome: "Ana Beatriz", telefone: "" });
  assert.equal(newDraft.bookingDraft.canConfirm, true);
  assert.equal(newDraft.bookingDraft.items[0].catalogo_preco_id, "cat-sofa3");
  assert.equal(newDraft.bookingDraft.items[0].nome, "Sofá 3 módulos");
  assert.equal(newDraft.bookingDraft.items[0].valor_unitario, 199);
  assert.equal(newDraft.bookingDraft.items[0].valor_original, 331.67);
  assert.equal(newDraft.bookingDraft.items[1].catalogo_preco_id, "cat-cad");
  assert.equal(newDraft.bookingDraft.items[1].valor_total, 120);
  assert.equal(newDraft.bookingDraft.valor, 319);
  assert.equal(newDraft.bookingDraft.conflicts.length, 0);

  // "Sofá 2 módulos" não deve cruzar para "Sofá 2 lugares" antigo (R$ 399) quando não há item de módulos no catálogo
  const modulesDraft = buildBookingDraft(parseIntent({
    modo: "agendar",
    agendamento: {
      data: day,
      hora_inicio: "15:00",
      cliente_nome: "Ana Beatriz",
      itens: [{ nome: "Sofá 2 módulos", quantidade: 1 }]
    }
  }), { clients, catalog, events, blocks, offer40: true });
  assert.equal(modulesDraft.bookingDraft.items[0].catalogo_preco_id, null);
  assert.equal(modulesDraft.bookingDraft.items[0].nome, "Sofá 2 módulos");
  assert.equal(modulesDraft.bookingDraft.items[0].valor_unitario, null);
  assert.equal(modulesDraft.bookingDraft.hasMissingPrices, true);

  // Quando o valor é falado ("Sofá 2 módulos por 198"), calcula riscado pela fórmula de orçamento: 198 / 0.60 = 330.00
  const spokenPriceDraft = buildBookingDraft(parseIntent({
    modo: "agendar",
    agendamento: {
      data: day,
      hora_inicio: "15:00",
      cliente_nome: "Ana Beatriz",
      itens: [{ nome: "Sofá 2 módulos", quantidade: 1, valor_unitario: 198 }]
    }
  }), { clients, catalog, events, blocks, offer40: true });
  assert.equal(spokenPriceDraft.bookingDraft.items[0].valor_unitario, 198);
  assert.equal(spokenPriceDraft.bookingDraft.items[0].valor_original, 330);
  assert.equal(spokenPriceDraft.bookingDraft.valor, 198);

  // Item fora do catálogo não recebe preço inventado e detecta conflito com evento/bloqueio
  const partialDraft = buildBookingDraft(parseIntent({
    modo: "agendar",
    agendamento: {
      data: day,
      hora_inicio: "09:30",
      cliente_nome: "Maria",
      itens: [{ nome: "Tapete persa gigante", quantidade: 1 }]
    }
  }), { clients, catalog, events, blocks, offer40: true });

  assert.equal(partialDraft.bookingDraft.clientStatus, "ambiguous");
  assert.equal(partialDraft.bookingDraft.clientCandidates.length, 2);
  assert.equal(partialDraft.bookingDraft.items[0].catalogo_preco_id, null);
  assert.equal(partialDraft.bookingDraft.items[0].valor_unitario, null);
  assert.equal(partialDraft.bookingDraft.hasMissingPrices, true);
  assert.equal(partialDraft.bookingDraft.canConfirm, false);
  assert.equal(partialDraft.bookingDraft.conflicts.length, 2);
  assert.match(partialDraft.bookingDraft.conflicts[0].label, /08:00–10:00/);
  assert.match(partialDraft.bookingDraft.conflicts[1].label, /10:15–12:30/);
});

test("áudio WAV passa pelo ASR, vira pedido de agendamento e devolve rascunho sem gravar nada", async () => {
  const calls = [];
  const chatBodies = [];
  const config = { base: "https://supabase.example", publishable: "pub-test", quotaKey: "sb_secret_test", deepseekKey: "deepseek-test", origins: [origin] };
  const clients = [{ id: "cli-ana", nome: "Ana Souza", telefone: "", endereco: "Rua 100" }];
  const catalog = [{ id: "cat-sofa", nome: "Sofá 3 lugares", valor: 199, categoria: "sofa", tipo: "base" }];

  const handler = createAssistantHandler(config, async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (url.includes("/auth/")) return Response.json({ id: userId, is_anonymous: false, user_metadata: { oferta_40: true } });
    if (url.includes("/rpc/")) return Response.json("ok");
    if (url.includes("/v1/tools/asr")) {
      return Response.json({ request_id: "asr-1", text: "Agenda amanhã às 14h sofá 3 lugares para Ana Souza", duration_ms: 2100 });
    }
    if (url.includes("chat/completions")) {
      chatBodies.push(JSON.parse(options.body));
      return Response.json(chatBodies.length === 1
        ? use(toolCall("propor_agendamento", {
          tipo: "estofados", data: day, hora_inicio: "14:00", cliente_nome: "Ana Souza",
          itens: [{ nome: "Sofá 3 lugares", quantidade: 1 }]
        }))
        : say("Montei o cartão: confira e toque em Confirmar e agendar."));
    }
    if (url.includes("/clientes")) return Response.json(clients);
    if (url.includes("/apartamentos")) return Response.json([]);
    if (url.includes("/catalogo_precos")) return Response.json(catalog);
    if (url.includes("/agendamentos")) return Response.json([]);
    if (url.includes("/bloqueios_agenda")) return Response.json(blocks);
    throw new Error("Unexpected upstream " + url);
  }, () => new Date(day + "T02:00:00Z"));

  const samples = new Float32Array(16000);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin(i * 0.1);
  const { buffer } = AudioHelper.encodeWav16kMono(samples, 16000);
  const formData = new FormData();
  formData.append("audio", new Blob([buffer], { type: "audio/wav" }), "audio.wav");

  const res = await handler(new Request("https://supabase.example/functions/v1/assistente-bez", {
    method: "POST",
    headers: { authorization: "Bearer session-test", origin },
    body: formData
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.transcript, "Agenda amanhã às 14h sofá 3 lugares para Ana Souza");
  assert.equal(body.bookingDraft.cliente_id, "cli-ana");
  assert.equal(body.bookingDraft.valor, 199);
  assert.equal(body.bookingDraft.conflicts.length, 1);

  assert.equal(body.answer, "Montei o cartão: confira e toque em Confirmar e agendar.");
  assert.equal(chatBodies[0].messages.at(-1).content, "Agenda amanhã às 14h sofá 3 lugares para Ana Souza");
  const draftResult = JSON.parse(chatBodies[1].messages.at(-1).content);
  assert.equal(draftResult.salvo, false);
  assert.equal(draftResult.cliente, "cadastrado");
  assert.equal(draftResult.conflitos.length, 1);
  // Nenhuma escrita: só leituras GET e a reserva de cota.
  assert.ok(calls.filter(c => c.url.pathname.startsWith("/rest/v1/") && !c.url.pathname.includes("/rpc/")).every(c => !c.options?.method));

  // Formato inválido é recusado com 400 sem consumir cota
  const quotaCallsBefore = calls.filter(c => c.url.pathname.includes("/rpc/")).length;
  const badForm = new FormData();
  badForm.append("audio", new Blob([new Uint8Array(64)], { type: "audio/mpeg" }), "bad.mp3");
  const badRes = await handler(new Request("https://supabase.example/functions/v1/assistente-bez", {
    method: "POST",
    headers: { authorization: "Bearer session-test", origin },
    body: badForm
  }));
  assert.equal(badRes.status, 400);
  assert.equal(calls.filter(c => c.url.pathname.includes("/rpc/")).length, quotaCallsBefore);
});

test("transcrição vazia do ASR devolve mensagem amigável", async () => {
  const config = { base: "https://supabase.example", publishable: "pub-test", quotaKey: "sb_secret_test", deepseekKey: "deepseek-test", origins: [origin] };
  const handler = createAssistantHandler(config, async url => {
    if (url.includes("/auth/")) return Response.json({ id: userId, is_anonymous: false });
    if (url.includes("/rpc/")) return Response.json("ok");
    if (url.includes("/v1/tools/asr")) return Response.json({ request_id: "asr-empty", text: "   ", duration_ms: 900 });
    throw new Error("Unexpected upstream " + url);
  }, () => new Date(day + "T02:00:00Z"));
  const samples = new Float32Array(16000);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.2 * Math.sin(i * 0.1);
  const { buffer } = AudioHelper.encodeWav16kMono(samples, 16000);
  const formData = new FormData();
  formData.append("audio", new Blob([buffer], { type: "audio/wav" }), "audio.wav");
  const res = await handler(new Request("https://supabase.example/functions/v1/assistente-bez", {
    method: "POST",
    headers: { authorization: "Bearer session-test", origin },
    body: formData
  }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.transcript, "");
  assert.match(data.answer, /Não consegui entender o áudio/);
});
