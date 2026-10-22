(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuoteTemplates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Modelos de Orçamento Rápido. Os preços NÃO ficam aqui: vêm da Tabela de Preços
  // (valor_normal / valor_desconto / valor_especial do serviço escolhido).
  // Para criar outro modelo, acrescente um item: categoria + codigos dos serviços do catálogo,
  // quantidade inicial e modalidade ("normal" | "desconto" | "especial").
  const MODELS = [
    {
      id: "sofa-desconto",
      titulo: "Sofá — Desconto",
      categoria: "sofa",
      codigos: ["sofa_linho", "sofa_suede"],
      quantidade: 1,
      modalidade: "desconto"
    }
  ];

  // Lista, para cada serviço candidato do modelo, o preço da modalidade e se está configurado.
  function candidates(model, services, priceReference) {
    return model.codigos.map(function (codigo) {
      const service = (services || []).find(function (s) { return s.categoria === model.categoria && s.codigo === codigo; });
      if (!service) return null;
      const valor = priceReference(service, model.modalidade);
      const normal = priceReference(service, "normal");
      return {
        service: service,
        valor: valor,
        normal: normal,
        available: valor != null,
        realDiscount: model.modalidade === "desconto" && valor != null && normal != null && normal > valor
      };
    }).filter(Boolean);
  }

  return { MODELS: MODELS, candidates: candidates };
});
