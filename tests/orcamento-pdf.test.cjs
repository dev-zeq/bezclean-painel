const assert = require("node:assert/strict");
const P = require("../assets/js/orcamento-pdf.js");

// iPhone e iPad (inclusive iPad que se apresenta como Mac) usam o PDF em arquivo
assert.equal(P.isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5), true);
assert.equal(P.isIOS("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5), true);
assert.equal(P.isIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true);
// Android e computador continuam na impressão
assert.equal(P.isIOS("Mozilla/5.0 (Linux; Android 14; Pixel 7)", "Linux armv81", 5), false);
assert.equal(P.isIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), false);
assert.equal(P.isIOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0), false);

// Documento que cabe numa página
assert.deepEqual(P.planPages([{ top: 0, bottom: 300 }], 900, 1000), [{ top: 0, height: 900 }]);

// Corte cai no meio de um bloco: a página termina antes dele
const blocks = [{ top: 0, bottom: 400 }, { top: 400, bottom: 900 }, { top: 900, bottom: 1300 }, { top: 1300, bottom: 1900 }];
assert.deepEqual(P.planPages(blocks, 1900, 1000), [{ top: 0, height: 900 }, { top: 900, height: 1000 }]);

// Corte cai entre blocos: não mexe
assert.deepEqual(P.planPages([{ top: 0, bottom: 1000 }, { top: 1000, bottom: 1500 }], 1500, 1000), [{ top: 0, height: 1000 }, { top: 1000, height: 500 }]);

// Bloco mais alto que a página é cortado mesmo, sem laço infinito
const tall = P.planPages([{ top: 0, bottom: 2500 }], 2500, 1000);
assert.deepEqual(tall, [{ top: 0, height: 1000 }, { top: 1000, height: 1000 }, { top: 2000, height: 500 }]);

// As páginas cobrem o documento inteiro, sem sobra nem sobreposição
const pages = P.planPages(blocks, 1900, 1000);
assert.equal(pages.reduce((sum, page) => sum + page.height, 0), 1900);
pages.reduce((end, page) => { assert.equal(page.top, end); return page.top + page.height; }, 0);

// Nome do download de reserva sem acento
assert.equal(P.asciiName("Orçamento Bez Clean - João da Conceição.pdf"), "Orcamento Bez Clean - Joao da Conceicao.pdf");
assert.equal(P.asciiName(""), "orcamento.pdf");

console.log("orcamento-pdf: ok");
