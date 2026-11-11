const assert = require("node:assert/strict");
const P = require("../assets/js/orcamento-pendencias.js");
const today = "2026-11-11";

// Dias até a validade
assert.equal(P.daysUntil("2026-11-11", today), 0);
assert.equal(P.daysUntil("2026-11-14", today), 3);
assert.equal(P.daysUntil("2026-10-31", today), -11);
assert.equal(P.daysUntil(null, today), null);

const sit = (quote, appointment) => P.situation({ agendamento_id: null, validade_em: null, ...quote }, appointment, today);

// Rascunho e enviado: validade
assert.deepEqual(pick(sit({ status: "rascunho", validade_em: "2026-11-20" })), { key: "rascunho", note: "", expired: false, canSchedule: false });
assert.equal(sit({ status: "enviado", validade_em: "2026-11-11" }).note, "Vence hoje");
assert.equal(sit({ status: "enviado", validade_em: "2026-11-12" }).note, "Vence amanhã");
assert.equal(sit({ status: "enviado", validade_em: "2026-11-14" }).note, "Vence em 3 dias");
assert.equal(sit({ status: "enviado", validade_em: "2026-11-15" }).note, "");
assert.equal(sit({ status: "enviado", validade_em: "2026-11-10" }).note, "Venceu ontem");
const late = sit({ status: "rascunho", validade_em: "2026-11-01" });
assert.equal(late.note, "Venceu há 10 dias");
assert.equal(late.expired, true);
assert.equal(sit({ status: "enviado" }).expired, false, "sem validade não vence");

// Aprovado sem agendamento é a pendência principal
const toSchedule = sit({ status: "aprovado", validade_em: "2026-01-01" });
assert.equal(toSchedule.key, "agendar");
assert.equal(toSchedule.canSchedule, true);
assert.equal(toSchedule.expired, false, "aprovado não conta como vencido");

// Com agendamento ligado
const scheduled = sit({ status: "aprovado", agendamento_id: "a1" }, { inicio_em: "2026-11-20T12:00:00Z", status: "agendado" });
assert.equal(scheduled.key, "agendado");
assert.match(scheduled.label, /^Agendado · \d{2}\/\d{2}$/);
assert.equal(scheduled.canSchedule, false);
assert.equal(sit({ status: "aprovado", agendamento_id: "a1" }, { inicio_em: "2026-11-01T12:00:00Z", status: "concluido" }).key, "concluido");

// Agendamento cancelado ou na lixeira: não oferece agendar de novo (o vínculo ainda existe)
const cancelled = sit({ status: "aprovado", agendamento_id: "a1" }, { inicio_em: "2026-11-20T12:00:00Z", status: "cancelado" });
assert.equal(cancelled.key, "aprovado");
assert.equal(cancelled.canSchedule, false);
assert.equal(sit({ status: "aprovado", agendamento_id: "a1" }, { status: "agendado", excluido_em: "2026-11-02T00:00:00Z" }).key, "aprovado");
assert.equal(sit({ status: "aprovado", agendamento_id: "a1" }, undefined).key, "aprovado");

// Recusado nunca vence nem agenda
const refused = sit({ status: "recusado", validade_em: "2026-01-01" });
assert.deepEqual(pick(refused), { key: "recusado", note: "", expired: false, canSchedule: false });

// Filtros e contagem
const all = [toSchedule, scheduled, late, refused, sit({ status: "enviado", validade_em: "2026-11-01" }), sit({ status: "enviado", validade_em: "2026-12-01" })];
assert.deepEqual(P.counts(all), { todos: 6, agendar: 1, enviado: 2, rascunho: 1, vencido: 2, agendado: 1, recusado: 1 });
assert.equal(P.matches(late, "vencido"), true);
assert.equal(P.matches(late, "rascunho"), true);
assert.equal(P.matches(late, "agendar"), false);
assert.equal(P.matches(late, "filtro-inexistente"), true, "filtro desconhecido cai em Todos");

function pick(s) { return { key: s.key, note: s.note, expired: s.expired, canSchedule: s.canSchedule }; }
console.log("orcamento-pendencias: ok");
