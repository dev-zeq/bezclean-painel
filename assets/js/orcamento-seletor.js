(function (root, factory) {
  const api = factory(root.QuoteMarkup || (typeof require === "function" ? require("./orcamento-acrescimo.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuotePicker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Markup) {
  // Seletor rápido de itens do orçamento: atalhos sem preço fixo e a
  // "Oferta 40%" vigente, que fica ligada até a pessoa desligar.

  const SHORTCUTS = [
    "Sofá 2 lugares", "Sofá 3 lugares", "Sofá 4 lugares", "Sofá retrátil", "Sofá de canto",
    "Poltrona", "Cadeira", "Puff", "Cabeceira",
    "Colchão solteiro", "Colchão casal", "Colchão queen", "Colchão king",
    "Tapete", "Banco de carro"
  ];

  // A oferta vale só para sofás: o nome precisa ter a palavra "sofá"
  // (com ou sem acento). Ex.: "Sofá 3 lugares", "Sofá-cama", "sofa retratil".
  const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function isSofa(name) {
    return /(^|[^a-z])sofas?([^a-z]|$)/.test(normalize(name));
  }

  // O item entra na oferta quando a chave está ligada e ele é sofá.
  function inOffer(item, offerOn) {
    return !!offerOn && isSofa(item && item.nome);
  }

  // Ajusta o item à oferta: na oferta = preço digitado como 40% de desconto
  // sobre o riscado; fora dela = só o preço digitado.
  function priceItem(item, offerOn) {
    if (inOffer(item, offerOn)) {
      item.modalidade_preco = "desconto";
      item.valor_original = Markup.crossedPrice(item.valor_unitario);
    } else {
      item.modalidade_preco = "normal";
      item.valor_original = null;
    }
    return item;
  }

  function newItem(name, offerOn) {
    return priceItem({ catalogo_preco_id: null, nome: name, quantidade: 1, valor_unitario: NaN, valor_original: null, modalidade_preco: "normal", observacoes: null }, offerOn);
  }

  // Toque no atalho: soma 1 se o item já está no orçamento, senão cria.
  // Devolve o índice do item tocado.
  function addShortcut(items, name, offerOn) {
    const key = String(name).trim().toLocaleLowerCase("pt-BR");
    const index = items.findIndex(item => String(item.nome || "").trim().toLocaleLowerCase("pt-BR") === key);
    if (index >= 0) { items[index].quantidade = (+items[index].quantidade || 0) + 1; return index; }
    items.push(newItem(name, offerOn));
    return items.length - 1;
  }

  // Valor riscado mostrado no item, ou null se não há.
  function crossedOf(item) {
    const unit = +item.valor_unitario, original = +item.valor_original;
    return item.valor_original != null && Number.isFinite(unit) && Number.isFinite(original) && original > unit ? original : null;
  }

  // Valor salvo no perfil (user_metadata). Sem valor salvo, a oferta começa ligada.
  function offerFromMetadata(metadata) {
    const value = metadata && metadata.oferta_40;
    return typeof value === "boolean" ? value : true;
  }

  return { SHORTCUTS, isSofa, inOffer, priceItem, newItem, addShortcut, crossedOf, offerFromMetadata };
});
