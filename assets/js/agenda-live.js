// Liga as visões da proposta às operações do controlador da Agenda.
function initializeAgendaChrome() {
  $("previousDay").innerHTML = BezIcons.get("arrowLeft");
  $("nextDay").innerHTML = BezIcons.get("arrowRight");
  $("mobileFabBtn").innerHTML = BezIcons.get("plus") + "<span>Novo</span>";
  $("legendBar").innerHTML = [
    ["estofados", "Estofados"], ["faxina", "Faxina avulsa"],
    ["apartamento", "Apartamento fixo"], ["bloqueio", "Bloqueado"]
  ].map(([type, label]) =>
    '<span class="legend-item"><span class="legend-badge type-' + type + '">' +
    BezIcons.typeIcon(type) + "</span>" + label + "</span>"
  ).join("") + '<span class="legend-item"><span class="legend-provisional" aria-hidden="true"></span>A confirmar</span>';

  const themeButton = $("themeToggleBtn");
  const updateThemeButton = theme => {
    const dark = theme === "dark";
    themeButton.innerHTML = BezIcons.get(dark ? "sun" : "moon");
    themeButton.setAttribute("aria-pressed", String(dark));
    themeButton.setAttribute("aria-label", dark ? "Ativar tema claro" : "Ativar tema escuro");
  };
  updateThemeButton(BezTheme.init());
  BezTheme.onChange(updateThemeButton);
  themeButton.onclick = () => BezTheme.toggleTheme();
}

function renderAgendaChrome(start, end) {
  $("rangeTitle").textContent = {
    day: BezTime.formatDayTitle,
    week: BezTime.formatWeekRange,
    month: BezTime.formatMonthTitle
  }[calendarMode](start, end);
  $("rangeSub").textContent = calendarMode === "day" && dateKey(currentDate) === dateKey(new Date()) ? "Hoje" : "";
  document.querySelectorAll("[data-view-mode]").forEach(button => {
    const active = button.dataset.viewMode === calendarMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function selectedAgendaDay() {
  return calendarMode === "month" ? selectedMonthDay || dateKey(currentDate) : dateKey(currentDate);
}

function openAgendaBlock() {
  $("blockForm").reset();
  $("blockDate").value = selectedAgendaDay();
  message("blockMessage", "");
  $("blockDialog").showModal();
}

function renderAgendaContent(start, state = "ready") {
  const UI = BezAgendaUI;
  const box = $("agendaContent");
  UI.SummaryHeader.render($("summaryContainer"), {
    mode: calendarMode, events: agendaEvents, loading: state === "loading", error: state === "error"
  }, {
    onSelectEvent: openDetails,
    onQuickWhatsApp: event => {
      const phone = event.clientes?.telefone || event.apartamentos?.contato_telefone;
      const url = UI.shared.whatsappUrl(phone, "Olá! Aqui é da Bez Clean, confirmando seu atendimento às " + time(event.inicio_em) + ".");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    onQuickMap: event => window.open(UI.shared.mapsUrl(event.endereco), "_blank", "noopener,noreferrer")
  });

  if (state === "loading") return UI.StateViews.renderLoading(box);
  if (state === "error") return UI.StateViews.renderError(box, {}, { onRetry: loadAgenda });
  if (calendarMode === "day" && !agendaEvents.length && !agendaBlocks.length) {
    return UI.StateViews.renderEmpty(box, { mode: calendarMode, dateLabel: $("rangeTitle").textContent }, {
      onNewAppointment: () => openNewAppointment(selectedAgendaDay()),
      onBlockTime: () => openAgendaBlock()
    });
  }

  const actions = {
    onSelectEvent: openDetails,
    onSelectSlot: openNewAppointment,
    onOpenDay: key => {
      currentDate = BezTime.parseLocalDate(key);
      setAgendaMode("day");
    },
    onSelectDay: key => {
      selectedMonthDay = key;
      renderAgendaContent(start);
      box.querySelector(".month-cell.is-selected")?.focus();
    }
  };
  const props = { events: agendaEvents, blocks: agendaBlocks, todayKey: dateKey(new Date()) };
  if (calendarMode === "day") {
    UI.DayView.render(box, { ...props, date: start }, actions);
  } else if (calendarMode === "week") {
    UI.WeekView.render(box, { ...props, startDate: start }, actions);
  } else {
    UI.MonthView.render(box, { ...props, monthDate: start, selectedDateKey: selectedAgendaDay() }, actions);
  }
}
