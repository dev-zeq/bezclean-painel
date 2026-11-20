(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BezTime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WORK_START_MIN = 8 * 60;  // 08:00
  const NOON_MIN = 12 * 60;       // 12:00
  const WORK_END_MIN = 18 * 60;   // 18:00

  const TYPES = {
    estofados: { id: "estofados", label: "Higienização de estofados", short: "Estofados" },
    faxina: { id: "faxina", label: "Faxina avulsa", short: "Faxina" },
    apartamento: { id: "apartamento", label: "Apartamento / Airbnb", short: "Apartamento" }
  };

  const STATUS = {
    provisorio: { id: "provisorio", label: "A confirmar" },
    agendado: { id: "agendado", label: "Agendado" },
    confirmado: { id: "confirmado", label: "Confirmado" },
    em_andamento: { id: "em_andamento", label: "Em andamento" },
    concluido: { id: "concluido", label: "Concluído" },
    cancelado: { id: "cancelado", label: "Cancelado" }
  };

  const pad = n => String(n).padStart(2, "0");

  function dayStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseLocalDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function combineDateTime(dateStr, timeStr) {
    return new Date(dateStr + "T" + timeStr + ":00");
  }

  function hhmm(date) {
    const d = date instanceof Date ? date : new Date(date);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function toMinutes(timeOrDate) {
    if (typeof timeOrDate === "string") {
      const [h, m] = timeOrDate.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    }
    const d = timeOrDate instanceof Date ? timeOrDate : new Date(timeOrDate);
    return d.getHours() * 60 + d.getMinutes();
  }

  function minutesToHhmm(totalMinutes) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
    return pad(Math.floor(clamped / 60)) + ":" + pad(clamped % 60);
  }

  function formatDuration(minutes) {
    const mins = Math.max(0, Math.round(minutes || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return m + " min";
    if (!m) return h + "h";
    return h + "h" + pad(m);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(Number(value) || 0);
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatDayTitle(date) {
    return capitalize(
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long"
      }).format(date)
    );
  }

  function formatWeekRange(start, endExclusive) {
    const last = addDays(endExclusive, -1);
    const fmtMonth = new Intl.DateTimeFormat("pt-BR", { month: "short" });
    const sameMonth = start.getMonth() === last.getMonth();
    const sMonth = fmtMonth.format(start).replace(".", "");
    const eMonth = fmtMonth.format(last).replace(".", "");
    return (
      start.getDate() +
      (sameMonth ? "" : " " + sMonth) +
      " – " +
      last.getDate() +
      " de " +
      eMonth
    );
  }

  function formatMonthTitle(date) {
    return capitalize(
      new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric"
      }).format(date)
    );
  }

  function weekStart(date) {
    const d = dayStart(date);
    return addDays(d, -d.getDay());
  }

  function viewRange(mode, date) {
    if (mode === "month") {
      return {
        start: new Date(date.getFullYear(), date.getMonth(), 1),
        end: new Date(date.getFullYear(), date.getMonth() + 1, 1)
      };
    }
    if (mode === "week") {
      const start = weekStart(date);
      return { start: start, end: addDays(start, 7) };
    }
    const start = dayStart(date);
    return { start: start, end: addDays(start, 1) };
  }

  function shiftDate(mode, date, step) {
    if (mode === "month") {
      return new Date(date.getFullYear(), date.getMonth() + step, 1);
    }
    return addDays(date, (mode === "week" ? 7 : 1) * step);
  }

  function typeOf(event) {
    return TYPES[event && event.tipo] ? event.tipo : "estofados";
  }

  function isAirbnb(event) {
    return Boolean(event && event.apartamentos && event.apartamentos.airbnb);
  }

  function isActiveEvent(event) {
    return Boolean(event && event.status !== "cancelado" && !event.excluido_em);
  }

  function eventTitle(event) {
    if (!event) return "Atendimento";
    if (typeOf(event) === "apartamento" && event.apartamentos && event.apartamentos.nome) {
      return event.apartamentos.nome;
    }
    return (
      (event.clientes && event.clientes.nome) ||
      (event.apartamentos && event.apartamentos.nome) ||
      event.cliente_nome ||
      "Cliente"
    );
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  /**
   * Retorna true quando o atendimento inicia antes de 12:00 e termina depois de 12:00.
   * Ex.: 10:30–12:30 -> true; 08:00–12:00 -> false; 12:00–14:00 -> false.
   */
  function crossesNoon(start, end) {
    const s = start instanceof Date ? start : new Date(start);
    const e = end instanceof Date ? end : new Date(end);
    if (!(e > s)) return false;
    const sameDay = dateKey(s) === dateKey(e);
    const sMin = toMinutes(s);
    const eMin = sameDay ? toMinutes(e) : 24 * 60;
    return sMin < NOON_MIN && eMin > NOON_MIN;
  }

  function clampDayMinutes(start, end, day) {
    const dStart = dayStart(day);
    const dEnd = addDays(dStart, 1);
    const effStart = start > dStart ? start : dStart;
    const effEnd = end < dEnd ? end : dEnd;
    const sMin = effStart.getHours() * 60 + effStart.getMinutes();
    const eMin = effEnd.getTime() === dEnd.getTime()
      ? 24 * 60
      : effEnd.getHours() * 60 + effEnd.getMinutes();
    return { sMin: sMin, eMin: Math.max(sMin + 1, eMin) };
  }

  /**
   * Separa compromissos e bloqueios de um dia SEM DUPLICAR atendimentos que cruzam 12:00.
   * - Cada compromisso entra em `morning` (se começa < 12:00) OU `afternoon` (se começa >= 12:00).
   * - Compromissos ativos que começam < 12:00 e terminam > 12:00 geram um registro leve
   *   em `noonCarryOver` para informar ocupação parcial na tarde sem duplicar contagem/valor.
   */
  function daySplitForRender(events, blocks, day) {
    const dStart = dayStart(day);
    const dEnd = addDays(dStart, 1);
    const allItems = [];

    (events || []).forEach(ev => {
      if (ev.excluido_em) return;
      const start = new Date(ev.inicio_em);
      const end = new Date(ev.fim_em || ev.inicio_em);
      if (!overlaps(start, end, dStart, dEnd)) return;
      const { sMin, eMin } = clampDayMinutes(start, end, dStart);
      allItems.push({
        kind: "event",
        id: ev.id,
        item: ev,
        start: start,
        end: end,
        startMin: sMin,
        endMin: eMin,
        crossesNoon: sMin < NOON_MIN && eMin > NOON_MIN,
        active: isActiveEvent(ev)
      });
    });

    (blocks || []).forEach(block => {
      const start = new Date(block.inicio_em);
      const end = new Date(block.fim_em || block.inicio_em);
      if (!overlaps(start, end, dStart, dEnd)) return;
      const { sMin, eMin } = clampDayMinutes(start, end, dStart);
      allItems.push({
        kind: "block",
        id: block.id,
        item: block,
        start: start,
        end: end,
        startMin: sMin,
        endMin: eMin,
        crossesNoon: sMin < NOON_MIN && eMin > NOON_MIN,
        active: true
      });
    });

    allItems.sort((a, b) => a.start - b.start);

    const morning = [];
    const noonCarryOver = [];
    const afternoon = [];

    allItems.forEach(entry => {
      if (entry.startMin < NOON_MIN) {
        morning.push(entry);
        if (entry.active && entry.crossesNoon) {
          noonCarryOver.push({
            kind: entry.kind,
            id: entry.id,
            item: entry.item,
            start: entry.start,
            end: entry.end,
            startMin: NOON_MIN,
            endMin: entry.endMin,
            startedAt: hhmm(entry.start),
            untilText: hhmm(entry.end),
            title: entry.kind === "block"
              ? "Bloqueio (" + (entry.item.motivo || "Indisponível") + ")"
              : eventTitle(entry.item)
          });
        }
      } else {
        afternoon.push(entry);
      }
    });

    return {
      allItems: allItems,
      morning: morning,
      noonCarryOver: noonCarryOver,
      afternoon: afternoon
    };
  }

  /**
   * Calcula janelas livres reais (>= 30 min) dentro do expediente [workStart, workEnd].
   * Ignora atendimentos cancelados/excluídos e respeita bloqueios e extensões além das 12:00.
   */
  function computeFreeWindows(events, blocks, day, workStart, workEnd) {
    const ws = typeof workStart === "number" ? workStart : WORK_START_MIN;
    const we = typeof workEnd === "number" ? workEnd : WORK_END_MIN;
    const split = daySplitForRender(events, blocks, day);

    const busy = split.allItems
      .filter(entry => entry.active)
      .map(entry => ({
        startMin: Math.max(ws, entry.startMin),
        endMin: Math.min(we, entry.endMin)
      }))
      .filter(seg => seg.endMin > seg.startMin)
      .sort((a, b) => a.startMin - b.startMin);

    const merged = [];
    busy.forEach(seg => {
      const last = merged[merged.length - 1];
      if (!last || seg.startMin > last.endMin) {
        merged.push({ startMin: seg.startMin, endMin: seg.endMin });
      } else {
        last.endMin = Math.max(last.endMin, seg.endMin);
      }
    });

    const windows = [];
    let cursor = ws;

    const pushGap = (gapStart, gapEnd) => {
      const dur = gapEnd - gapStart;
      if (dur < 30) return;
      let period = "dia";
      if (gapEnd <= NOON_MIN) period = "manha";
      else if (gapStart >= NOON_MIN) period = "tarde";
      windows.push({
        startMin: gapStart,
        endMin: gapEnd,
        startText: minutesToHhmm(gapStart),
        endText: minutesToHhmm(gapEnd),
        durationMin: dur,
        durationLabel: formatDuration(dur),
        period: period
      });
    };

    merged.forEach(seg => {
      if (seg.startMin > cursor) pushGap(cursor, seg.startMin);
      cursor = Math.max(cursor, seg.endMin);
    });
    if (cursor < we) pushGap(cursor, we);

    return windows;
  }

  /**
   * Calcula indicadores do resumo sem duplicar eventos que cruzam o meio-dia.
   */
  function computeSummary(events, nowDate) {
    const now = nowDate instanceof Date ? nowDate : new Date(nowDate || Date.now());
    const seen = new Set();
    const active = [];

    (events || []).forEach(ev => {
      if (!ev || !isActiveEvent(ev)) return;
      if (ev.id && seen.has(ev.id)) return;
      if (ev.id) seen.add(ev.id);
      active.push(ev);
    });

    active.sort((a, b) => new Date(a.inicio_em) - new Date(b.inicio_em));

    let confirmedCount = 0;
    let provisionalCount = 0;
    let completedCount = 0;
    let totalRevenue = 0;

    active.forEach(ev => {
      totalRevenue += Number(ev.valor) || 0;
      if (ev.status === "provisorio") provisionalCount += 1;
      else if (ev.status === "concluido") completedCount += 1;
      else confirmedCount += 1;
    });

    const upcoming = active.filter(ev => ev.status !== "concluido" && new Date(ev.fim_em) > now);
    const nextEvent = upcoming.find(ev => new Date(ev.inicio_em) >= now) || upcoming[0] || null;

    return {
      count: active.length,
      confirmedCount: confirmedCount,
      provisionalCount: provisionalCount,
      completedCount: completedCount,
      totalRevenue: totalRevenue,
      nextEvent: nextEvent
    };
  }

  /**
   * Detecta sobreposições de horário contra compromissos ativos e bloqueios.
   */
  function detectConflicts(events, blocks, startDate, endDate, ignoreId) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    if (!(end > start)) return [];

    const found = [];

    (events || []).forEach(ev => {
      if (!ev || ev.id === ignoreId || !isActiveEvent(ev)) return;
      const s = new Date(ev.inicio_em);
      const e = new Date(ev.fim_em);
      if (!overlaps(start, end, s, e)) return;
      const overlapMinutes = Math.max(
        1,
        Math.round((Math.min(end.getTime(), e.getTime()) - Math.max(start.getTime(), s.getTime())) / 60000)
      );
      const t = TYPES[typeOf(ev)].short;
      const prov = ev.status === "provisorio" ? " · A confirmar" : "";
      const air = isAirbnb(ev) ? " · Airbnb" : "";
      found.push({
        kind: "event",
        id: ev.id,
        type: typeOf(ev),
        title: eventTitle(ev),
        start: s,
        end: e,
        overlapMinutes: overlapMinutes,
        label: hhmm(s) + "–" + hhmm(e) + " · " + eventTitle(ev) + " (" + t + air + prov + ")"
      });
    });

    (blocks || []).forEach(block => {
      if (!block || (ignoreId && block.id === ignoreId)) return;
      const s = new Date(block.inicio_em);
      const e = new Date(block.fim_em);
      if (!overlaps(start, end, s, e)) return;
      const overlapMinutes = Math.max(
        1,
        Math.round((Math.min(end.getTime(), e.getTime()) - Math.max(start.getTime(), s.getTime())) / 60000)
      );
      found.push({
        kind: "block",
        id: block.id,
        type: "bloqueio",
        title: block.motivo || "Horário bloqueado",
        start: s,
        end: e,
        overlapMinutes: overlapMinutes,
        label: hhmm(s) + "–" + hhmm(e) + " · Bloqueado" + (block.motivo ? " (" + block.motivo + ")" : "")
      });
    });

    return found.sort((a, b) => a.start - b.start);
  }

  function suggestNextFreeSlot(events, blocks, day, desiredDurationMin) {
    const dur = Math.max(30, Number(desiredDurationMin) || 60);
    const windows = computeFreeWindows(events, blocks, day);
    const fit = windows.find(w => w.durationMin >= dur);
    if (!fit) return null;
    return {
      startText: fit.startText,
      endText: minutesToHhmm(fit.startMin + dur),
      durationMin: dur,
      window: fit
    };
  }

  /**
   * Converte minutos para percentual dentro da régua 08:00–18:00.
   */
  function trackPosition(startMin, endMin, rangeStart, rangeEnd) {
    const rs = typeof rangeStart === "number" ? rangeStart : WORK_START_MIN;
    const re = typeof rangeEnd === "number" ? rangeEnd : WORK_END_MIN;
    const span = re - rs;
    const s = Math.max(rs, Math.min(re, startMin));
    const e = Math.max(s, Math.min(re, endMin));
    const leftPct = ((s - rs) / span) * 100;
    const widthPct = ((e - s) / span) * 100;
    return {
      leftPct: Number(leftPct.toFixed(2)),
      widthPct: Number(widthPct.toFixed(2))
    };
  }

  return {
    WORK_START_MIN: WORK_START_MIN,
    NOON_MIN: NOON_MIN,
    WORK_END_MIN: WORK_END_MIN,
    TYPES: TYPES,
    STATUS: STATUS,
    dayStart: dayStart,
    addDays: addDays,
    dateKey: dateKey,
    parseLocalDate: parseLocalDate,
    combineDateTime: combineDateTime,
    hhmm: hhmm,
    toMinutes: toMinutes,
    minutesToHhmm: minutesToHhmm,
    formatDuration: formatDuration,
    formatMoney: formatMoney,
    capitalize: capitalize,
    formatDayTitle: formatDayTitle,
    formatWeekRange: formatWeekRange,
    formatMonthTitle: formatMonthTitle,
    weekStart: weekStart,
    viewRange: viewRange,
    shiftDate: shiftDate,
    typeOf: typeOf,
    isAirbnb: isAirbnb,
    isActiveEvent: isActiveEvent,
    eventTitle: eventTitle,
    overlaps: overlaps,
    crossesNoon: crossesNoon,
    daySplitForRender: daySplitForRender,
    computeFreeWindows: computeFreeWindows,
    computeSummary: computeSummary,
    detectConflicts: detectConflicts,
    suggestNextFreeSlot: suggestNextFreeSlot,
    trackPosition: trackPosition
  };
});
