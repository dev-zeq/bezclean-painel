const assert = require("node:assert/strict");
const core = require("../assets/js/tabela-precos-core.js");

assert.equal(core.parseMoney("398,50"), 398.5);
assert.equal(core.parseMoney("1.398,50"), 1398.5);
assert.equal(core.parseMoney("398.50"), 398.5);
assert.ok(Number.isNaN(core.parseMoney("R$ abc")));
assert.equal(core.isRealDiscount(398, 199), true);
assert.equal(core.isRealDiscount(398, 398), false);
assert.equal(core.isRealDiscount(398, 450), false);

let result = core.validateService({ nome: "Sofá", valor_normal: 398, valor_desconto: 199, valor_especial: 450 });
assert.deepEqual(result.errors, {});
assert.deepEqual(result.warnings, []);

result = core.validateService({ nome: "Sofá", valor_normal: 398, valor_desconto: 398, valor_especial: 450 });
assert.equal(result.warnings.length, 1);

result = core.validateService({ nome: "", valor_normal: -1, valor_desconto: 0, valor_especial: 0 });
assert.equal(result.errors.nome, "Informe o nome do serviço.");
assert.ok(result.errors.valor_normal);

assert.deepEqual(core.updatePayload({ nome: "  Poltrona  ", valor_normal: 190, valor_desconto: 150, valor_especial: 220, ativo: 0 }), {
  nome: "Poltrona", valor_normal: 190, valor_desconto: 150, valor_especial: 220, ativo: false
});

console.log("tabela-precos-core: 11 assertions passed");
