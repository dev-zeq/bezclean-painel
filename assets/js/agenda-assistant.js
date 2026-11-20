(() => {
  const $ = id => document.getElementById(id);
  const onAgenda = Boolean($("agenda"));
  const widget = document.createElement("div");
  widget.id = "bezAssistantWidget";
  widget.hidden = true;
  widget.innerHTML = `  <button id="agendaAssistantLauncher" class="bez-fab" type="button" popovertarget="agendaAssistant" aria-expanded="false" aria-controls="agendaAssistant" aria-haspopup="dialog">
    <span id="agendaAssistantIcon" class="bez-fab-avatar" aria-hidden="true"></span>
    <span class="bez-fab-text">Assistente Bez</span>
  </button>
  <section id="agendaAssistant" class="bez-panel" popover="auto" role="dialog" aria-labelledby="agendaAssistantTitle">
    <header class="bez-head">
      <div class="bez-head-left">
        <span id="agendaAssistantAvatar" class="bez-head-avatar" aria-hidden="true"></span>
        <h2 id="agendaAssistantTitle">Assistente Bez</h2>
      </div>
      <button id="agendaAssistantClose" class="bez-icon-btn" type="button" aria-label="Fechar conversa" autofocus></button>
    </header>
    <div id="agendaMessages" class="bez-messages" role="log" aria-label="Mensagens da conversa" tabindex="0">
      <div class="bez-msg is-assistant">
        <div class="bez-bubble">
          <p>Pergunte sobre atendimentos, horários livres ou uma cidade ou bairro.</p>
          <p id="agendaAssistantHelp">O DeepSeek interpreta a pergunta. Evite incluir dados de clientes.</p>
        </div>
      </div>
    </div>
    <form id="agendaAssistantForm" class="bez-composer">
      <div class="bez-input-row">
        <input id="agendaQuestion" class="bez-input" name="question" type="text" maxlength="400" required autocomplete="off" placeholder="Qual a agenda de amanhã?" aria-label="Pergunta sobre a Agenda" aria-describedby="agendaAssistantHelp">
        <button id="agendaAssistantSend" class="bez-send-btn" type="submit" aria-label="Enviar mensagem"></button>
      </div>
    </form>
  </section>`;
  document.body.append(widget);
  const agendaAssistant = $("agendaAssistant");
  const agendaAssistantLauncher = $("agendaAssistantLauncher");
  const agendaAssistantClose = $("agendaAssistantClose");
  const agendaAssistantForm = $("agendaAssistantForm");
  const agendaAssistantButton = $("agendaAssistantSend");
  const agendaQuestion = $("agendaQuestion");
  const agendaMessages = $("agendaMessages");
  const agendaWelcome = agendaMessages.firstElementChild;
  const agendaControls = [...document.querySelectorAll("header.top, #agenda .agenda-actions, #agenda .agenda-toolbar")];
  const agendaAssistantMobile = window.matchMedia("(max-width: 768px)");
  let agendaAssistantRequest = null;
  let agendaAssistantDetailRequest = null;
  let agendaAssistantFrame = 0;

  $("agendaAssistantIcon").innerHTML = BezIcons.get("sparkles");
  $("agendaAssistantAvatar").innerHTML = BezIcons.get("sparkles");
  agendaAssistantClose.innerHTML = BezIcons.get("close");
  agendaAssistantButton.innerHTML = BezIcons.get("send");

  function fitAgendaAssistant() {
    if (!agendaAssistant.matches(":popover-open")) return;

    const viewport = window.visualViewport;
    const top = Math.max(0, viewport?.offsetTop ?? 0);
    const height = viewport?.height ?? window.innerHeight;
    const bottom = Math.max(0, window.innerHeight - height - top);
    const nearLatest = agendaMessages.scrollHeight - agendaMessages.clientHeight - agendaMessages.scrollTop <= 8;
    const style = agendaAssistant.style;
    style.setProperty("--chat-keyboard-inset", bottom + "px");
    style.setProperty("--chat-viewport-top", top + "px");
    style.setProperty("--chat-viewport-height", height + "px");
    style.removeProperty("--chat-panel-shift");
    style.removeProperty("--chat-space");

    const panel = agendaAssistant.getBoundingClientRect();
    const space = agendaAssistantMobile.matches ? null : findAgendaAssistantSpace(panel, top + 16, bottom < 60);
    if (space) {
      style.setProperty("--chat-panel-shift", panel.bottom - space.end + "px");
      style.setProperty("--chat-space", space.height + "px");
    }
    agendaAssistant.classList.toggle("is-compact", (space?.height ?? panel.height) < 190);
    if (nearLatest) scrollAgendaMessages();
  }

  function findAgendaAssistantSpace(panel, visibleTop, keepControlsVisible) {
    const slots = [];
    let start = visibleTop;
    if (keepControlsVisible) {
      const controls = agendaControls.map(control => control.getBoundingClientRect())
        .filter(rect => rect.bottom > visibleTop && rect.top < panel.bottom && rect.left < panel.right && rect.right > panel.left)
        .sort((a, b) => a.top - b.top);
      for (const rect of controls) {
        if (rect.top - 8 > start) slots.push({ end: rect.top - 8, height: rect.top - 8 - start });
        start = Math.max(start, rect.bottom + 8);
      }
    }
    if (panel.bottom > start) slots.push({ end: panel.bottom, height: panel.bottom - start });
    return slots.findLast(slot => slot.height >= 200) ||
      slots.reduce((largest, slot) => slot.height >= (largest?.height ?? 90) ? slot : largest, null);
  }

  function scheduleAgendaAssistantFit() {
    if (agendaAssistantFrame || !agendaAssistant.matches(":popover-open")) return;
    agendaAssistantFrame = requestAnimationFrame(() => {
      agendaAssistantFrame = 0;
      fitAgendaAssistant();
    });
  }

  function scrollAgendaMessages() {
    agendaMessages.scrollTop = agendaMessages.scrollHeight;
  }

  function closeAgendaAssistant() {
    agendaAssistant.hidePopover();
    agendaAssistantLauncher.focus({ preventScroll: true });
  }

  agendaAssistantClose.addEventListener("click", closeAgendaAssistant);
  agendaAssistant.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeAgendaAssistant();
  });
  window.visualViewport?.addEventListener("resize", scheduleAgendaAssistantFit);
  window.visualViewport?.addEventListener("scroll", scheduleAgendaAssistantFit);
  window.addEventListener("resize", scheduleAgendaAssistantFit);
  window.addEventListener("scroll", scheduleAgendaAssistantFit, { passive: true });
  const agendaAssistantLayout = new ResizeObserver(scheduleAgendaAssistantFit);
  agendaControls.forEach(control => agendaAssistantLayout.observe(control));
  if (onAgenda) agendaAssistantLayout.observe($("summaryContainer"));
  agendaAssistant.addEventListener("toggle", event => {
    const open = event.newState === "open";
    agendaAssistantLauncher.setAttribute("aria-expanded", String(open));
    agendaAssistantLauncher.classList.toggle("is-open", open);
    $("agendaAssistantIcon").innerHTML = BezIcons.get(open ? "close" : "sparkles");
    if (open) {
      fitAgendaAssistant();
      scrollAgendaMessages();
    } else {
      agendaAssistantDetailRequest?.abort();
    }
  });

  function resetAgendaAssistant() {
    agendaAssistantRequest?.abort();
    agendaAssistantDetailRequest?.abort();
    agendaAssistantRequest = null;
    agendaAssistantForm.reset();
    agendaAssistantButton.disabled = false;
    agendaMessages.replaceChildren(agendaWelcome);
    if (agendaAssistant.matches(":popover-open")) agendaAssistant.hidePopover();
  }

  function appendAgendaMessage(text, fromUser = false) {
    const message = document.createElement("div");
    message.className = "bez-msg " + (fromUser ? "is-user" : "is-assistant");
    const speaker = document.createElement("span");
    speaker.className = "sr-only";
    speaker.textContent = fromUser ? "Você" : "Assistente Bez";
    const bubble = document.createElement("div");
    bubble.className = "bez-bubble";
    bubble.textContent = text;
    message.append(speaker, bubble);
    agendaMessages.append(message);
    return bubble;
  }

  async function openAssistantAppointment(id, button, status) {
    agendaAssistantDetailRequest?.abort();
    const request = new AbortController();
    agendaAssistantDetailRequest = request;
    button.disabled = true;
    status.textContent = "";
    try {
      await openDetails(id, { signal: request.signal, onError: message => { status.textContent = message; } });
    } catch {
      if (!request.signal.aborted) status.textContent = "Não foi possível abrir o atendimento.";
    } finally {
      if (agendaAssistantDetailRequest === request) agendaAssistantDetailRequest = null;
      button.disabled = false;
    }
  }

  function renderAgendaAnswer(bubble, data) {
    const listing = data?.agenda;
    if (typeof listing?.period !== "string" || !Array.isArray(listing.entries) || !listing.entries.length) {
      bubble.textContent = typeof data?.answer === "string" ? data.answer : "Não foi possível concluir a consulta.";
      return;
    }

    const period = document.createElement("p");
    period.textContent = listing.period;
    const entries = document.createElement("ul");
    entries.className = "bez-agenda-results";
    const status = document.createElement("p");
    status.className = "bez-agenda-result-message";
    status.setAttribute("role", "status");
    for (const entry of listing.entries) {
      if (typeof entry?.label !== "string") continue;
      const row = document.createElement("li");
      if (typeof entry.appointmentId === "string" && entry.appointmentId) {
        const button = document.createElement(onAgenda ? "button" : "a");
        if (onAgenda) {
          button.type = "button";
          button.onclick = () => openAssistantAppointment(entry.appointmentId, button, status);
        } else {
          const target = new URL("./", location.href);
          target.searchParams.set("atendimento", entry.appointmentId);
          button.href = target.href;
        }
        button.className = "bez-action-card";
        const label = document.createElement("span");
        label.textContent = entry.label;
        const action = document.createElement("span");
        action.className = "bez-action-cta";
        action.textContent = "Abrir";
        button.append(label, action);
        row.append(button);
      } else {
        row.textContent = entry.label;
      }
      entries.append(row);
    }
    bubble.replaceChildren(period, entries);
    if (typeof listing.note === "string" && listing.note) {
      const note = document.createElement("p");
      note.textContent = listing.note;
      bubble.append(note);
    }
    bubble.append(status);
  }

  agendaAssistantForm.onsubmit = async event => {
    event.preventDefault();
    const question = agendaQuestion.value.trim();
    if (!question || agendaAssistantRequest) return;

    const request = new AbortController();
    agendaAssistantRequest = request;
    appendAgendaMessage(question, true);
    agendaQuestion.value = "";
    agendaQuestion.focus({ preventScroll: true });
    agendaAssistantButton.disabled = true;
    const answer = appendAgendaMessage("Consultando a Agenda…");
    scrollAgendaMessages();
    try {
      const { data, error } = await panelSupabase.functions.invoke("assistente-bez", { body: { question }, signal: request.signal });
      if (request.signal.aborted) return;
      if (error) {
        const response = error.context;
        if (response?.status === 429 || response?.status === 400 || response?.status === 401) {
          const result = await response.json().catch(() => ({}));
          if (!request.signal.aborted) answer.textContent = result.error || "Não foi possível concluir a consulta.";
        } else {
          answer.textContent = "O Assistente Bez está indisponível no momento. Tente mais tarde.";
        }
        return;
      }
      renderAgendaAnswer(answer, data);
    } catch {
      if (!request.signal.aborted) answer.textContent = "O Assistente Bez está indisponível no momento. Tente mais tarde.";
    } finally {
      if (agendaAssistantRequest === request) {
        agendaAssistantRequest = null;
        agendaAssistantButton.disabled = false;
        scrollAgendaMessages();
      }
    }
  };

  let owner = null;
  panelSupabase.auth.onAuthStateChange((_, session) => {
    const userId = session?.user.id || null;
    widget.hidden = !userId;
    if (owner === userId) return;
    owner = userId;
    resetAgendaAssistant();
  });
  })();
