const assert = require("node:assert/strict");
const C = require("../assets/js/gerenciar-core.js");

assert.equal(C.isArchived({ arquivado_em: "2026-10-22T10:00:00Z" }), true);
assert.equal(C.isArchived({ arquivado_em: null }), false);
assert.equal(C.isTrashed({ excluido_em: null }), false);

// Atendimentos reais não podem ser excluídos
assert.ok(C.appointmentBlock({ status: "concluido", status_pagamento: "pendente" }));
assert.ok(C.appointmentBlock({ status: "agendado", status_pagamento: "pago" }));
assert.ok(C.appointmentBlock({ status: "agendado", status_pagamento: "parcial" }));
assert.equal(C.appointmentBlock({ status: "agendado", status_pagamento: "pendente" }), null);
assert.equal(C.appointmentBlock({ status: "cancelado", status_pagamento: "pendente" }), null);

// Plano de exclusão de orçamento
assert.equal(C.quoteDeletePlan({ agendamento_id: null }, null).kind, "simple");
assert.equal(C.quoteDeletePlan({ agendamento_id: "a" }, { status: "agendado", status_pagamento: "pendente" }).kind, "with-appointment");
assert.equal(C.quoteDeletePlan({ agendamento_id: "a" }, { status: "concluido", status_pagamento: "pendente" }).kind, "blocked");
assert.equal(C.quoteDeletePlan({ agendamento_id: "a" }, { status: "agendado", status_pagamento: "pago" }).kind, "blocked");
assert.equal(C.quoteDeletePlan({ agendamento_id: "a" }, { status: "cancelado", status_pagamento: "pendente" }).kind, "simple");
assert.equal(C.quoteDeletePlan({ agendamento_id: "a" }, { status: "agendado", status_pagamento: "pendente", excluido_em: "x" }).kind, "simple");

// Resumo para o aviso de arquivamento
const now = new Date("2026-10-22T12:00:00Z");
const appts = [
  { cliente_id: "c", inicio_em: "2026-10-25T10:00:00Z", status: "agendado" },
  { cliente_id: "c", inicio_em: "2026-10-26T10:00:00Z", status: "cancelado" },
  { cliente_id: "c", inicio_em: "2026-10-20T10:00:00Z", status: "concluido" },
  { cliente_id: "c", inicio_em: "2026-10-27T10:00:00Z", status: "agendado", excluido_em: "x" },
  { cliente_id: "outro", inicio_em: "2026-10-25T10:00:00Z", status: "agendado" }
];
const quotes = [{ cliente_id: "c", status: "enviado" }, { cliente_id: "c", status: "aprovado" }, { cliente_id: "c", status: "rascunho", excluido_em: "x" }];
assert.deepEqual(C.clientArchiveSummary("c", appts, quotes, now), { upcoming: 1, openQuotes: 1 });

// Mensagens amigáveis
assert.equal(C.friendlyError({ message: "AGENDAMENTO_VINCULADO: este orçamento está ligado" }), "este orçamento está ligado");
assert.match(C.friendlyError({ code: "42501", message: "x" }), /Sem permissão/);
assert.match(C.friendlyError(new Error("Failed to fetch")), /comunicar com o servidor/);
assert.match(C.friendlyError({ message: 'column "excluido_em" does not exist' }), /ainda não está disponível/);
console.log("gerenciar-core: ok");
