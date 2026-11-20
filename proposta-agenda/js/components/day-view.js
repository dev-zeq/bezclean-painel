(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  function renderEventCard(entry, S) {
    const rangeText = T.hhmm(entry.start) + "–" + T.hhmm(entry.end);

    if (entry.kind === "block") {
      return (
        '<div class="appt-card is-block type-bloqueio pattern-blocked">' +
          '<div class="appt-card-top">' +
            '<span class="appt-time tnum">' + S.esc(rangeText) + "</span>" +
            '<div class="appt-badges">' +
              '<span class="badge-chip badge-type type-bloqueio">' + I.typeIcon("bloqueio") + "<span>Bloqueado</span></span>" +
            "</div>" +
          "</div>" +
          '<div class="appt-card-main">' +
            '<span class="appt-client">Horário indisponível</span>' +
          "</div>" +
          '<p class="appt-service">' + S.esc(entry.item.motivo || "Equipe indisponível neste intervalo") + "</p>" +
        "</div>"
      );
    }

    const ev = entry.item;
    const type = T.typeOf(ev);
    const noonBadge = entry.crossesNoon
      ? '<span class="badge-chip badge-noon-bridge">Manhã → Tarde · até ' + S.esc(T.hhmm(entry.end)) + "</span>"
      : "";
    const addrShort = ev.endereco ? ev.endereco.split("—")[0].trim() : "Endereço a informar";
    const valueText = Number(ev.valor) ? T.formatMoney(ev.valor) : "Valor a definir";

    return (
      '<button type="button" class="appt-card type-' + type + " st-" + S.esc(ev.status) + '" data-event-id="' + S.esc(ev.id) + '">' +
        '<div class="appt-card-top">' +
          '<span class="appt-time tnum">' + S.esc(rangeText) + "</span>" +
          '<div class="appt-badges">' +
            S.typeBadge(ev) +
            S.statusBadge(ev.status) +
            noonBadge +
          "</div>" +
        "</div>" +
        '<div class="appt-card-main">' +
          '<span class="appt-client">' + S.esc(T.eventTitle(ev)) + "</span>" +
          '<span class="appt-price tnum">' + S.esc(valueText) + "</span>" +
        "</div>" +
        '<p class="appt-service">' + S.esc(ev.descricao_servico || "Serviço não detalhado") + "</p>" +
        '<div class="appt-meta-line">' +
          "<span>" + S.esc(addrShort) + "</span>" +
          "<span>Toque para ver detalhes</span>" +
        "</div>" +
      "</button>"
    );
  }

  function renderFreeGapRow(win, key, S) {
    return (
      '<button type="button" class="free-gap-row" data-slot-key="' + S.esc(key) + '" data-slot-start="' + S.esc(win.startText) + '" data-slot-dur="' + win.durationMin + '" data-slot-period="' + S.esc(win.period) + '">' +
        '<span class="tnum">' + S.esc(win.startText) + "–" + S.esc(win.endText) + " livre (" + S.esc(win.durationLabel) + ")</span>" +
        '<span class="free-gap-cta">+ Agendar</span>' +
      "</button>"
    );
  }

  function buildPeriodSequence(entries, windows, periodStart, periodEnd, key, S, carryOverHtml) {
    const items = [];
    entries.forEach(entry => {
      items.push({ sortMin: entry.startMin, html: renderEventCard(entry, S) });
    });

    windows.forEach(w => {
      const s = Math.max(periodStart, w.startMin);
      const e = Math.min(periodEnd, w.endMin);
      if (e - s < 30) return;
      const clipped = {
        startMin: s,
        endMin: e,
        startText: T.minutesToHhmm(s),
        endText: T.minutesToHhmm(e),
        durationMin: e - s,
        durationLabel: T.formatDuration(e - s),
        period: periodStart < T.NOON_MIN ? "manha" : "tarde"
      };
      items.push({ sortMin: s, html: renderFreeGapRow(clipped, key, S) });
    });

    items.sort((a, b) => a.sortMin - b.sortMin);
    return (carryOverHtml || "") + items.map(i => i.html).join("");
  }

  /**
   * @component DayView
   * @props { date: Date, events: Array<Appointment>, blocks: Array<Block> }
   * @actions {
   *   onSelectEvent(eventId),
   *   onSelectSlot(dateKey, startTime, durationMin, period)
   * }
   */
  UI.DayView = {
    render: function (el, props, actions) {
      const S = UI.shared;
      const date = props.date || new Date();
      const key = T.dateKey(date);
      const split = T.daySplitForRender(props.events, props.blocks, date);
      const windows = T.computeFreeWindows(props.events, props.blocks, date);

      // 1. Barra contínua 08h–18h
      const trackSegs = split.allItems
        .filter(entry => entry.active)
        .map(entry => {
          const pos = T.trackPosition(entry.startMin, entry.endMin);
          if (pos.widthPct <= 0) return "";
          if (entry.kind === "block") {
            return (
              '<div class="timeline-seg is-block pattern-blocked" style="left:' + pos.leftPct + '%;width:' + pos.widthPct + '%" title="Bloqueado ' + S.esc(T.hhmm(entry.start) + "–" + T.hhmm(entry.end)) + '">' +
                "<span>Bloqueado</span>" +
              "</div>"
            );
          }
          const ev = entry.item;
          const type = T.typeOf(ev);
          const stClass = ev.status === "provisorio" ? " is-provisional" : ev.status === "concluido" ? " is-completed" : "";
          return (
            '<button type="button" class="timeline-seg type-' + type + stClass + '" data-event-id="' + S.esc(ev.id) + '" style="left:' + pos.leftPct + '%;width:' + pos.widthPct + '%" title="' + S.esc(T.hhmm(entry.start) + "–" + T.hhmm(entry.end) + " · " + T.eventTitle(ev)) + '">' +
              "<span>" + S.esc(T.eventTitle(ev).split(" ")[0]) + "</span>" +
            "</button>"
          );
        })
        .join("");

      const freeChips = windows.length
        ? windows.map(w => (
            '<button type="button" class="free-slot-chip tnum" data-slot-key="' + S.esc(key) + '" data-slot-start="' + S.esc(w.startText) + '" data-slot-dur="' + Math.min(120, w.durationMin) + '" data-slot-period="' + S.esc(w.period) + '">' +
              "+ " + S.esc(w.startText) + "–" + S.esc(w.endText) + " (" + S.esc(w.durationLabel) + ")" +
            "</button>"
          )).join("")
        : '<span class="free-slots-label">Dia sem horários livres entre 08h e 18h</span>';

      // 2. Seção Manhã (08h–12h)
      const morningActiveCount = split.morning.filter(e => e.kind === "event" && e.active).length;
      const morningBlocksCount = split.morning.filter(e => e.kind === "block").length;
      const morningFree = windows.some(w => w.startMin < T.NOON_MIN);
      const morningPill = morningActiveCount
        ? morningActiveCount + " atendimento" + (morningActiveCount > 1 ? "s" : "")
        : morningBlocksCount ? "Bloqueado" : "Manhã livre";

      const morningHtml = buildPeriodSequence(
        split.morning,
        windows,
        T.WORK_START_MIN,
        T.NOON_MIN,
        key,
        S,
        ""
      );

      // 3. Seção Tarde (12h–18h) — mostra carryover se algum compromisso da manhã passou de 12:00
      const afternoonActiveCount = split.afternoon.filter(e => e.kind === "event" && e.active).length;
      const carryHtml = split.noonCarryOver.map(co => (
        '<button type="button" class="noon-carryover" ' +
          (co.kind === "event" ? 'data-event-id="' + S.esc(co.id) + '"' : "") + ">" +
          '<div class="noon-carryover-left">' +
            '<span class="noon-carryover-tag">Continua da manhã</span>' +
            '<span class="noon-carryover-text tnum">Ocupado até <strong>' + S.esc(co.untilText) + "</strong> · " + S.esc(co.title) + " (iniciou " + S.esc(co.startedAt) + ")</span>" +
          "</div>" +
          (co.kind === "event" ? '<span class="noon-carryover-action">Abrir</span>' : "") +
        "</button>"
      )).join("");

      const afternoonFree = windows.some(w => w.endMin > T.NOON_MIN);
      let afternoonPill = "Tarde livre";
      if (afternoonActiveCount) {
        afternoonPill = afternoonActiveCount + " atendimento" + (afternoonActiveCount > 1 ? "s" : "");
      } else if (split.noonCarryOver.length) {
        afternoonPill = "Livre após " + split.noonCarryOver[split.noonCarryOver.length - 1].untilText;
      } else if (split.afternoon.some(e => e.kind === "block")) {
        afternoonPill = "Com bloqueio";
      }

      const afternoonHtml = buildPeriodSequence(
        split.afternoon,
        windows,
        T.NOON_MIN,
        T.WORK_END_MIN,
        key,
        S,
        carryHtml
      );

      el.innerHTML =
        '<div class="day-shell">' +
          '<section class="day-timeline-box" aria-label="Linha do tempo contínua do dia">' +
            '<div class="day-timeline-head">' +
              "<strong>Ocupação do dia (08h às 18h)</strong>" +
              "<span>Verde = livre · Linha central marca 12h (meio-dia)</span>" +
            "</div>" +
            '<div class="timeline-track">' +
              '<div class="timeline-noon-line" aria-hidden="true"></div>' +
              trackSegs +
            "</div>" +
            '<div class="timeline-axis tnum" aria-hidden="true">' +
              "<span>08h</span><span>10h</span><span class=\"axis-noon\">12h</span><span>14h</span><span>16h</span><span>18h</span>" +
            "</div>" +
            '<div class="free-slots-strip">' +
              '<span class="free-slots-label">Horários livres:</span>' +
              freeChips +
            "</div>" +
          "</section>" +
          '<div class="day-periods">' +
            '<section class="period-column">' +
              '<header class="period-header">' +
                '<div class="period-title">' + I.get("sun") + "<div><h3>Manhã</h3><span>08:00 – 12:00</span></div></div>" +
                '<span class="period-pill ' + (morningFree && !morningActiveCount ? "is-free" : "is-busy") + '">' + S.esc(morningPill) + "</span>" +
              "</header>" +
              '<div class="period-list">' + (morningHtml || '<p class="appt-service">Sem horários livres pela manhã.</p>') + "</div>" +
            "</section>" +
            '<section class="period-column">' +
              '<header class="period-header">' +
                '<div class="period-title">' + I.get("sunset") + "<div><h3>Tarde</h3><span>12:00 – 18:00</span></div></div>" +
                '<span class="period-pill ' + (afternoonFree && !afternoonActiveCount ? "is-free" : "is-busy") + '">' + S.esc(afternoonPill) + "</span>" +
              "</header>" +
              '<div class="period-list">' + (afternoonHtml || '<p class="appt-service">Sem horários livres à tarde.</p>') + "</div>" +
            "</section>" +
          "</div>" +
        "</div>";

      el.querySelectorAll("[data-event-id]").forEach(btn => {
        btn.onclick = () => actions.onSelectEvent && actions.onSelectEvent(btn.dataset.eventId);
      });
      el.querySelectorAll("[data-slot-key]").forEach(btn => {
        btn.onclick = () => actions.onSelectSlot && actions.onSelectSlot(
          btn.dataset.slotKey,
          btn.dataset.slotStart,
          Number(btn.dataset.slotDur) || 120,
          btn.dataset.slotPeriod
        );
      });
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
