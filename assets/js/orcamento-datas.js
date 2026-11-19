(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuoteDates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Datas de criação dos orçamentos, sempre no horário de Brasília.
  // Ex.: "Hoje, 14:30", "Ontem, 09:10", "18/11, 16:45", "18/11/2025, 16:45".

  const TZ = "America/Sao_Paulo";
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const valid = value => { const date = value instanceof Date ? value : new Date(value); return value != null && value !== "" && !Number.isNaN(date.getTime()) ? date : null; };

  // "AAAA-MM-DD" do dia em Brasília.
  function dayKey(value) {
    const date = valid(value);
    return date ? dayFmt.format(date) : null;
  }

  function daysBetween(fromKey, toKey) {
    const parse = key => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((parse(toKey) - parse(fromKey)) / 86400000);
  }

  function isToday(value, now = new Date()) {
    const key = dayKey(value);
    return key != null && key === dayKey(now);
  }

  // Texto curto para a lista.
  function createdLabel(value, now = new Date()) {
    const key = dayKey(value), today = dayKey(now);
    if (!key || !today) return "";
    const time = timeFmt.format(valid(value)), diff = daysBetween(key, today);
    if (diff === 0) return "Hoje, " + time;
    if (diff === 1) return "Ontem, " + time;
    const [y, m, d] = key.split("-");
    return d + "/" + m + (y === today.slice(0, 4) ? "" : "/" + y) + ", " + time;
  }

  // Texto completo para o detalhe do orçamento.
  function createdFull(value) {
    const key = dayKey(value);
    if (!key) return "";
    const [y, m, d] = key.split("-");
    return d + "/" + m + "/" + y + " às " + timeFmt.format(valid(value));
  }

  return { TZ, dayKey, isToday, createdLabel, createdFull };
});
