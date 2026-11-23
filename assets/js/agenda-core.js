(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AgendaCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Regras da agenda unificada: tipos de atendimento, períodos (manhã/tarde),
  // disponibilidade e conflitos. A equipe é uma só (duas pessoas trabalhando juntas),
  // então qualquer sobreposição de horário é conflito e pede confirmação.

  const TYPES = {
    estofados: { label: "Estofados", short: "Estofados" },
    faxina: { label: "Faxina / limpeza avulsa", short: "Faxina" },
    apartamento: { label: "Apartamento", short: "Apartamento" }
  };
  const STATUS = {
    provisorio: "Provisório",
    agendado: "Agendado",
    confirmado: "Confirmado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado"
  };
  const NOON = 12;
  const PERIODS = {
    manha: { label: "Manhã (08:00–12:00)", start: "08:00", end: "12:00" },
    tarde: { label: "Tarde (13:00–17:00)", start: "13:00", end: "17:00" },
    dia: { label: "Dia inteiro (08:00–17:00)", start: "08:00", end: "17:00" }
  };
  const HALVES = [{ id: "manha", label: "Manhã" }, { id: "tarde", label: "Tarde" }];
  const CLEANING_TYPES = {
    apartamento: ["Limpeza de saída (check-out)", "Limpeza de entrada (check-in)", "Limpeza completa", "Limpeza de manutenção"],
    faxina: ["Faxina residencial", "Limpeza pesada", "Limpeza pós-obra", "Limpeza comercial"]
  };

  const AIRBNB_CLEANING = "Troca de hóspede (Airbnb)";
  // Apartamento que a própria Bez Clean administra no Airbnb (os demais são faxinas para o dono).
  const isAirbnb = event => !!(event && event.apartamentos && event.apartamentos.airbnb);

  const pad = n => String(n).padStart(2, "0");
  const dateKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const hhmm = d => pad(d.getHours()) + ":" + pad(d.getMinutes());
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const minutes = text => { const [h, m] = text.split(":").map(Number); return h * 60 + m; };

  const typeOf = event => TYPES[event.tipo] ? event.tipo : "estofados";
  const isActive = event => event.status !== "cancelado" && !event.excluido_em;

  function title(event) {
    if (typeOf(event) === "apartamento" && event.apartamentos) return event.apartamentos.nome || "Apartamento";
    return (event.clientes && event.clientes.nome) || (event.apartamentos && event.apartamentos.nome) || "Cliente";
  }

  // Qual período pronto corresponde a este horário; "custom" se nenhum.
  function periodOf(startText, endText) {
    return Object.keys(PERIODS).find(id => PERIODS[id].start === startText && PERIODS[id].end === endText) || "custom";
  }

  // Início e fim (Date) a partir de data "AAAA-MM-DD" e período, ou horário + duração.
  function range(date, period, time, durationMinutes) {
    const at = text => new Date(date + "T" + text + ":00");
    if (PERIODS[period]) return { start: at(PERIODS[period].start), end: at(PERIODS[period].end) };
    const start = at(time);
    return { start: start, end: new Date(start.getTime() + durationMinutes * 60000) };
  }

  const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

  // Em quais metades do dia (manhã/tarde) o intervalo cai.
  function halvesOf(start, end, day) {
    const begin = dayStart(day), noon = new Date(begin.getFullYear(), begin.getMonth(), begin.getDate(), NOON), finish = addDays(begin, 1);
    return { manha: overlaps(start, end, begin, noon), tarde: overlaps(start, end, noon, finish) };
  }

  // Compromissos e bloqueios de um dia, separados em manhã e tarde e ordenados por horário.
  // Um compromisso de dia inteiro aparece nas duas metades.
  function dayBuckets(events, blocks, day) {
    const buckets = { manha: [], tarde: [] };
    const push = (kind, item) => {
      const start = new Date(item.inicio_em), end = new Date(item.fim_em || item.inicio_em);
      const halves = halvesOf(start, end > start ? end : new Date(start.getTime() + 60000), day);
      HALVES.forEach(half => { if (halves[half.id]) buckets[half.id].push({ kind: kind, item: item, start: start, end: end }); });
    };
    (events || []).forEach(event => push("event", event));
    (blocks || []).forEach(block => push("block", block));
    HALVES.forEach(half => buckets[half.id].sort((a, b) => a.start - b.start));
    return buckets;
  }

  // Uma metade está livre quando não tem bloqueio nem compromisso ativo (cancelados não ocupam).
  const isFree = entries => !entries.some(entry => entry.kind === "block" || isActive(entry.item));

  // O que já existe no intervalo pedido. ignoreId: o próprio agendamento em edição.
  function conflicts(events, blocks, start, end, ignoreId) {
    const found = [];
    (events || []).forEach(event => {
      if (event.id === ignoreId || !isActive(event)) return;
      const s = new Date(event.inicio_em), e = new Date(event.fim_em);
      if (overlaps(start, end, s, e)) found.push({ kind: "event", start: s, end: e, label: hhmm(s) + "–" + hhmm(e) + " · " + title(event) + " (" + TYPES[typeOf(event)].short + (isAirbnb(event) ? " Airbnb" : "") + (event.status === "provisorio" ? ", provisório" : "") + ")" });
    });
    (blocks || []).forEach(block => {
      const s = new Date(block.inicio_em), e = new Date(block.fim_em);
      if (overlaps(start, end, s, e)) found.push({ kind: "block", start: s, end: e, label: hhmm(s) + "–" + hhmm(e) + " · Horário bloqueado" + (block.motivo ? " (" + block.motivo + ")" : "") });
    });
    return found.sort((a, b) => a.start - b.start);
  }

  // Consulta o banco e devolve os conflitos do intervalo. db: cliente Supabase.
  async function findConflicts(db, start, end, ignoreId) {
    const from = start.toISOString(), to = end.toISOString();
    const [events, blocks] = await Promise.all([
      db.from("agendamentos").select("id,tipo,status,inicio_em,fim_em,excluido_em,clientes(nome),apartamentos(nome,airbnb)").is("excluido_em", null).lt("inicio_em", to).gt("fim_em", from),
      db.from("bloqueios_agenda").select("inicio_em,fim_em,motivo").lt("inicio_em", to).gt("fim_em", from)
    ]);
    if (events.error) throw events.error;
    return conflicts(events.data, blocks.error ? [] : blocks.data, start, end, ignoreId);
  }

  function conflictMessage(list) {
    return "Já existe compromisso neste horário:\n" + list.map(item => "• " + item.label).join("\n") + "\n\nA equipe é a mesma para todos os serviços. Deseja agendar mesmo assim?";
  }

  // Domingo da semana que contém a data.
  const weekStart = d => addDays(dayStart(d), -d.getDay());

  // Intervalo carregado e dias exibidos em cada visão.
  function viewRange(mode, date) {
    if (mode === "month") return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
    if (mode === "week") { const start = weekStart(date); return { start: start, end: addDays(start, 7) }; }
    const start = dayStart(date);
    return { start: start, end: addDays(start, 1) };
  }

  function shift(mode, date, step) {
    if (mode === "month") return new Date(date.getFullYear(), date.getMonth() + step, 1);
    return addDays(date, (mode === "week" ? 7 : 1) * step);
  }

  const WAY_NOTICE_STATUSES = ["agendado", "confirmado"];
  const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function canUseWayNotice(appointment) {
    return !!(appointment && typeOf(appointment) === "estofados" && WAY_NOTICE_STATUSES.includes(appointment.status));
  }

  function addMinutesToTime(inicioEm, offsetMinutes) {
    const start = inicioEm instanceof Date ? inicioEm : new Date(inicioEm);
    if (Number.isNaN(start.getTime())) return "";
    return hhmm(new Date(start.getTime() + (Number(offsetMinutes) || 0) * 60000));
  }

  function wayNoticeBadge(appointment) {
    if (!appointment) return { tone: "auto", text: "Automático (30 min antes)", observation: null };
    if (appointment.lembrete_caminho_status === "enviado") {
      const sent = appointment.lembrete_caminho_enviado_em ? new Date(appointment.lembrete_caminho_enviado_em) : null;
      const sentTime = sent && !Number.isNaN(sent.getTime()) ? hhmm(sent) : "--:--";
      return { tone: "sent", text: "Aviso enviado às " + sentTime, observation: null };
    }
    if (appointment.lembrete_caminho_modo === "atraso") {
      return {
        tone: "delay",
        text: "Atraso: previsto " + (appointment.lembrete_caminho_novo_horario || "--:--"),
        observation: appointment.lembrete_caminho_observacao || null
      };
    }
    if (appointment.lembrete_caminho_modo === "pausado") {
      return { tone: "paused", text: "Aviso pausado", observation: null };
    }
    return { tone: "auto", text: "Automático (30 min antes)", observation: null };
  }

  function buildWayNoticePayload(action, options) {
    const opts = options || {};
    const nowIso = opts.nowIso || new Date().toISOString();
    if (action === "atraso") {
      const novoHorario = String(opts.novoHorario || "").trim();
      if (!HHMM_RE.test(novoHorario)) {
        throw new Error("Informe o horário previsto no formato HH:mm.");
      }
      const obs = opts.observacao != null ? String(opts.observacao).trim() : "";
      return {
        lembrete_caminho_modo: "atraso",
        lembrete_caminho_novo_horario: novoHorario,
        lembrete_caminho_observacao: obs || null,
        lembrete_caminho_status: "pendente",
        lembrete_caminho_atualizado_em: nowIso
      };
    }
    if (action === "pausado") {
      return {
        lembrete_caminho_modo: "pausado",
        lembrete_caminho_atualizado_em: nowIso
      };
    }
    if (action === "automatico") {
      return {
        lembrete_caminho_modo: "automatico",
        lembrete_caminho_novo_horario: null,
        lembrete_caminho_observacao: null,
        lembrete_caminho_atualizado_em: nowIso
      };
    }
    throw new Error("Modo de aviso inválido.");
  }

  return {
    TYPES: TYPES, STATUS: STATUS, PERIODS: PERIODS, HALVES: HALVES, CLEANING_TYPES: CLEANING_TYPES, AIRBNB_CLEANING: AIRBNB_CLEANING, isAirbnb: isAirbnb,
    dateKey: dateKey, hhmm: hhmm, addDays: addDays, minutes: minutes, typeOf: typeOf, isActive: isActive, title: title,
    periodOf: periodOf, range: range, overlaps: overlaps, halvesOf: halvesOf, dayBuckets: dayBuckets, isFree: isFree,
    conflicts: conflicts, findConflicts: findConflicts, conflictMessage: conflictMessage,
    weekStart: weekStart, viewRange: viewRange, shift: shift,
    canUseWayNotice: canUseWayNotice, addMinutesToTime: addMinutesToTime,
    wayNoticeBadge: wayNoticeBadge, buildWayNoticePayload: buildWayNoticePayload
  };
});
