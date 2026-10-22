const assert = require("node:assert/strict");
const T = require("../assets/js/orcamento-modelos.js");
const ref = (s, m) => { const v = m === "normal" ? s.valor_normal : s["valor_" + m]; return v == null ? null : +v; };
const model = T.MODELS[0];
assert.equal(model.modalidade, "desconto");
assert.ok(!JSON.stringify(model).includes("199"), "valor não pode ficar fixo no modelo");

const services = [
  { id: "a", categoria: "sofa", codigo: "sofa_linho", valor_normal: 398, valor_desconto: 199 },
  { id: "b", categoria: "sofa", codigo: "sofa_suede", valor_normal: 199, valor_desconto: null },
  { id: "c", categoria: "colchao", codigo: "sofa_linho", valor_normal: 1, valor_desconto: 1 }
];
const list = T.candidates(model, services, ref);
assert.equal(list.length, 2);
assert.deepEqual([list[0].valor, list[0].normal, list[0].available, list[0].realDiscount], [199, 398, true, true]);
assert.deepEqual([list[1].valor, list[1].available, list[1].realDiscount], [null, false, false]);
// Desconto igual ou acima do normal não é desconto real
assert.equal(T.candidates(model, [{ categoria: "sofa", codigo: "sofa_linho", valor_normal: 199, valor_desconto: 199 }], ref)[0].realDiscount, false);
// Serviço ausente do catálogo ativo é ignorado
assert.equal(T.candidates(model, [], ref).length, 0);
console.log("orcamento-modelos: ok");
