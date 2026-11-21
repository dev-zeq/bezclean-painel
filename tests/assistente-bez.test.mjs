import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  answerAgenda,
  buildBookingDraft,
  freeWindows,
  parseIntent,
  parseRange,
  validateAudioHeader,
  validateQuestion,
  validateSchedulingText
} from "../supabase/functions/assistente-bez/core.mjs";
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

test("valida períodos, limites e formatos de perguntas", () => {
  assert.deepEqual(parseRange(day, day), { start: day + "T00:00:00-03:00", end: "2026-11-24T00:00:00-03:00" });
  for (const pair of [["2026-02-30", "2026-03-01"], ["2026-11-25", day], ["2026-01-01", "2026-02-02"]]) assert.throws(() => parseRange(...pair));
  for (const question of ["   ", "x".repeat(401), "Agenda de cliente@email.com", "WhatsApp (47) 99999-9999"]) assert.throws(() => validateQuestion(question));
  assert.equal(validateQuestion(" O que temos em 23/11/2026? "), "O que temos em 23/11/2026?");
  assert.equal(validateQuestion(" Horários em 2026-11-23? "), "Horários em 2026-11-23?");
  assert.equal(parseIntent({ modo: "local", inicio: day, fim: day }), null);
  assert.equal(parseIntent({ modo: "alterar", inicio: day, fim: day }), null);
});

test("disponibilidade respeita bloqueios, cancelamentos, exclusões e duração mínima", () => {
  assert.deepEqual(freeWindows(day, events, blocks), [{ inicio: "12:30", fim: "14:00" }, { inicio: "15:00", fim: "18:00" }]);
  const result = answerAgenda(parseIntent({ modo: "livres", inicio: day, fim: day }), events, blocks);
  assert.match(result.answer, /12:30–14:00, 15:00–18:00/);
  assert.equal(result.agenda, undefined);
});

test("busca local trata acentos, cidade e bairro e omite identificadores de clientes", () => {
  const intent = parseIntent({ modo: "local", inicio: day, fim: day, cidade: "BALNEARIO CAMBORIU", bairro: "centro" });
  const result = answerAgenda(intent, events, []);
  assert.match(result.answer, /08:00–10:00/);
  assert.doesNotMatch(JSON.stringify(result), /10:15|Nome privado/);
  assert.deepEqual(result.agenda.entries.map(entry => entry.appointmentId), ["atendimento-1"]);
  const incomplete = answerAgenda(intent, [...events, event("18:00", "19:00", { cidade: " " })], []);
  assert.match(incomplete.agenda.note, /localidade incompleta para esta busca: 1/);
  assert.doesNotMatch(incomplete.answer, /18:00/);
});

test("lista apenas atendimentos visíveis como ações e mantém bloqueios em texto", () => {
  const result = answerAgenda(parseIntent({ modo: "agenda", inicio: day, fim: day }), events, blocks);
  assert.deepEqual(result.agenda.entries, [
    { label: "23/11/2026 08:00–10:00 · Estofados · confirmado", appointmentId: "atendimento-1" },
    { label: "23/11/2026 10:15–12:30 · Estofados · confirmado", appointmentId: "atendimento-2" },
    { label: "23/11/2026 14:00–15:00 · Bloqueado" }
  ]);
});

const userId = "a0b713b9-4b00-4bdd-ab2c-8390d2cee1be";
const origin = "http://localhost:8000";
function setup({ reservation = "ok", intent = { modo: "livres", inicio: day, fim: day }, authStatus = 200, anonymous = false, totalRows } = {}) {
  const calls = [];
  const config = { base: "https://supabase.example", publishable: "pub-test", quotaKey: "sb_secret_test", deepseekKey: "deepseek-test", origins: [origin] };
  const handler = createAssistantHandler(config, async (url, options) => {
    calls.push({ url: new URL(url), ...options });
    if (url.includes("/auth/")) return Response.json({ id: userId, is_anonymous: anonymous }, { status: authStatus });
    if (url.includes("/rpc/")) return Response.json(reservation);
    if (url.includes("api.deepseek.com")) return Response.json({ choices: [{ message: { content: JSON.stringify(intent) } }] });
    if (url.includes("/agendamentos")) return Response.json(totalRows ? Array(totalRows).fill(events[0]) : events);
    if (url.includes("/bloqueios_agenda")) return Response.json(blocks);
    throw new Error("Unexpected upstream " + url);
  }, () => new Date(day + "T02:00:00Z"));
  const ask = (headers = {}, body = JSON.stringify({ question: "Quais horários livres amanhã?" })) => handler(new Request("https://supabase.example/functions/v1/assistente-bez", {
    method: "POST", headers: { authorization: "Bearer session-test", origin, ...headers }, body
  }));
  return { calls, ask, handler };
}

test("sessão validada, cota reservada e somente a pergunta enviada ao DeepSeek", async () => {
  const { calls, ask } = setup();
  const result = await ask();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.match((await result.json()).answer, /15:00–18:00/);
  assert.equal(calls.length, 5);
  assert.equal(calls[0].headers.Authorization, "Bearer session-test");
  assert.equal(calls[1].headers.apikey, "sb_secret_test");
  assert.deepEqual(JSON.parse(calls[1].body), { p_usuario: userId });
  const provider = JSON.parse(calls[2].body);
  assert.equal(provider.messages[1].content, "Quais horários livres amanhã?");
  assert.match(provider.messages[0].content, /2026-11-22/);
  assert.doesNotMatch(calls[2].body, /Nome privado|session-test|Itapema|sb_secret/);
  for (const call of calls.slice(3)) {
    assert.equal(call.headers.Authorization, "Bearer session-test");
    assert.equal(call.headers.apikey, "pub-test");
    assert.equal(call.url.searchParams.get("limit"), "201");
  }
  assert.equal(calls[3].url.searchParams.get("excluido_em"), "is.null");
  assert.equal(calls[3].url.searchParams.get("status"), "neq.cancelado");
});

test("identificadores são selecionados só para listas e ficam fora da chamada ao DeepSeek", async () => {
  const { calls, ask } = setup({ intent: { modo: "agenda", inicio: day, fim: day } });
  const result = await ask();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).agenda.entries[0].appointmentId, "atendimento-1");
  assert.match(calls[3].url.searchParams.get("select"), /^id,/);
  assert.doesNotMatch(calls[2].body, /atendimento-1/);
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

test("cota bloqueia a IA, interpretação ambígua bloqueia leituras e excesso pede período menor", async () => {
  const limited = setup({ reservation: "minuto" });
  const denied = await limited.ask();
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get("retry-after"), "60");
  assert.equal(limited.calls.length, 2);
  const daily = setup({ reservation: "dia" });
  assert.equal((await daily.ask()).status, 429);
  assert.equal(daily.calls.length, 2);
  const ambiguous = setup({ intent: { modo: "esclarecer" } });
  assert.match((await (await ambiguous.ask()).json()).answer, /Informe o dia/);
  assert.equal(ambiguous.calls.length, 3);
  const overflow = setup({ totalRows: 201 });
  assert.equal((await overflow.ask()).status, 400);
  const large = setup();
  assert.equal((await large.ask({}, JSON.stringify({ question: "é".repeat(3000) }))).status, 413);
  assert.equal(large.calls.length, 1);
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

test("áudio WAV válido passa por DeepSeek ASR, retorna transcrição e bookingDraft mantendo dados do painel fora do provedor", async () => {
  const calls = [];
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
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              modo: "agendar",
              agendamento: {
                tipo: "estofados",
                data: day,
                hora_inicio: "14:00",
                cliente_nome: "Ana Souza",
                itens: [{ nome: "Sofá 3 lugares", quantidade: 1 }]
              }
            })
          }
        }]
      });
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

  const chatCall = calls.find(c => c.url.pathname.includes("chat/completions"));
  assert.doesNotMatch(chatCall.options.body, /cli-ana|cat-sofa|Rua 100/);

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
