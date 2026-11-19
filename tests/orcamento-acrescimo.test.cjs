const assert = require("node:assert/strict");
const M = require("../assets/js/orcamento-acrescimo.js");

// Preço riscado = preço final + 40%, com centavos arredondados
assert.equal(M.crossedPrice(199), 278.6);
assert.equal(M.crossedPrice("250"), 350);
assert.equal(M.crossedPrice(99.9), 139.86);
assert.equal(M.crossedPrice(0), 0);
assert.equal(M.crossedPrice(""), null);
assert.equal(M.crossedPrice(NaN), null);

// Ligar a opção grava como desconto comum
const item = M.apply({ modalidade_preco: "normal", valor_unitario: 199, valor_original: null });
assert.deepEqual(item, { modalidade_preco: "desconto", valor_unitario: 199, valor_original: 278.6 });

// Reconhece itens salvos com a opção
assert.equal(M.isMarkedUp(item), true);
assert.equal(M.isMarkedUp({ modalidade_preco: "desconto", valor_unitario: "250.00", valor_original: "350.00" }), true);
// Desconto comum (50%) não é "+40%"
assert.equal(M.isMarkedUp({ modalidade_preco: "desconto", valor_unitario: 199, valor_original: 398 }), false);
// Outras modalidades e valores inválidos
assert.equal(M.isMarkedUp({ modalidade_preco: "normal", valor_unitario: 199, valor_original: 278.6 }), false);
assert.equal(M.isMarkedUp({ modalidade_preco: "desconto", valor_unitario: 0, valor_original: 0 }), false);
assert.equal(M.isMarkedUp(null), false);

console.log("orcamento-acrescimo: ok");
