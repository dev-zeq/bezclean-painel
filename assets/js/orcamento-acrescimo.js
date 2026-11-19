(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuoteMarkup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Oferta 40%: a pessoa digita o preço que quer cobrar e o orçamento mostra,
  // riscado, um valor maior do qual esse preço é exatamente 40% de desconto.
  // Ex.: 199 -> riscado 331,67 (331,67 - 40% = 199,00).
  // O item é gravado como um desconto comum (valor_original > valor_unitario),
  // então PDF, WhatsApp e banco continuam iguais. Nada muda no Supabase.

  const DISCOUNT = 0.4;
  const round2 = value => Math.round(value * 100) / 100;
  const isPrice = value => value != null && value !== "" && Number.isFinite(+value) && +value >= 0;

  // Preço riscado para um preço final: preço ÷ 0,60. Ex.: 199 -> 331,67.
  function crossedPrice(finalPrice) {
    return isPrice(finalPrice) ? round2(+finalPrice / (1 - DISCOUNT)) : null;
  }

  // Reconhece um item salvo com a Oferta 40% (para reabrir e editar).
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

  return { DISCOUNT, crossedPrice, isMarkedUp, apply };
});
