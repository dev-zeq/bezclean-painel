(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuoteMarkup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // "+40% riscado": a pessoa digita o preço que quer cobrar e o orçamento
  // mostra, riscado, esse preço com 40% a mais.
  // O item é gravado como um desconto comum (valor_original > valor_unitario),
  // então PDF, WhatsApp e banco continuam iguais. Nada muda no Supabase.

  const RATE = 0.4;
  const round2 = value => Math.round(value * 100) / 100;
  const isPrice = value => value != null && value !== "" && Number.isFinite(+value) && +value >= 0;

  // Preço riscado para um preço final. Ex.: 199 -> 278,60.
  function crossedPrice(finalPrice) {
    return isPrice(finalPrice) ? round2(+finalPrice * (1 + RATE)) : null;
  }

  // Reconhece um item salvo com "+40% riscado" (para reabrir e editar).
  function isMarkedUp(item) {
    if (!item || item.modalidade_preco !== "desconto") return false;
    if (!isPrice(item.valor_unitario) || !isPrice(item.valor_original) || !(+item.valor_unitario > 0)) return false;
    return Math.abs(+item.valor_original - crossedPrice(item.valor_unitario)) < 0.011;
  }

  // Liga a opção: o preço final atual vira o preço promocional.
  function apply(item) {
    item.modalidade_preco = "desconto";
    item.valor_original = crossedPrice(item.valor_unitario);
    return item;
  }

  return { RATE, crossedPrice, isMarkedUp, apply };
});
