const assert = require("node:assert/strict");
const M = require("../assets/js/orcamento-acrescimo.js");

// Preço riscado = preço final ÷ 0,60, para o preço final ser 40% de desconto
assert.equal(M.crossedPrice(199), 331.67);
assert.equal(M.crossedPrice("150"), 250);
assert.equal(M.crossedPrice(60), 100);
assert.equal(M.crossedPrice(0), 0);
assert.equal(M.crossedPrice(""), null);
assert.equal(M.crossedPrice(NaN), null);

// Conferência: o riscado com 40% de desconto volta ao preço final (centavos)
for (const price of [199, 249.9, 60, 1234.56, 99.99]) {
  const back = Math.round(M.crossedPrice(price) * 0.6 * 100) / 100;
  assert.ok(Math.abs(back - price) <= 0.01, price + " -> " + back);
}

// Ligar a oferta grava como desconto comum
const item = M.apply({ modalidade_preco: "normal", valor_unitario: 199, valor_original: null });
assert.deepEqual(item, { modalidade_preco: "desconto", valor_unitario: 199, valor_original: 331.67 });

// Reconhece itens salvos com a oferta
assert.equal(M.isMarkedUp(item), true);
assert.equal(M.isMarkedUp({ modalidade_preco: "desconto", valor_unitario: "150.00", valor_original: "250.00" }), true);
// Desconto de 50% não é a oferta de 40%
assert.equal(M.isMarkedUp({ modalidade_preco: "desconto", valor_unitario: 199, valor_original: 398 }), false);
assert.equal(M.isMarkedUp({ modalidade_preco: "normal", valor_unitario: 199, valor_original: 331.67 }), false);
assert.equal(M.isMarkedUp({ modalidade_preco: "desconto", valor_unitario: 0, valor_original: 0 }), false);
assert.equal(M.isMarkedUp(null), false);

console.log("orcamento-acrescimo: ok");
