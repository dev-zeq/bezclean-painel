import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRange, parseIntent, validateQuestion, freeWindows, answerAgenda } from "../supabase/functions/assistente-bez/core.mjs";
import { createAssistantHandler } from "../supabase/functions/assistente-bez/index.ts";

const day = "2026-11-23";
const event = (start, end, extra = {}) => ({ inicio_em: day + "T" + start + ":00-03:00", fim_em: day + "T" + end + ":00-03:00", status: "confirmado", tipo: "estofados", ...extra });
const events = [
  event("08:00", "10:00", { clientes: { cidade: "Balneário Camboriú", bairro: "Centro", nome: "Nome privado" } }),
  event("10:15", "12:30", { cidade: "Itapema" }),
  event("16:00", "17:00", { status: "cancelado" }),
  event("17:00", "18:00", { excluido_em: day })
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
  assert.match(answerAgenda(parseIntent({ modo: "livres", inicio: day, fim: day }), events, blocks), /12:30–14:00, 15:00–18:00/);
});

test("busca local trata acentos, cidade e bairro e omite identificadores de clientes", () => {
  const intent = parseIntent({ modo: "local", inicio: day, fim: day, cidade: "BALNEARIO CAMBORIU", bairro: "centro" });
  const answer = answerAgenda(intent, events, []);
  assert.match(answer, /08:00–10:00/);
  assert.doesNotMatch(answer, /10:15|Nome privado/);
  const incomplete = answerAgenda(intent, [...events, event("18:00", "19:00", { cidade: " " })], []);
  assert.match(incomplete, /localidade incompleta para esta busca: 1/);
  assert.doesNotMatch(incomplete, /18:00/);
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
