(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuotePending = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Situação de cada orçamento na lista: o que falta fazer com ele.
  // Não altera nada no banco; só lê status, validade e o agendamento ligado.

  const DAY = 86400000;
  const toUtc = text => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || "");
    return match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) : null;
  };

  // Dias entre hoje e a data (ambos "AAAA-MM-DD"). Negativo = já passou.
  function daysUntil(date, today) {
    const target = toUtc(date), base = toUtc(today);
    return target == null || base == null ? null : Math.round((target - base) / DAY);
  }

  function validityNote(days) {
    if (days == null) return { note: "", late: false };
    if (days < -1) return { note: "Venceu há " + -days + " dias", late: true };
    if (days === -1) return { note: "Venceu ontem", late: true };
    if (days === 0) return { note: "Vence hoje", late: false };
    if (days === 1) return { note: "Vence amanhã", late: false };
    if (days <= 3) return { note: "Vence em " + days + " dias", late: false };
    return { note: "", late: false };
  }

  const shortDate = iso => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  // appointment: o agendamento ligado (ou undefined). today: "AAAA-MM-DD".
  function situation(quote, appointment, today) {
    const base = { key: quote.status, label: quote.status, note: "", late: false, expired: false, canSchedule: false };
    const liveAppointment = quote.agendamento_id && appointment && !appointment.excluido_em && appointment.status !== "cancelado";

    if (liveAppointment) {
      if (appointment.status === "concluido") return { ...base, key: "concluido", label: "Concluído" };
      const when = shortDate(appointment.inicio_em);
      return { ...base, key: "agendado", label: when ? "Agendado · " + when : "Agendado" };
    }
    if (quote.status === "recusado") return { ...base, key: "recusado", label: "Recusado" };
    if (quote.status === "aprovado") {
      if (quote.agendamento_id) return { ...base, key: "aprovado", label: "Aprovado", note: "Atendimento cancelado ou na lixeira" };
      return { ...base, key: "agendar", label: "Aprovado · falta agendar", canSchedule: true };
    }

    const validity = validityNote(daysUntil(quote.validade_em, today));
    return {
      ...base,
      key: quote.status === "enviado" ? "enviado" : "rascunho",
      label: quote.status === "enviado" ? "Enviado · aguardando resposta" : "Rascunho · falta enviar",
      note: validity.note,
      late: validity.late,
      expired: validity.late
    };
  }

  const FILTERS = [
    { id: "todos", label: "Todos", test: () => true },
    { id: "agendar", label: "Falta agendar", test: s => s.key === "agendar" },
    { id: "enviado", label: "Aguardando resposta", test: s => s.key === "enviado" },
    { id: "rascunho", label: "Rascunhos", test: s => s.key === "rascunho" },
    { id: "vencido", label: "Vencidos", test: s => s.expired },
    { id: "agendado", label: "Agendados", test: s => s.key === "agendado" || s.key === "concluido" },
    { id: "recusado", label: "Recusados", test: s => s.key === "recusado" }
  ];

  function matches(current, filterId) {
    const filter = FILTERS.find(item => item.id === filterId) || FILTERS[0];
    return filter.test(current);
  }

  // Quantos orçamentos caem em cada filtro: { todos: 12, agendar: 2, ... }.
  function counts(situations) {
    const result = {};
    FILTERS.forEach(filter => { result[filter.id] = situations.filter(filter.test).length; });
    return result;
  }

  return { FILTERS: FILTERS, daysUntil: daysUntil, situation: situation, matches: matches, counts: counts };
});
