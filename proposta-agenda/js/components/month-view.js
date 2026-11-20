(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component MonthView
   * @props {
   *   monthDate: Date,
   *   selectedDateKey: string,
   *   todayKey: string,
   *   events: Array<Appointment>,
   *   blocks: Array<Block>
   * }
   * @actions {
   *   onSelectDay(dateKey),
   *   onOpenDay(dateKey),
   *   onSelectEvent(eventId),
   *   onSelectSlot(dateKey, startTime, durationMin, period)
   * }
   */
  UI.MonthView = {
    render: function (el, props, actions) {
      const S = UI.shared;
      const monthDate = props.monthDate || new Date();
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const totalDays = new Date(year, month + 1, 0).getDate();
      const firstWeekday = new Date(year, month, 1).getDay();
      const todayKey = props.todayKey || T.dateKey(new Date());
      const events = props.events || [];
      const blocks = props.blocks || [];

      const selectedKey = props.selectedDateKey || todayKey;

      let cells = '<div class="month-cell is-empty"></div>'.repeat(firstWeekday);

      for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const key = T.dateKey(date);
        const split = T.daySplitForRender(events, blocks, date);
        const activeItems = split.allItems.filter(e => e.active);
        const activeEvents = activeItems.filter(e => e.kind === "event");
        const shown = activeItems.slice(0, 2);
        const extra = activeItems.length - shown.length;

        const cls = [
          "month-cell",
          date.getDay() === 0 ? "is-sunday" : "",
          key === todayKey ? "is-today" : "",
          key < todayKey ? "is-past" : "",
          key === selectedKey ? "is-selected" : ""
        ].filter(Boolean).join(" ");

        const chipsHtml = shown.map(entry => {
          if (entry.kind === "block") {
            return (
              '<div class="month-chip is-block pattern-blocked">' +
                '<span class="tnum">' + S.esc(T.hhmm(entry.start)) + " Bloq.</span>" +
              "</div>"
            );
          }
          const ev = entry.item;
          const type = T.typeOf(ev);
          const firstWord = T.eventTitle(ev).split(" ")[0];
          const suffix = entry.crossesNoon ? " ↗" : "";
          return (
            '<div class="month-chip type-' + type + " st-" + S.esc(ev.status) + '" data-month-ev="' + S.esc(ev.id) + '">' +
              '<span class="tnum">' + S.esc(T.hhmm(entry.start)) + " " + S.esc(firstWord) + suffix + "</span>" +
            "</div>"
          );
        }).join("");

        cells +=
          '<div role="button" tabindex="0" class="' + cls + '" data-month-day="' + S.esc(key) + '" aria-label="' + S.esc("Dia " + d + ", " + activeEvents.length + " atendimentos") + '">' +
            '<div class="month-cell-top">' +
              '<span class="month-day-num tnum">' + d + "</span>" +
              (activeEvents.length ? '<span class="month-day-total">' + activeEvents.length + " atend.</span>" : "") +
            "</div>" +
            S.miniOccupancyBar(events, blocks, date) +
            '<div class="month-events">' +
              chipsHtml +
              (extra > 0 ? '<span class="month-more">+' + extra + " mais</span>" : "") +
            "</div>" +
          "</div>";
      }

      const trailing = (7 - ((firstWeekday + totalDays) % 7)) % 7;
      cells += '<div class="month-cell is-empty"></div>'.repeat(trailing);

      // Painel de prévia do dia selecionado (essencial no celular para não depender de tooltip/hover)
      const selDate = T.parseLocalDate(selectedKey);
      const selSplit = T.daySplitForRender(events, blocks, selDate);
      const selWindows = T.computeFreeWindows(events, blocks, selDate);
      const selTitle = T.formatDayTitle(selDate);
      const selListHtml = selSplit.allItems
        .filter(e => e.active)
        .map(entry => {
          const range = T.hhmm(entry.start) + "–" + T.hhmm(entry.end);
          if (entry.kind === "block") {
            return (
              '<div class="appt-card is-block type-bloqueio pattern-blocked">' +
                '<div class="appt-card-top"><span class="appt-time tnum">' + S.esc(range) + "</span></div>" +
                '<div class="appt-card-main"><span class="appt-client">Horário bloqueado</span></div>' +
                '<p class="appt-service">' + S.esc(entry.item.motivo || "Indisponível") + "</p>" +
              "</div>"
            );
          }
          const ev = entry.item;
          return (
            '<button type="button" class="appt-card type-' + T.typeOf(ev) + " st-" + S.esc(ev.status) + '" data-event-id="' + S.esc(ev.id) + '">' +
              '<div class="appt-card-top"><span class="appt-time tnum">' + S.esc(range) + "</span>" + S.typeBadge(ev) + "</div>" +
              '<div class="appt-card-main"><span class="appt-client">' + S.esc(T.eventTitle(ev)) + '</span><span class="appt-price tnum">' + S.esc(T.formatMoney(ev.valor)) + "</span></div>" +
            "</button>"
          );
        })
        .join("");

      const freeQuick = selWindows[0];

      el.innerHTML =
        '<div class="month-weekdays"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>' +
        '<div class="month-grid">' + cells + "</div>" +
        '<div class="month-preview-panel">' +
          '<div class="month-preview-head">' +
            "<strong>" + S.esc(selTitle) + "</strong>" +
            '<button type="button" class="btn btn-secondary btn-sm" data-open-day="' + S.esc(selectedKey) + '">Ver dia</button>' +
          "</div>" +
          (selListHtml || '<p class="appt-service">Nenhum atendimento neste dia.</p>') +
          '<button type="button" class="btn btn-primary btn-sm" data-slot-key="' + S.esc(selectedKey) + '" data-slot-start="' + S.esc(freeQuick ? freeQuick.startText : "") + '" data-slot-dur="120" data-slot-period="custom">' +
            I.get("plus") + "<span>Agendar neste dia</span>" +
          "</button>" +
        "</div>" +
        '<p class="month-hint">A barra colorida mostra a ocupação de 08h às 18h (sem duplicar serviços que passam do meio-dia). Toque em um dia para ver os detalhes.</p>';

      const handleCell = cell => {
        const key = cell.dataset.monthDay;
        const isMobile = root.matchMedia && root.matchMedia("(max-width: 640px)").matches;
        if (isMobile) {
          actions.onSelectDay && actions.onSelectDay(key);
        } else {
          actions.onOpenDay && actions.onOpenDay(key);
        }
      };

      el.querySelectorAll("[data-month-day]").forEach(cell => {
        cell.onclick = e => {
          const evChip = e.target.closest("[data-month-ev]");
          if (evChip) {
            e.stopPropagation();
            actions.onSelectEvent && actions.onSelectEvent(evChip.dataset.monthEv);
            return;
          }
          handleCell(cell);
        };
        cell.onkeydown = e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCell(cell);
          }
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
          btn.dataset.slotStart || "",
          Number(btn.dataset.slotDur) || 120,
          btn.dataset.slotPeriod
        );
      });
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
