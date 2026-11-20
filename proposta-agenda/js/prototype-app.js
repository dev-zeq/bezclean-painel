(function (root) {
  "use strict";

  const T = root.BezTime;
  const Th = root.BezTheme;
  const I = root.BezIcons;
  const M = root.BezMockData;
  const MA = root.BezMockAssistant;
  const UI = root.BezAgendaUI;
  const S = UI.shared;

  function createWelcomeMessage() {
    return {
      id: "msg-welcome",
      role: "assistant",
      text: "Olá! Sou o Assistente Bez. Pergunte por texto ou voz sobre horários disponíveis, atendimentos por cidade ou a agenda de amanhã."
    };
  }

  const state = {
    mode: "day",            // "day" | "week" | "month"
    uiState: "ready",       // "ready" | "empty" | "loading" | "error"
    currentDate: new Date(M.DEMO_TODAY),
    selectedMonthDayKey: T.dateKey(M.DEMO_TODAY),
    events: M.createInitialEvents(),
    blocks: M.createInitialBlocks(),
    assistant: {
      isOpen: false,
      isThinking: false,
      voiceRecording: false,
      voiceSeconds: 0,
      selectedVoiceDraft: MA.VOICE_SAMPLES[0],
      messages: [createWelcomeMessage()]
    }
  };

  let toastTimer = null;
  let voiceTimer = null;
  let replyTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function showToast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function itemsInRange(start, end) {
    const events = state.events.filter(ev => {
      const s = new Date(ev.inicio_em);
      const e = new Date(ev.fim_em || ev.inicio_em);
      return T.overlaps(s, e, start, end);
    });
    const blocks = state.blocks.filter(b => {
      const s = new Date(b.inicio_em);
      const e = new Date(b.fim_em || b.inicio_em);
      return T.overlaps(s, e, start, end);
    });
    return { events: events, blocks: blocks };
  }

  function renderThemeButton() {
    const btn = $("themeToggleBtn");
    if (!btn || !Th) return;
    const isDark = Th.getTheme() === "dark";
    btn.setAttribute("aria-pressed", String(isDark));
    btn.setAttribute("aria-label", isDark ? "Alternar para tema claro" : "Alternar para tema escuro");
    btn.title = isDark ? "Mudar para tema claro" : "Mudar para tema escuro";
    btn.innerHTML =
      I.get(isDark ? "sun" : "moon") +
      '<span class="theme-toggle-label">' + (isDark ? "Tema claro" : "Tema escuro") + "</span>";
  }

  function renderStaticChrome() {
    $("blockTimeBtn").innerHTML = I.get("lock") + "<span>Bloquear horário</span>";
    $("newApptDesktopBtn").innerHTML = I.get("plus") + "<span>Novo agendamento</span>";
    $("mobileFabBtn").innerHTML = I.get("plus") + "<span>Novo</span>";
    $("prevBtn").innerHTML = I.get("arrowLeft");
    $("nextBtn").innerHTML = I.get("arrowRight");

    $("legendBar").innerHTML =
      '<span class="legend-item"><span class="legend-badge type-estofados">' + I.typeIcon("estofados") + "</span>Estofados</span>" +
      '<span class="legend-item"><span class="legend-badge type-faxina">' + I.typeIcon("faxina") + "</span>Faxina avulsa</span>" +
      '<span class="legend-item"><span class="legend-badge type-apartamento">' + I.typeIcon("apartamento") + "</span>Apartamento</span>" +
      '<span class="legend-item"><span class="legend-badge type-bloqueio pattern-blocked">' + I.typeIcon("bloqueio") + "</span>Bloqueado</span>" +
      '<span class="legend-item"><span class="legend-provisional" aria-hidden="true"></span>A confirmar</span>';

    $("mobileTabBar").innerHTML = [
      { label: "Agenda", icon: "calendar", active: true },
      { label: "Clientes", icon: "users", active: false },
      { label: "Orçamentos", icon: "fileText", active: false },
      { label: "Campanhas", icon: "megaphone", active: false },
      { label: "Mais", icon: "more", active: false }
    ].map(tab => (
      '<a href="#' + tab.label.toLowerCase() + '" class="mobile-tab' + (tab.active ? " is-active" : "") + '"' +
      (tab.active ? ' aria-current="page"' : ' data-stub-nav="' + S.esc(tab.label) + '"') + ">" +
      I.get(tab.icon) + "<span>" + S.esc(tab.label) + "</span></a>"
    )).join("");
  }

  function renderToolbar() {
    const { start, end } = T.viewRange(state.mode, state.currentDate);
    let title = "";
    let sub = "";
    const todayKey = T.dateKey(M.DEMO_TODAY);
    const curKey = T.dateKey(state.currentDate);

    if (state.mode === "day") {
      title = T.formatDayTitle(start);
      sub = curKey === todayKey ? "Hoje (referência da demonstração)" : "Visão diária detalhada";
    } else if (state.mode === "week") {
      title = T.formatWeekRange(start, end);
      sub = "Semana compartilhada · Dom a Sáb";
    } else {
      title = T.formatMonthTitle(start);
      sub = "Visão mensal";
    }

    $("rangeTitle").textContent = title;
    $("rangeSub").textContent = sub;

    document.querySelectorAll("[data-view-mode]").forEach(btn => {
      const active = btn.dataset.viewMode === state.mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    document.querySelectorAll("[data-demo-state]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.demoState === state.uiState);
    });
  }

  function openWhatsApp(ev) {
    const phone = (ev.clientes && ev.clientes.telefone) || (ev.apartamentos && ev.apartamentos.contato_telefone) || "";
    if (!phone) {
      showToast("Este atendimento não possui telefone cadastrado.");
      return;
    }
    const name = T.eventTitle(ev);
    const timeStr = T.hhmm(ev.inicio_em);
    const msg = "Olá " + name + "! Aqui é da Bez Clean, confirmando seu atendimento às " + timeStr + ".";
    const url = S.whatsappUrl(phone, msg);
    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Abrindo conversa no WhatsApp com " + name + ".");
  }

  function openMap(ev) {
    const addr = ev.endereco || (ev.clientes && ev.clientes.endereco) || (ev.apartamentos && ev.apartamentos.endereco) || "";
    if (!addr) {
      showToast("Endereço não informado.");
      return;
    }
    window.open(S.mapsUrl(addr), "_blank", "noopener,noreferrer");
    showToast("Abrindo endereço no Google Maps.");
  }

  function callPhone(ev) {
    const phone = (ev.clientes && ev.clientes.telefone) || (ev.apartamentos && ev.apartamentos.contato_telefone) || "";
    if (!phone) return;
    window.location.href = S.telUrl(phone);
  }

  function openEventDetails(eventId) {
    const ev = state.events.find(item => item.id === eventId);
    if (!ev) return;

    UI.DetailsSheet.open($("detailsDialog"), { appointment: ev }, {
      onEdit: target => openForm({ mode: "edit", appointment: target }),
      onUpdateStatus: (id, newStatus) => {
        const idx = state.events.findIndex(item => item.id === id);
        if (idx === -1) return;
        state.events[idx] = { ...state.events[idx], status: newStatus };
        const labels = {
          confirmado: "Atendimento confirmado!",
          concluido: "Atendimento marcado como concluído!",
          cancelado: "Atendimento cancelado. O horário voltou a ficar livre."
        };
        showToast(labels[newStatus] || "Status atualizado.");
        render();
      },
      onWhatsApp: openWhatsApp,
      onOpenMap: openMap,
      onCall: callPhone
    });
  }

  function openForm(opts) {
    const o = opts || {};
    UI.AppointmentForm.open(
      $("formDialog"),
      {
        mode: o.mode || "create",
        appointment: o.appointment || null,
        prefillDateKey: o.prefillDateKey != null ? o.prefillDateKey : T.dateKey(state.currentDate),
        prefillSlot: o.prefillSlot || null,
        simulateConflictDraft: Boolean(o.simulateConflictDraft),
        clients: M.CLIENTS,
        apartments: M.APARTMENTS,
        servicesCatalog: M.SERVICES_CATALOG,
        cleaningOptions: M.CLEANING_OPTIONS,
        existingEvents: state.events,
        existingBlocks: state.blocks
      },
      {
        onOpenConflictModal: (conflictProps, onForceSave, onApplySuggestion) => {
          UI.ConflictUI.openConfirmModal($("conflictDialog"), conflictProps, {
            onAdjust: () => {},
            onForceSave: onForceSave,
            onApplySuggestion: onApplySuggestion
          });
        },
        onSubmit: (payload, meta) => {
          if (payload.id) {
            const idx = state.events.findIndex(e => e.id === payload.id);
            if (idx !== -1) state.events[idx] = payload;
            showToast("Agendamento atualizado!");
          } else {
            const newId = "ev-" + Date.now();
            state.events.push({ ...payload, id: newId });
            showToast(meta && meta.forceOverlap
              ? "Agendamento salvo com aviso de sobreposição."
              : "Novo agendamento salvo!");
          }
          state.uiState = "ready";
          state.currentDate = new Date(payload.inicio_em);
          state.currentDate.setHours(0, 0, 0, 0);
          state.selectedMonthDayKey = T.dateKey(state.currentDate);
          render();
        }
      }
    );
  }

  function openBlockModal(prefillDateKey) {
    UI.BlockForm.open(
      $("blockDialog"),
      {
        defaultDateKey: prefillDateKey || T.dateKey(state.currentDate),
        existingEvents: state.events,
        existingBlocks: state.blocks
      },
      {
        onSave: blockPayload => {
          state.blocks.push({ id: "blk-" + Date.now(), ...blockPayload });
          state.uiState = "ready";
          showToast("Horário bloqueado na agenda.");
          render();
        }
      }
    );
  }

  function render() {
    renderToolbar();
    const { start, end } = T.viewRange(state.mode, state.currentDate);
    const summaryEl = $("summaryContainer");
    const agendaEl = $("agendaContainer");

    const rangeItems = state.uiState === "empty"
      ? { events: [], blocks: [] }
      : itemsInRange(start, end);

    UI.SummaryHeader.render(
      summaryEl,
      {
        mode: state.mode,
        events: rangeItems.events,
        now: M.DEMO_NOW,
        loading: state.uiState === "loading",
        error: state.uiState === "error"
      },
      {
        onSelectEvent: openEventDetails,
        onQuickWhatsApp: openWhatsApp,
        onQuickMap: openMap
      }
    );

    if (state.uiState === "loading") {
      UI.StateViews.renderLoading(agendaEl);
      return;
    }

    if (state.uiState === "error") {
      UI.StateViews.renderError(
        agendaEl,
        { errorMessage: "Não conseguimos atualizar a agenda agora. Confira sua conexão com a internet e tente novamente." },
        {
          onRetry: () => {
            state.uiState = "ready";
            showToast("Conexão restabelecida!");
            render();
          }
        }
      );
      return;
    }

    const activeInRange = rangeItems.events.filter(T.isActiveEvent);
    const hasNothing = activeInRange.length === 0 && rangeItems.blocks.length === 0;

    if (state.uiState === "empty" || (state.mode === "day" && hasNothing)) {
      UI.StateViews.renderEmpty(
        agendaEl,
        { mode: state.mode, dateLabel: $("rangeTitle").textContent },
        {
          onNewAppointment: () => openForm({ mode: "create" }),
          onBlockTime: () => openBlockModal()
        }
      );
      return;
    }

    const commonActions = {
      onSelectEvent: openEventDetails,
      onSelectSlot: (dateKey, startTime, durationMin) => {
        openForm({
          mode: "create",
          prefillDateKey: dateKey,
          prefillSlot: startTime ? { dateKey: dateKey, startTime: startTime, durationMin: durationMin } : null
        });
      },
      onOpenDay: dateKey => {
        state.currentDate = T.parseLocalDate(dateKey);
        state.selectedMonthDayKey = dateKey;
        state.mode = "day";
        render();
      },
      onSelectDay: dateKey => {
        state.selectedMonthDayKey = dateKey;
        render();
      }
    };

    if (state.mode === "day") {
      UI.DayView.render(
        agendaEl,
        { date: state.currentDate, events: rangeItems.events, blocks: rangeItems.blocks },
        commonActions
      );
    } else if (state.mode === "week") {
      UI.WeekView.render(
        agendaEl,
        { startDate: start, todayKey: T.dateKey(M.DEMO_TODAY), events: rangeItems.events, blocks: rangeItems.blocks },
        commonActions
      );
    } else {
      UI.MonthView.render(
        agendaEl,
        {
          monthDate: start,
          selectedDateKey: state.selectedMonthDayKey,
          todayKey: T.dateKey(M.DEMO_TODAY),
          events: rangeItems.events,
          blocks: rangeItems.blocks
        },
        commonActions
      );
    }

    renderAssistant();
  }

  function stopVoiceTimer() {
    clearInterval(voiceTimer);
    voiceTimer = null;
  }

  function sendAssistantQuery(text, viaVoice) {
    const clean = String(text || "").trim();
    if (!clean) return;
    stopVoiceTimer();
    clearTimeout(replyTimer);

    state.assistant.voiceRecording = false;
    state.assistant.voiceSeconds = 0;
    state.assistant.messages.push({
      id: "msg-u-" + Date.now(),
      role: "user",
      text: clean,
      viaVoice: Boolean(viaVoice)
    });
    state.assistant.isThinking = true;
    renderAssistant();

    replyTimer = setTimeout(() => {
      const reply = MA.answer(clean, {
        events: state.events,
        blocks: state.blocks,
        today: M.DEMO_TODAY,
        now: M.DEMO_NOW
      });
      state.assistant.isThinking = false;
      state.assistant.messages.push({
        id: "msg-a-" + Date.now(),
        role: "assistant",
        text: reply.text,
        actions: reply.actions || []
      });
      renderAssistant();
    }, 320);
  }

  function renderAssistant() {
    const rootEl = $("bezAssistantRoot");
    if (!rootEl || !UI.BezAssistant) return;

    UI.BezAssistant.render(
      rootEl,
      {
        isOpen: state.assistant.isOpen,
        messages: state.assistant.messages,
        suggestions: MA.SUGGESTIONS,
        voiceSamples: MA.VOICE_SAMPLES,
        selectedVoiceDraft: state.assistant.selectedVoiceDraft,
        isThinking: state.assistant.isThinking,
        voiceRecording: state.assistant.voiceRecording,
        voiceSeconds: state.assistant.voiceSeconds,
        futureNote: "Modo demonstração com dados fictícios. Criar agendamentos por voz entrará na próxima etapa."
      },
      {
        onToggleOpen: nextOpen => {
          state.assistant.isOpen = Boolean(nextOpen);
          if (!state.assistant.isOpen) {
            stopVoiceTimer();
            state.assistant.voiceRecording = false;
            state.assistant.voiceSeconds = 0;
          }
          renderAssistant();
          if (state.assistant.isOpen) {
            const inp = rootEl.querySelector("#bezTextInput");
            if (inp && root.matchMedia && !root.matchMedia("(max-width: 768px)").matches) {
              inp.focus();
            }
          }
        },
        onSendMessage: (txt, meta) => sendAssistantQuery(txt, meta && meta.viaVoice),
        onSelectSuggestion: prompt => sendAssistantQuery(prompt, false),
        onStartVoice: () => {
          stopVoiceTimer();
          state.assistant.voiceRecording = true;
          state.assistant.voiceSeconds = 0;
          renderAssistant();
          voiceTimer = setInterval(() => {
            state.assistant.voiceSeconds += 1;
            const clockEl = rootEl.querySelector(".bez-voice-top .tnum");
            if (clockEl) {
              const s = state.assistant.voiceSeconds;
              clockEl.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
            }
          }, 1000);
        },
        onCancelVoice: () => {
          stopVoiceTimer();
          state.assistant.voiceRecording = false;
          state.assistant.voiceSeconds = 0;
          renderAssistant();
        },
        onSelectVoiceSample: sample => {
          state.assistant.selectedVoiceDraft = sample;
        },
        onFinishVoice: transcript => sendAssistantQuery(transcript, true),
        onClearHistory: () => {
          clearTimeout(replyTimer);
          state.assistant.isThinking = false;
          state.assistant.messages = [createWelcomeMessage()];
          renderAssistant();
          showToast("Conversa reiniciada.");
        },
        onSelectEvent: eventId => {
          if (root.matchMedia && root.matchMedia("(max-width: 768px)").matches) {
            state.assistant.isOpen = false;
            renderAssistant();
          }
          openEventDetails(eventId);
        },
        onSelectSlot: (dateKey, startTime, durationMin) => {
          if (root.matchMedia && root.matchMedia("(max-width: 768px)").matches) {
            state.assistant.isOpen = false;
            renderAssistant();
          }
          openForm({
            mode: "create",
            prefillDateKey: dateKey,
            prefillSlot: { dateKey: dateKey, startTime: startTime, durationMin: durationMin }
          });
        },
        onOpenNewAppointment: () => {
          if (root.matchMedia && root.matchMedia("(max-width: 768px)").matches) {
            state.assistant.isOpen = false;
            renderAssistant();
          }
          openForm({ mode: "create" });
        }
      }
    );
  }

  function bindGlobalEvents() {
    document.querySelectorAll("[data-view-mode]").forEach(btn => {
      btn.onclick = () => {
        state.mode = btn.dataset.viewMode;
        render();
      };
    });

    $("prevBtn").onclick = () => {
      state.currentDate = T.shiftDate(state.mode, state.currentDate, -1);
      render();
    };

    $("nextBtn").onclick = () => {
      state.currentDate = T.shiftDate(state.mode, state.currentDate, 1);
      render();
    };

    $("todayBtn").onclick = () => {
      state.currentDate = new Date(M.DEMO_TODAY);
      state.selectedMonthDayKey = T.dateKey(M.DEMO_TODAY);
      render();
    };

    $("newApptDesktopBtn").onclick = () => openForm({ mode: "create" });
    $("mobileFabBtn").onclick = () => openForm({ mode: "create" });
    $("blockTimeBtn").onclick = () => openBlockModal();

    // Barra de demonstração
    $("demoToggleBtn").onclick = () => {
      const bar = $("demoBar");
      const expanded = bar.classList.toggle("is-expanded");
      $("demoToggleBtn").setAttribute("aria-expanded", String(expanded));
    };

    document.querySelectorAll("[data-demo-state]").forEach(btn => {
      btn.onclick = () => {
        state.uiState = btn.dataset.demoState;
        render();
      };
    });

    document.querySelectorAll("[data-demo-action]").forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.demoAction;
        if (act === "conflict") {
          state.uiState = "ready";
          state.mode = "day";
          state.currentDate = new Date(M.DEMO_TODAY);
          render();
          openForm({
            mode: "create",
            prefillDateKey: T.dateKey(M.DEMO_TODAY),
            simulateConflictDraft: true
          });
        } else if (act === "details") {
          openEventDetails("ev-202");
        } else if (act === "new") {
          openForm({ mode: "create" });
        } else if (act === "edit") {
          const target = state.events.find(e => e.id === "ev-202") || state.events[0];
          if (target) openForm({ mode: "edit", appointment: target });
        } else if (act === "block") {
          openBlockModal();
        } else if (act === "assistant") {
          state.assistant.isOpen = true;
          renderAssistant();
        } else if (act === "reset") {
          stopVoiceTimer();
          clearTimeout(replyTimer);
          state.events = M.createInitialEvents();
          state.blocks = M.createInitialBlocks();
          state.currentDate = new Date(M.DEMO_TODAY);
          state.selectedMonthDayKey = T.dateKey(M.DEMO_TODAY);
          state.mode = "day";
          state.uiState = "ready";
          state.assistant = {
            isOpen: false,
            isThinking: false,
            voiceRecording: false,
            voiceSeconds: 0,
            selectedVoiceDraft: MA.VOICE_SAMPLES[0],
            messages: [createWelcomeMessage()]
          };
          render();
          showToast("Dados fictícios restaurados.");
        }
      };
    });

    document.querySelectorAll("[data-stub-nav]").forEach(link => {
      link.onclick = e => {
        e.preventDefault();
        showToast("Nesta etapa, a proposta visual cobre apenas a tela de Agenda (" + link.dataset.stubNav + " segue o mesmo padrão).");
      };
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && state.assistant.isOpen) {
        const openDialog = document.querySelector("dialog[open]");
        if (!openDialog) {
          state.assistant.isOpen = false;
          stopVoiceTimer();
          state.assistant.voiceRecording = false;
          renderAssistant();
        }
      }
    });

    const themeBtn = $("themeToggleBtn");
    if (themeBtn && Th) {
      themeBtn.onclick = () => {
        const next = Th.toggleTheme();
        renderThemeButton();
        showToast(next === "dark" ? "Tema escuro ativado e salvo neste aparelho." : "Tema claro ativado e salvo neste aparelho.");
      };
    }
  }

  if (Th) Th.init();
  renderThemeButton();
  renderStaticChrome();
  bindGlobalEvents();
  render();
})(typeof globalThis !== "undefined" ? globalThis : this);
