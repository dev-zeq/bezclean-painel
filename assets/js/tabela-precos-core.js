(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PriceTableCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseMoney(value) {
    const raw = String(value == null ? "" : value).replace(/R\$/gi, "").replace(/\s/g, "");
    if (!raw || !/^[\d.,]+$/.test(raw)) return NaN;
    let normalized;
    if (raw.includes(",") && raw.includes(".")) {
      const separator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
      normalized = raw.slice(0, separator).replace(/[.,]/g, "") + "." + raw.slice(separator + 1);
    } else if (raw.includes(",")) {
      normalized = raw.split(",").length === 2 ? raw.replace(",", ".") : "";
    } else if ((raw.match(/\./g) || []).length > 1) {
      normalized = /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : "";
    } else if (/^\d{1,3}\.\d{3}$/.test(raw)) {
      normalized = raw.replace(".", "");
    } else {
      normalized = raw;
    }
    return /^\d+(?:\.\d{0,2})?$/.test(normalized) ? Number(normalized) : NaN;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function isRealDiscount(normal, discount) {
    return Number.isFinite(+normal) && Number.isFinite(+discount) && +normal > +discount;
  }

  function validateService(service) {
    const errors = {};
    const name = String(service.nome || "").trim();
    if (!name) errors.nome = "Informe o nome do serviço.";
    if (name.length > 160) errors.nome = "Use no máximo 160 caracteres.";
    ["valor_normal", "valor_desconto", "valor_especial"].forEach(field => {
      if (!Number.isFinite(+service[field]) || +service[field] < 0) errors[field] = "Informe um valor igual ou maior que zero.";
    });
    const warnings = [];
    if (!errors.valor_normal && !errors.valor_desconto && +service.valor_desconto >= +service.valor_normal) {
      warnings.push("O valor de desconto é igual ou maior que o normal. Nenhuma economia será exibida nos orçamentos.");
    }
    return { errors, warnings };
  }

  function updatePayload(service) {
    return {
      nome: String(service.nome || "").trim(),
      valor_normal: Number(service.valor_normal),
      valor_desconto: Number(service.valor_desconto),
      valor_especial: Number(service.valor_especial),
      ativo: Boolean(service.ativo)
    };
  }

  return { parseMoney, formatMoney, isRealDiscount, validateService, updatePayload };
});
