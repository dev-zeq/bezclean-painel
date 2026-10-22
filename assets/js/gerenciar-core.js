(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ManageCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Regras de arquivamento/lixeira usadas pela interface. O banco aplica as mesmas regras
  // (supabase/arquivar_lixeira.sql); aqui servem para orientar o usuário antes de chamar o servidor.

  function isArchived(client) { return Boolean(client && client.arquivado_em); }
  function isTrashed(record) { return Boolean(record && record.excluido_em); }

  // Atendimento concluído ou com pagamento registrado nunca vai para a lixeira.
  function appointmentBlock(appointment) {
    if (!appointment) return null;
    if (appointment.status === "concluido") return "Atendimento concluído não pode ser excluído. Ele faz parte do histórico.";
    if (appointment.status_pagamento && appointment.status_pagamento !== "pendente") return "Atendimento com pagamento registrado não pode ser excluído.";
    return null;
  }

  // Como excluir um orçamento: simples, junto com o atendimento ligado, ou bloqueado.
  function quoteDeletePlan(quote, linkedAppointment) {
    if (!quote || !quote.agendamento_id || !linkedAppointment || isTrashed(linkedAppointment)) return { kind: "simple" };
    if (appointmentBlock(linkedAppointment)) {
      return { kind: "blocked", reason: "Este orçamento está ligado a um atendimento concluído ou pago e não pode ser excluído." };
    }
    if (linkedAppointment.status === "cancelado") return { kind: "simple" };
    return { kind: "with-appointment" };
  }

  function clientArchiveSummary(clientId, appointments, quotes, now) {
    const t = (now || new Date()).getTime();
    const upcoming = (appointments || []).filter(function (a) {
      return a.cliente_id === clientId && !isTrashed(a) && a.status !== "cancelado" && a.status !== "concluido" && new Date(a.inicio_em).getTime() > t;
    }).length;
    const openQuotes = (quotes || []).filter(function (q) {
      return q.cliente_id === clientId && !isTrashed(q) && ["rascunho", "enviado"].indexOf(q.status) >= 0;
    }).length;
    return { upcoming: upcoming, openQuotes: openQuotes };
  }

  function friendlyError(error, fallback) {
    const message = String((error && error.message) || error || "");
    const code = (error && error.code) || "";
    if (code === "42501" || /row.level security|permission denied/i.test(message)) return "Sem permissão. Saia e entre novamente.";
    if (/network|failed to fetch|load failed|fetcherror/i.test(message)) return "Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente.";
    if (/column .*(arquivado_em|excluido_em)|function .*(excluir|restaurar)|schema cache/i.test(message)) return "Este recurso ainda não está disponível no banco de dados. Avise o suporte.";
    const cleaned = message.replace(/^AGENDAMENTO_VINCULADO:\s*/, "").trim();
    return cleaned || fallback || "Não foi possível concluir a operação.";
  }

  return { isArchived: isArchived, isTrashed: isTrashed, appointmentBlock: appointmentBlock, quoteDeletePlan: quoteDeletePlan, clientArchiveSummary: clientArchiveSummary, friendlyError: friendlyError };
});
