const assert = require("node:assert/strict");
const A = require("../assets/js/agenda-core.js");

// Datas locais, para o teste não depender do fuso da máquina.
const at = (day, h, m = 0) => new Date(2026, 10, day, h, m);
const ev = (id, day, h1, h2, extra = {}) => ({ id, tipo: "estofados", status: "agendado", inicio_em: at(day, h1).toISOString(), fim_em: at(day, h2).toISOString(), clientes: { nome: "Maria" }, ...extra });

// Períodos prontos
assert.equal(A.periodOf("08:00", "12:00"), "manha");
assert.equal(A.periodOf("13:00", "17:00"), "tarde");
assert.equal(A.periodOf("08:00", "17:00"), "dia");
assert.equal(A.periodOf("09:30", "11:00"), "custom");
const morning = A.range("2026-11-12", "manha");
assert.equal(A.hhmm(morning.start) + "-" + A.hhmm(morning.end), "08:00-12:00");
const custom = A.range("2026-11-12", "custom", "14:30", 90);
assert.equal(A.hhmm(custom.start) + "-" + A.hhmm(custom.end), "14:30-16:00");

// Manhã x tarde
assert.deepEqual(A.halvesOf(at(12, 8), at(12, 10), at(12, 0)), { manha: true, tarde: false });
assert.deepEqual(A.halvesOf(at(12, 13), at(12, 17), at(12, 0)), { manha: false, tarde: true });
assert.deepEqual(A.halvesOf(at(12, 8), at(12, 17), at(12, 0)), { manha: true, tarde: true });
assert.deepEqual(A.halvesOf(at(12, 10), at(12, 12), at(12, 0)), { manha: true, tarde: false }, "terminar ao meio-dia não ocupa a tarde");
assert.deepEqual(A.halvesOf(at(13, 8), at(13, 10), at(12, 0)), { manha: false, tarde: false }, "outro dia");

// Dia separado em manhã e tarde
const events = [
  ev("a", 12, 14, 16),
  ev("b", 12, 8, 10),
  ev("c", 12, 8, 17, { tipo: "apartamento", clientes: null, apartamentos: { nome: "San Remo 302" } }),
  ev("d", 12, 9, 11, { status: "cancelado" })
];
const blocks = [{ inicio_em: at(13, 8).toISOString(), fim_em: at(13, 10).toISOString(), motivo: "Médico" }];
const day = A.dayBuckets(events, blocks, at(12, 0));
assert.deepEqual(day.manha.map(x => x.item.id), ["b", "c", "d"]);
assert.deepEqual(day.tarde.map(x => x.item.id), ["c", "a"], "dia inteiro aparece nas duas metades");
assert.equal(A.isFree(day.manha), false);
const next = A.dayBuckets(events, blocks, at(13, 0));
assert.equal(next.manha[0].kind, "block");
assert.equal(A.isFree(next.manha), false, "bloqueio ocupa");
assert.equal(A.isFree(next.tarde), true);
assert.equal(A.isFree(A.dayBuckets([ev("x", 14, 9, 11, { status: "cancelado" })], [], at(14, 0)).manha), true, "cancelado não ocupa");

// Título por tipo
assert.equal(A.title(events[2]), "San Remo 302");
assert.equal(A.title(events[0]), "Maria");
assert.equal(A.title({ tipo: "faxina", clientes: null }), "Cliente");
assert.equal(A.typeOf({}), "estofados", "agendamento antigo sem tipo é estofados");

// Conflitos: equipe única, qualquer sobreposição conta
const clash = A.conflicts(events, blocks, at(12, 9), at(12, 11));
assert.deepEqual(clash.map(x => x.kind), ["event", "event"], "cancelado fica de fora");
assert.match(clash[0].label, /^08:00–10:00 · Maria \(Estofados\)$/);
assert.match(clash[1].label, /San Remo 302 \(Apartamento\)/);
assert.equal(A.conflicts(events, blocks, at(12, 10), at(12, 12), "c").length, 0, "encostar no horário não é conflito; ignora o próprio registro");
assert.equal(A.conflicts(events, blocks, at(12, 9), at(12, 11), "b").length, 1, "em edição, ignora só o próprio");
assert.equal(A.conflicts([], blocks, at(13, 9), at(13, 12))[0].label, "08:00–10:00 · Horário bloqueado (Médico)");
assert.match(A.conflicts([ev("p", 15, 8, 12, { status: "provisorio" })], [], at(15, 9), at(15, 10))[0].label, /provisório/);
assert.equal(A.conflicts([ev("t", 15, 8, 12, { excluido_em: "2026-11-01" })], [], at(15, 9), at(15, 10)).length, 0, "lixeira não conta");
// Apartamento administrado no Airbnb aparece marcado
assert.equal(A.isAirbnb({ apartamentos: { nome: "501", airbnb: true } }), true);
assert.equal(A.isAirbnb(events[2]), false);
assert.match(A.conflicts([ev("z", 16, 8, 12, { tipo: "apartamento", clientes: null, apartamentos: { nome: "Apto 501", airbnb: true } })], [], at(16, 9), at(16, 10))[0].label, /Apto 501 \(Apartamento Airbnb\)/);
assert.match(A.conflictMessage(clash), /Deseja agendar mesmo assim\?$/);

// Consulta ao banco (simulada)
const fakeDb = rows => ({ from: table => { const q = { select: () => q, is: () => q, lt: () => q, gt: () => q, then: ok => ok({ data: table === "agendamentos" ? rows : blocks, error: null }) }; return q; } });
A.findConflicts(fakeDb(events), at(12, 9), at(12, 11), "b").then(list => assert.equal(list.length, 1));

// Semana e navegação
assert.equal(A.dateKey(A.weekStart(at(11, 15))), "2026-11-08", "semana começa no domingo");
assert.equal(A.dateKey(A.weekStart(at(8, 0))), "2026-11-08");
const week = A.viewRange("week", at(11, 15));
assert.equal(A.dateKey(week.start) + "/" + A.dateKey(week.end), "2026-11-08/2026-11-15");
const month = A.viewRange("month", at(11, 15));
assert.equal(A.dateKey(month.start) + "/" + A.dateKey(month.end), "2026-11-01/2026-12-01");
assert.equal(A.dateKey(A.shift("week", at(11, 0), 1)), "2026-11-18");
assert.equal(A.dateKey(A.shift("day", at(30, 0), 1)), "2026-12-01");
assert.equal(A.dateKey(A.shift("month", new Date(2026, 0, 31), 1)), "2026-02-01", "mês seguinte não pula fevereiro");

console.log("agenda-core: ok");
