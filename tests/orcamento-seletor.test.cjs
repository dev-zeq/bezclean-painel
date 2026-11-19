const assert = require("node:assert/strict");
const P = require("../assets/js/orcamento-seletor.js");

// O que conta como sofá
for (const name of ["Sofá 3 lugares", "Sofá retrátil", "Sofá de canto", "sofa 2 lugares", "Sofá-cama", "SOFÁ", "Limpeza de sofás", "Sofa"])
  assert.equal(P.isSofa(name), true, name);
for (const name of ["Poltrona", "Cadeira", "Colchão casal", "Puff", "Chaise", "Recamier", "Banco de carro", "", null, "Sofazão"])
  assert.equal(P.isSofa(name), false, String(name));

// Todos os atalhos de sofá entram na oferta, os outros não
for (const name of P.SHORTCUTS)
  assert.equal(P.inOffer({ nome: name }, true), name.startsWith("Sofá"), name);
assert.equal(P.inOffer({ nome: "Sofá 3 lugares" }, false), false);

// Sofá com oferta ligada: preço digitado é 40% de desconto sobre o riscado
let items = [];
assert.equal(P.addShortcut(items, "Sofá 3 lugares", true), 0);
assert.equal(items[0].modalidade_preco, "desconto");
items[0].valor_unitario = 199;
P.priceItem(items[0], true);
assert.equal(items[0].valor_original, 331.67);
assert.equal(P.crossedOf(items[0]), 331.67);

// Cadeira com oferta ligada: preço normal, sem riscado
assert.equal(P.addShortcut(items, "Cadeira", true), 1);
items[1].valor_unitario = 60;
P.priceItem(items[1], true);
assert.equal(items[1].modalidade_preco, "normal");
assert.equal(items[1].valor_original, null);
assert.equal(P.crossedOf(items[1]), null);

// Tocar de novo no mesmo atalho soma a quantidade
assert.equal(P.addShortcut(items, "cadeira ", true), 1);
assert.equal(items.length, 2);
assert.equal(items[1].quantidade, 2);

// Oferta desligada: nem o sofá tem riscado
P.priceItem(items[0], false);
assert.equal(items[0].modalidade_preco, "normal");
assert.equal(items[0].valor_original, null);

// Item renomeado para sofá passa a entrar na oferta
const other = P.newItem("", true);
other.valor_unitario = 300;
assert.equal(P.priceItem(other, true).valor_original, null);
other.nome = "Sofá-cama";
assert.equal(P.priceItem(other, true).valor_original, 500);

// Item antigo com desconto continua mostrando o riscado
assert.equal(P.crossedOf({ valor_unitario: "199", valor_original: "398" }), 398);
assert.equal(P.crossedOf({ valor_unitario: 199, valor_original: 199 }), null);

// Preferência salva no perfil; sem valor, começa ligada
assert.equal(P.offerFromMetadata(undefined), true);
assert.equal(P.offerFromMetadata({}), true);
assert.equal(P.offerFromMetadata({ oferta_40: false }), false);
assert.equal(P.offerFromMetadata({ oferta_40: true }), true);

console.log("orcamento-seletor: ok");
