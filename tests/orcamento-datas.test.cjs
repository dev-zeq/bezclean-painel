const assert = require("node:assert/strict");
const D = require("../assets/js/orcamento-datas.js");
const now = new Date("2026-11-19T15:00:00Z"); // 19/11/2026 12:00 em Brasília

// Dia em Brasília: 01:30 UTC do dia 20 ainda é 22:30 do dia 19
assert.equal(D.dayKey("2026-11-20T01:30:00Z"), "2026-11-19");
assert.equal(D.dayKey("2026-11-19T03:10:00Z"), "2026-11-19");
assert.equal(D.dayKey("2026-11-19T02:59:00Z"), "2026-11-18");
assert.equal(D.dayKey(null), null);
assert.equal(D.dayKey("inválida"), null);

// Feito hoje
assert.equal(D.isToday("2026-11-19T17:30:00Z", now), true);
assert.equal(D.isToday("2026-11-20T01:30:00Z", now), true);
assert.equal(D.isToday("2026-11-19T02:59:00Z", now), false);
assert.equal(D.isToday(null, now), false);

// Texto da lista
assert.equal(D.createdLabel("2026-11-19T17:30:00Z", now), "Hoje, 14:30");
assert.equal(D.createdLabel("2026-11-20T01:30:00Z", now), "Hoje, 22:30");
assert.equal(D.createdLabel("2026-11-18T12:10:00Z", now), "Ontem, 09:10");
assert.equal(D.createdLabel("2026-11-15T19:45:00Z", now), "15/11, 16:45");
assert.equal(D.createdLabel("2025-12-31T13:00:00Z", now), "31/12/2025, 10:00");
assert.equal(D.createdLabel("", now), "");

// Texto do detalhe
assert.equal(D.createdFull("2026-11-18T19:45:00Z"), "18/11/2026 às 16:45");
assert.equal(D.createdFull(undefined), "");

console.log("orcamento-datas: ok");
