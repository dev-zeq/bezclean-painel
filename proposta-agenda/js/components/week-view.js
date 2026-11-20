(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component WeekView
   * @props { startDate: Date, todayKey: string, events: Array<Appointment>, blocks: Array<Block> }
   * @actions {
   *   onOpenDay(dateKey),
   *   onSelectEvent(eventId),
   *   onSelectSlot(dateKey, startTime, durationMin, period)
   * }
   */
  UI.WeekView = {
    render: function (el, props, actions) {
      const S = UI.shared;
      const start = props.startDate || T.weekStart(new Date());
      const todayKey = props.todayKey || T.dateKey(new Date());
      const events = props.events || [];
      const blocks = props.blocks || [];

      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = T.addDays(start, i);
        const key = T.dateKey(d);
        const split = T.daySplitForRender(events, blocks, d);
        const windows = T.computeFreeWindows(events, blocks, d);
        const activeCount = split.allItems.filter(e => e.kind === "event" && e.active).length;
        const morningBusy = split.morning.some(e => e.active);
        const afternoonBusy = split.afternoon.some(e => e.active) || split.noonCarryOver.length > 0;
        days.push({
          date: d,
          key: key,
          weekdayShort: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d).replace(".", ""),
          split: split,
          windows: windows,
          activeCount: activeCount,
          morningBusy: morningBusy,
          afternoonBusy: afternoonBusy,
          isToday: key === todayKey,
          isSunday: d.getDay() === 0,
          isPast: key < todayKey
        });
      }

      const stripHtml = days.map(day => (
        '<button type="button" class="week-strip-btn' + (day.isToday ? " is-today" : "") + '" data-scroll-day="' + S.esc(day.key) + '">' +
          "<span>" + S.esc(day.weekdayShort) + "</span>" +
          '<b class="tnum">' + day.date.getDate() + "</b>" +
          '<span class="week-strip-dots" aria-hidden="true">' +
            '<i class="' + (day.morningBusy ? "busy" : "") + '" title="Manhã"></i>' +
            '<i class="' + (day.afternoonBusy ? "busy" : "") + '" title="Tarde"></i>' +
          "</span>" +
        "</button>"
      )).join("");

      const colsHtml = days.map(day => {
        const cls = [
          "week-day-col",
          day.isToday ? "is-today" : "",
          day.isSunday ? "is-sunday" : "",
          day.isPast ? "is-past" : ""
        ].filter(Boolean).join(" ");

        const listItems = day.split.allItems
          .filter(entry => entry.active)
          .map(entry => {
            const timeLabel = T.hhmm(entry.start);
            if (entry.kind === "block") {
              return (
                '<div class="week-ev is-block pattern-blocked">' +
                  '<span class="week-ev-time tnum"><span>' + S.esc(timeLabel) + "–" + S.esc(T.hhmm(entry.end)) + "</span></span>" +
                  '<span class="week-ev-title">Bloqueado</span>' +
                  '<span class="week-ev-sub">' + S.esc(entry.item.motivo || "Indisponível") + "</span>" +
                "</div>"
              );
            }
            const ev = entry.item;
            const type = T.typeOf(ev);
            const noonTag = entry.crossesNoon
              ? '<span class="week-noon-tag">↗ ' + S.esc(T.hhmm(entry.end)) + "</span>"
              : "";
            const airTag = T.isAirbnb(ev) ? " · Airbnb" : "";
            return (
              '<button type="button" class="week-ev type-' + type + " st-" + S.esc(ev.status) + '" data-event-id="' + S.esc(ev.id) + '">' +
                '<span class="week-ev-time tnum"><span>' + S.esc(timeLabel) + "</span>" + noonTag + "</span>" +
                '<span class="week-ev-title">' + S.esc(T.eventTitle(ev)) + "</span>" +
                '<span class="week-ev-sub">' + S.esc(T.TYPES[type].short + airTag) + "</span>" +
              "</button>"
            );
          })
          .join("");

        const freeBtns = day.windows.slice(0, 2).map(w => (
          '<button type="button" class="week-free-btn tnum" data-slot-key="' + S.esc(day.key) + '" data-slot-start="' + S.esc(w.startText) + '" data-slot-dur="' + Math.min(120, w.durationMin) + '" data-slot-period="' + S.esc(w.period) + '">' +
            "+ " + S.esc(w.startText) +
          "</button>"
        )).join("");

        return (
          '<section class="' + cls + '" data-week-day="' + S.esc(day.key) + '">' +
            '<button type="button" class="week-day-head" data-open-day="' + S.esc(day.key) + '">' +
              '<span class="week-day-head-left"><span>' + S.esc(day.weekdayShort) + '</span><b class="tnum">' + day.date.getDate() + "</b></span>" +
              '<span class="week-day-count">' + (day.activeCount ? day.activeCount + " atend." : "Livre") + "</span>" +
            "</button>" +
            S.miniOccupancyBar(events, blocks, day.date) +
            '<div class="week-events-list">' +
              (listItems || '<span class="week-ev-sub" style="padding:6px 2px">Sem atendimentos</span>') +
            "</div>" +
            (freeBtns ? '<div class="week-free-footer">' + freeBtns + "</div>" : "") +
          "</section>"
        );
      }).join("");

      el.innerHTML =
        '<div class="week-mobile-strip" aria-label="Atalho dos dias da semana">' + stripHtml + "</div>" +
        '<div class="week-grid">' + colsHtml + "</div>";

      el.querySelectorAll("[data-scroll-day]").forEach(btn => {
        btn.onclick = () => {
          const target = el.querySelector('[data-week-day="' + btn.dataset.scrollDay + '"]');
          if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        };
      });

      el.querySelectorAll("[data-open-day]").forEach(btn => {
        btn.onclick = () => actions.onOpenDay && actions.onOpenDay(btn.dataset.openDay);
      });

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
