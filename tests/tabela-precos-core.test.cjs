const assert = require("node:assert/strict");
const core = require("../assets/js/tabela-precos-core.js");

assert.equal(core.parseMoney("398,50"), 398.5);
assert.equal(core.parseMoney("1.398,50"), 1398.5);
assert.equal(core.parseMoney("398.50"), 398.5);
assert.ok(Number.isNaN(core.parseMoney("R$ abc")));
assert.equal(core.parseOptionalMoney(""), null);
assert.equal(core.parseOptionalMoney("199,00"), 199);
assert.equal(core.formatOptionalMoney(null), "");
assert.equal(core.isRealDiscount(398, 199), true);
assert.equal(core.isRealDiscount(398, null), false);
assert.equal(core.isRealDiscount(398, 398), false);

let result = core.validateService({ nome: "Sofá", valor_normal: 398, valor_desconto: null, valor_especial: null });
assert.deepEqual(result.errors, {});
assert.deepEqual(result.warnings, []);

result = core.validateService({ nome: "Sofá", valor_normal: 398, valor_desconto: 398, valor_especial: null });
assert.equal(result.warnings.length, 1);

result = core.validateService({ nome: "", valor_normal: -1, valor_desconto: null, valor_especial: null });
assert.equal(result.errors.nome, "Informe o nome do serviço.");
assert.ok(result.errors.valor_normal);

result = core.validateService({ nome: "Poltrona", valor_normal: 190, valor_desconto: -1, valor_especial: null });
assert.ok(result.errors.valor_desconto);

assert.deepEqual(core.updatePayload({ nome: "  Poltrona  ", valor_normal: 190, valor_desconto: null, valor_especial: null, ativo: 0 }), {
  nome: "Poltrona", valor_normal: 190, valor_desconto: null, valor_especial: null, ativo: false
});

console.log("tabela-precos-core: 17 assertions passed");
