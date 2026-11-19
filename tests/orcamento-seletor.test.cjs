const assert = require("node:assert/strict");
const P = require("../assets/js/orcamento-seletor.js");

// Atalho novo entra sem preço, já na regra da oferta
let items = [];
assert.equal(P.addShortcut(items, "Cadeira", true), 0);
assert.equal(items[0].nome, "Cadeira");
assert.equal(items[0].quantidade, 1);
assert.ok(Number.isNaN(items[0].valor_unitario));
assert.equal(items[0].modalidade_preco, "desconto");
assert.equal(items[0].valor_original, null);

// Tocar de novo no mesmo atalho soma a quantidade
assert.equal(P.addShortcut(items, "cadeira ", true), 0);
assert.equal(items.length, 1);
assert.equal(items[0].quantidade, 2);

// Com preço digitado e oferta ligada: 40% a mais riscado
items[0].valor_unitario = 60;
P.priceItem(items[0], true);
assert.equal(items[0].valor_original, 84);
assert.equal(P.crossedOf(items[0]), 84);

// Oferta desligada: só o preço digitado
P.priceItem(items[0], false);
assert.equal(items[0].modalidade_preco, "normal");
assert.equal(items[0].valor_original, null);
assert.equal(P.crossedOf(items[0]), null);

// Outro atalho vira outro item
assert.equal(P.addShortcut(items, "Sofá 3 lugares", false), 1);
assert.equal(items[1].modalidade_preco, "normal");

// Item antigo com desconto continua mostrando o riscado
assert.equal(P.crossedOf({ valor_unitario: "199", valor_original: "398" }), 398);
assert.equal(P.crossedOf({ valor_unitario: 199, valor_original: 199 }), null);

// Preferência salva no perfil; sem valor, começa ligada
assert.equal(P.offerFromMetadata(undefined), true);
assert.equal(P.offerFromMetadata({}), true);
assert.equal(P.offerFromMetadata({ oferta_40: false }), false);
assert.equal(P.offerFromMetadata({ oferta_40: true }), true);

assert.ok(P.SHORTCUTS.length >= 10);
console.log("orcamento-seletor: ok");
