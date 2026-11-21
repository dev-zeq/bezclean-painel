(() => {
  const $ = id => document.getElementById(id);
  const onAgenda = Boolean($("agenda"));
  const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = v => moneyFmt.format(Number(v) || 0);
  const esc = v => {
    const el = document.createElement("span");
    el.textContent = v == null ? "" : String(v);
    return el.innerHTML;
  };
  const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const isSofaName = name => /(^|[^a-z])sofas?([^a-z]|$)/.test(norm(name));
  const TYPE_LABELS = { estofados: "Estofados", faxina: "Faxina avulsa", apartamento: "Apartamento fixo" };
  const STATUS_LABELS = { confirmado: "Confirmado", provisorio: "A confirmar" };
  const SUGGESTIONS = [
    { label: "Agenda de hoje", prompt: "Qual a agenda de hoje?" },
    { label: "Horários livres hoje", prompt: "Quais horários livres hoje?" },
    { label: "Agenda de amanhã", prompt: "Qual a agenda de amanhã?" },
    { label: "Atendimentos em Itapema", prompt: "Quais atendimentos em Itapema?" }
  ];

  function formatSeconds(sec) {
    const total = Math.max(0, Math.floor(sec || 0));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return mm + ":" + ss;
  }

  function formatDraftWhen(draft) {
    if (!draft.data && !draft.hora_inicio) return "Não informado";
    const datePart = draft.data ? draft.data.split("-").reverse().join("/") : "Sem data";
    if (!draft.hora_inicio) return datePart + " · horário não informado";
    const endPart = draft.hora_fim ? "–" + draft.hora_fim : "";
    return datePart + " · " + draft.hora_inicio + endPart;
  }

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
          <p>Pergunte sobre horários e clientes por cidade, ou peça para agendar por texto ou áudio.</p>
          <p id="agendaAssistantHelp">No áudio, fale os serviços, nome do cliente, endereço, data e horário. Nada é salvo antes da sua confirmação.</p>
        </div>
      </div>
    </div>
    <div id="agendaQuickSuggestions" class="bez-suggestions" aria-label="Sugestões rápidas">${SUGGESTIONS.map((s, idx) =>
      `<button type="button" class="bez-sug-chip" data-bez-sug="${idx}">${esc(s.label)}</button>`
    ).join("")}</div>
    <form id="agendaAssistantForm" class="bez-composer">
      <div id="agendaTextRow" class="bez-input-row">
        <input id="agendaQuestion" class="bez-input" name="question" type="text" maxlength="600" autocomplete="off" placeholder="Pergunte ou peça para agendar…" aria-label="Pergunta ou pedido para a Agenda" aria-describedby="agendaAssistantHelp">
        <button id="agendaAssistantMic" class="bez-mic-btn" type="button" aria-label="Gravar áudio" title="Gravar áudio"></button>
        <button id="agendaAssistantSend" class="bez-send-btn" type="submit" aria-label="Enviar mensagem" title="Enviar"></button>
      </div>
      <div id="agendaVoiceBar" class="bez-voice-box" hidden>
        <div class="bez-voice-top">
          <div class="bez-voice-status">
            <span class="bez-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span id="agendaVoiceStatus">Gravando áudio…</span>
          </div>
          <strong id="agendaVoiceTimer" class="tnum bez-voice-timer">00:00 / 01:00</strong>
        </div>
        <div class="bez-voice-controls">
          <button id="agendaVoiceCancel" class="bez-voice-cancel-btn" type="button">Cancelar</button>
          <button id="agendaVoiceSend" class="bez-voice-send-btn" type="button"></button>
        </div>
      </div>
    </form>
  </section>`;
  document.body.append(widget);

  const agendaAssistant = $("agendaAssistant");
  const agendaAssistantLauncher = $("agendaAssistantLauncher");
  const agendaAssistantClose = $("agendaAssistantClose");
  const agendaAssistantForm = $("agendaAssistantForm");
  const agendaTextRow = $("agendaTextRow");
  const agendaAssistantMic = $("agendaAssistantMic");
  const agendaAssistantButton = $("agendaAssistantSend");
  const agendaQuestion = $("agendaQuestion");
  const agendaVoiceBar = $("agendaVoiceBar");
  const agendaVoiceTimer = $("agendaVoiceTimer");
  const agendaVoiceCancel = $("agendaVoiceCancel");
  const agendaVoiceSend = $("agendaVoiceSend");
  const agendaMessages = $("agendaMessages");
  const agendaQuickSuggestions = $("agendaQuickSuggestions");
  const agendaWelcome = agendaMessages.firstElementChild;
  const agendaControls = [...document.querySelectorAll("header.top, #agenda .agenda-actions, #agenda .agenda-toolbar")];
  const agendaAssistantMobile = window.matchMedia("(max-width: 768px)");

  let agendaAssistantRequest = null;
  let agendaAssistantDetailRequest = null;
  let agendaAssistantFrame = 0;
  let activeRecorder = null;
  let isRecording = false;
  let isProcessingAudio = false;

  $("agendaAssistantIcon").innerHTML = BezIcons.get("sparkles");
  $("agendaAssistantAvatar").innerHTML = BezIcons.get("sparkles");
  agendaAssistantClose.innerHTML = BezIcons.get("close");
  agendaAssistantMic.innerHTML = BezIcons.get("mic");
  agendaAssistantButton.innerHTML = BezIcons.get("send");
  agendaVoiceSend.innerHTML = BezIcons.get("send") + "<span>Enviar áudio</span>";

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
    const panelHeight = space?.height ?? panel.height;
    agendaAssistant.classList.toggle("is-compact", panelHeight < 190);
    agendaAssistant.classList.toggle("is-short", panelHeight < 360);
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

  function setVoiceUi(recording) {
    isRecording = recording;
    agendaTextRow.hidden = recording;
    agendaVoiceBar.hidden = !recording;
    if (recording) {
      agendaVoiceTimer.textContent = "00:00 / 01:00";
      agendaVoiceCancel.disabled = false;
      agendaVoiceSend.disabled = false;
    }
    scheduleAgendaAssistantFit();
  }

  function cancelActiveVoice() {
    if (activeRecorder) {
      try { activeRecorder.cancel(); } catch {}
      activeRecorder = null;
    }
    isProcessingAudio = false;
    setVoiceUi(false);
  }

  function setBusy(busy) {
    agendaAssistantButton.disabled = busy;
    agendaAssistantMic.disabled = busy;
  }

  function closeAgendaAssistant() {
    cancelActiveVoice();
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
      cancelActiveVoice();
      agendaAssistantDetailRequest?.abort();
    }
  });

  function resetAgendaAssistant() {
    cancelActiveVoice();
    agendaAssistantRequest?.abort();
    agendaAssistantDetailRequest?.abort();
    agendaAssistantRequest = null;
    agendaAssistantForm.reset();
    setBusy(false);
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

  function appendVoiceUserMessage() {
    const message = document.createElement("div");
    message.className = "bez-msg is-user";
    const speaker = document.createElement("span");
    speaker.className = "sr-only";
    speaker.textContent = "Você";
    const bubble = document.createElement("div");
    bubble.className = "bez-bubble";
    const tag = document.createElement("div");
    tag.className = "bez-voice-tag";
    tag.innerHTML = BezIcons.get("mic") + "<span>Áudio enviado</span>";
    const body = document.createElement("span");
    body.textContent = "Transcrevendo…";
    bubble.append(tag, body);
    message.append(speaker, bubble);
    agendaMessages.append(message);
    return {
      setTranscript(transcript) {
        if (typeof transcript === "string" && transcript.trim()) {
          tag.innerHTML = BezIcons.get("mic") + "<span>Áudio transcrito</span>";
          body.textContent = transcript.trim();
        } else {
          body.textContent = "Áudio enviado";
        }
      }
    };
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

  function renderBookingDraftCard(bubble, draft, answerText) {
    bubble.textContent = typeof answerText === "string" && answerText
      ? answerText
      : "Confira os dados do agendamento antes de salvar:";

    const msgEl = bubble.parentElement;
    msgEl.classList.add("has-draft");

    const draftId = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    const state = JSON.parse(JSON.stringify(draft));
    let saving = false;
    let savedId = null;

    const card = document.createElement("div");
    card.className = "bez-draft-card";
    msgEl.append(card);

    function canConfirmState() {
      const clientReady = state.tipo === "apartamento"
        ? Boolean(state.apartamento_id)
        : Boolean(state.cliente_id || (state.clientStatus === "new" && state.cliente_nome));
      const servicesReady = state.tipo === "estofados"
        ? Array.isArray(state.items) && state.items.length > 0 && state.items.every(it => Number.isFinite(it.valor_unitario) && it.valor_unitario >= 0)
        : Boolean(state.descricao_servico);
      const timeReady = Boolean(state.data && state.inicio_em && state.fim_em && Date.parse(state.fim_em) > Date.parse(state.inicio_em));
      return clientReady && servicesReady && timeReady;
    }

    function pendingMessages() {
      const notes = (state.warnings || []).filter(msg =>
        state.hasMissingPrices || !msg.startsWith("Alguns itens não foram encontrados com preço")
      );
      if (state.clientCandidates?.length && !state.cliente_id && state.clientStatus !== "new") {
        notes.unshift("Escolha abaixo qual cliente vincular ou crie um novo cadastro.");
      }
      if (state.apartmentCandidates?.length && !state.apartamento_id) {
        notes.unshift("Escolha abaixo qual apartamento deseja agendar.");
      }
      if (state.missingFields?.length) {
        notes.unshift("Falta definir: " + state.missingFields.join(", ") + ".");
      }
      return [...new Set(notes)];
    }

    function updateDraftTotalsInPlace() {
      const hasMissing = state.tipo === "estofados" && state.items.some(it => !Number.isFinite(it.valor_unitario) || it.valor_unitario < 0);
      state.hasMissingPrices = hasMissing;
      if (state.tipo === "estofados") {
        state.valor = !hasMissing && state.items.length
          ? Math.round(state.items.reduce((sum, it) => sum + (Number(it.valor_unitario) || 0) * (it.quantidade || 1), 0) * 100) / 100
          : null;
      }
      const totalEl = card.querySelector("[data-draft-total]");
      if (totalEl) totalEl.textContent = Number.isFinite(state.valor) ? money(state.valor) : "A definir";
      const warnBox = card.querySelector("[data-draft-warnings]");
      if (warnBox) {
        const pending = pendingMessages();
        warnBox.innerHTML = pending.map(msg => `<p>${esc(msg)}</p>`).join("");
      }
      const confirmBtn = card.querySelector("[data-draft-confirm]");
      if (confirmBtn) confirmBtn.disabled = saving || !canConfirmState();
    }

    function buildEditablePayload() {
      const clone = JSON.parse(JSON.stringify(state));
      if (clone.tipo === "estofados") {
        clone.descricao_servico = clone.items.map(it => (it.quantidade > 1 ? it.quantidade + "× " : "") + it.nome).join(" + ");
      }
      return clone;
    }

    function renderCard() {
      if (savedId) {
        const openBtn = onAgenda
          ? `<button type="button" class="bez-draft-open-btn" data-draft-open>Ver atendimento</button>`
          : `<a class="bez-draft-open-btn" href="./?atendimento=${encodeURIComponent(savedId)}">Ver atendimento</a>`;
        card.innerHTML =
          `<div class="bez-draft-saved">` +
            `<strong>${BezIcons.get("confirmado")}<span>Agendamento salvo!</span></strong>` +
            `<p>${esc(formatDraftWhen(state))} · ${esc(state.tipo === "apartamento" ? (state.apartamento_nome || "Apartamento") : (state.cliente_nome || "Cliente"))}</p>` +
            openBtn +
          `</div>`;
        const openTrigger = card.querySelector("[data-draft-open]");
        if (openTrigger) {
          openTrigger.onclick = () => {
            if (typeof openDetails === "function") {
              agendaAssistant.hidePopover();
              openDetails(savedId);
            }
          };
        }
        scrollAgendaMessages();
        return;
      }

      const targetLabel = state.tipo === "apartamento" ? "Apartamento" : "Cliente";
      let targetValue = "";
      let targetBadge = "";
      if (state.tipo === "apartamento") {
        targetValue = state.apartamento_nome || "Não identificado";
      } else if (state.clientCandidates?.length && !state.cliente_id && state.clientStatus !== "new") {
        targetValue = state.cliente_nome || "Selecione uma opção";
      } else {
        targetValue = state.cliente_nome || "Não informado";
        if (state.clientStatus === "new") {
          targetBadge = `<span class="bez-draft-badge is-new">Novo cliente</span>`;
        } else if (state.clientStatus === "existing") {
          targetBadge = `<span class="bez-draft-badge is-existing">Cadastrado</span>`;
        }
      }

      const targetSub = state.tipo !== "apartamento" && state.clientStatus !== "ambiguous" && state.cliente_nome
        ? `<small class="bez-draft-sub">${state.cliente_telefone ? esc(state.cliente_telefone) : "Sem WhatsApp — pode completar depois"}</small>`
        : "";

      const candidatesHtml = (state.tipo === "apartamento" && state.apartmentCandidates?.length)
        ? `<div class="bez-draft-candidates" role="group" aria-label="Escolha o apartamento">${state.apartmentCandidates.map((apt, idx) =>
            `<button type="button" class="bez-cand-chip${state.apartamento_id === apt.id ? " is-selected" : ""}" data-apt-cand="${idx}">${esc(apt.nome + (apt.edificio ? " · " + apt.edificio : ""))}</button>`
          ).join("")}</div>`
        : (state.tipo !== "apartamento" && state.clientCandidates?.length)
          ? `<div class="bez-draft-candidates" role="group" aria-label="Escolha o cliente">${state.clientCandidates.map((c, idx) =>
              `<button type="button" class="bez-cand-chip${(c.isNew ? state.clientStatus === "new" : state.cliente_id === c.id) ? " is-selected" : ""}" data-cli-cand="${idx}">${
                c.isNew ? "+ Novo: " + esc(c.nome) : esc(c.nome + (c.telefone ? " · " + c.telefone : ""))
              }</button>`
            ).join("")}</div>`
          : "";

      const itemsHtml = state.tipo === "estofados"
        ? (state.items?.length
            ? `<ul class="bez-draft-items">${state.items.map((item, idx) => {
                const qtyPrefix = item.quantidade > 1 ? item.quantidade + "× " : "";
                const needsInput = !item.matchedFromCatalog || !Number.isFinite(item.valor_unitario);
                const crossedHtml = item.valor_original && Number.isFinite(item.valor_unitario) && item.valor_original > item.valor_unitario
                  ? `<s>${esc(money(item.valor_original * item.quantidade))}</s> `
                  : "";
                const priceCell = needsInput
                  ? `<span class="bez-draft-price-col"><span class="bez-draft-crossed" data-item-crossed="${idx}">${crossedHtml}</span><label class="bez-draft-price-wrap"><span>R$</span><input type="number" min="0" step="0.01" inputmode="decimal" class="bez-draft-price-input" data-item-price="${idx}" placeholder="Valor" value="${Number.isFinite(item.valor_unitario) ? esc(item.valor_unitario) : ""}"></label></span>`
                  : `<span class="bez-draft-item-val">${crossedHtml}<strong>${esc(money(item.valor_total))}</strong></span>`;
                return `<li><span>${esc(qtyPrefix + item.nome)}</span>${priceCell}</li>`;
              }).join("")}</ul>`
            : `<p class="bez-draft-empty">Nenhum serviço identificado</p>`)
        : `<p class="bez-draft-service-line">${esc(state.descricao_servico || "Serviço a definir")}</p>`;

      const pending = pendingMessages();
      const warningsHtml = `<div class="bez-draft-warning" data-draft-warnings role="status">${pending.map(msg => `<p>${esc(msg)}</p>`).join("")}</div>`;

      const conflictsHtml = state.conflicts?.length
        ? `<div class="bez-draft-conflict" role="alert">` +
            `<strong>${BezIcons.get("alertTriangle")}<span>Conflito neste horário</span></strong>` +
            `<ul>${state.conflicts.map(c => `<li>${esc(c.label)}</li>`).join("")}</ul>` +
          `</div>`
        : "";

      const confirmLabel = saving
        ? "Salvando…"
        : (state.conflicts?.length ? "Agendar mesmo assim" : "Confirmar e agendar");

      card.innerHTML =
        `<div class="bez-draft-head">` +
          `<span class="bez-draft-type type-${esc(state.tipo)}">${esc(TYPE_LABELS[state.tipo] || "Atendimento")}</span>` +
          `<span class="bez-draft-status">${esc(STATUS_LABELS[state.status] || "Confirmado")}</span>` +
        `</div>` +
        `<div class="bez-draft-rows">` +
          `<div class="bez-draft-row"><span class="bez-draft-k">${esc(targetLabel)}</span><div class="bez-draft-v"><strong>${esc(targetValue)}</strong>${targetBadge}${targetSub}${candidatesHtml}</div></div>` +
          `<div class="bez-draft-row"><span class="bez-draft-k">Data e horário</span><div class="bez-draft-v"><strong>${esc(formatDraftWhen(state))}</strong></div></div>` +
          `<div class="bez-draft-row"><span class="bez-draft-k">Endereço</span><div class="bez-draft-v">${esc(state.endereco || "Não informado")}</div></div>` +
          `<div class="bez-draft-row is-services"><span class="bez-draft-k">Serviços</span><div class="bez-draft-v">${itemsHtml}</div></div>` +
          `<div class="bez-draft-row"><span class="bez-draft-k">Valor total</span><div class="bez-draft-v"><strong data-draft-total>${Number.isFinite(state.valor) ? esc(money(state.valor)) : "A definir"}</strong></div></div>` +
          (state.observacoes ? `<div class="bez-draft-row"><span class="bez-draft-k">Observações</span><div class="bez-draft-v">${esc(state.observacoes)}</div></div>` : "") +
        `</div>` +
        warningsHtml +
        conflictsHtml +
        `<p class="bez-draft-error" data-draft-error role="alert"></p>` +
        `<div class="bez-draft-actions">` +
          `<button type="button" class="bez-draft-edit" data-draft-edit>Editar no formulário</button>` +
          `<button type="button" class="bez-draft-confirm" data-draft-confirm ${saving || !canConfirmState() ? "disabled" : ""}>${esc(confirmLabel)}</button>` +
        `</div>`;

      card.querySelectorAll("[data-cli-cand]").forEach(btn => {
        btn.onclick = () => {
          const cand = state.clientCandidates[Number(btn.dataset.cliCand)];
          if (!cand) return;
          if (cand.isNew) {
            state.cliente_id = null;
            state.clientStatus = "new";
            state.cliente_nome = cand.nome;
            state.cliente_telefone = cand.telefone || "";
            state.newClient = { nome: cand.nome, telefone: cand.telefone || "" };
          } else {
            state.cliente_id = cand.id;
            state.clientStatus = "existing";
            state.cliente_nome = cand.nome;
            state.cliente_telefone = cand.telefone || "";
            state.newClient = null;
            if (!state.endereco && cand.endereco) state.endereco = cand.endereco;
          }
          renderCard();
        };
      });

      card.querySelectorAll("[data-apt-cand]").forEach(btn => {
        btn.onclick = () => {
          const apt = state.apartmentCandidates[Number(btn.dataset.aptCand)];
          if (!apt) return;
          state.apartamento_id = apt.id;
          state.apartamento_nome = apt.nome + (apt.edificio ? " · " + apt.edificio : "");
          if (!state.endereco && apt.endereco) state.endereco = apt.endereco;
          if (!draft.descricao_servico) {
            state.descricao_servico = apt.airbnb ? "Troca de hóspede (Airbnb)" : "Limpeza de saída (check-out)";
          }
          renderCard();
        };
      });

      card.querySelectorAll("[data-item-price]").forEach(input => {
        input.oninput = () => {
          const itemIdx = Number(input.dataset.itemPrice);
          const item = state.items[itemIdx];
          if (!item) return;
          const raw = input.value.trim();
          const num = raw === "" ? NaN : Number(raw);
          if (Number.isFinite(num) && num >= 0) {
            item.valor_unitario = Math.round(num * 100) / 100;
            item.valor_total = Math.round(item.valor_unitario * item.quantidade * 100) / 100;
            item.valor_original = state.offer40 && isSofaName(item.nome) && item.valor_unitario > 0
              ? Math.round((item.valor_unitario / 0.6) * 100) / 100
              : null;
          } else {
            item.valor_unitario = null;
            item.valor_total = null;
            item.valor_original = null;
          }
          const crossedEl = card.querySelector(`[data-item-crossed="${itemIdx}"]`);
          if (crossedEl) {
            crossedEl.innerHTML = item.valor_original && Number.isFinite(item.valor_unitario) && item.valor_original > item.valor_unitario
              ? `<s>${esc(money(item.valor_original * item.quantidade))}</s>`
              : "";
          }
          updateDraftTotalsInPlace();
        };
      });

      const editBtn = card.querySelector("[data-draft-edit]");
      editBtn.onclick = () => {
        const editable = buildEditablePayload();
        if (onAgenda && typeof window.openAppointmentFromDraft === "function") {
          agendaAssistant.hidePopover();
          window.openAppointmentFromDraft(editable);
        } else {
          try { sessionStorage.setItem("bez-assistant-draft", JSON.stringify(editable)); } catch {}
          location.href = "./?rascunho=1";
        }
      };

      const confirmBtn = card.querySelector("[data-draft-confirm]");
      confirmBtn.onclick = async () => {
        if (saving || !canConfirmState()) return;
        const errBox = card.querySelector("[data-draft-error]");
        errBox.textContent = "";
        saving = true;
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Salvando…";
        try {
          const editable = buildEditablePayload();
          const p_agendamento = {
            tipo: editable.tipo,
            cliente_id: editable.tipo === "apartamento" ? null : (editable.cliente_id || null),
            apartamento_id: editable.tipo === "apartamento" ? editable.apartamento_id : null,
            inicio_em: editable.inicio_em,
            fim_em: editable.fim_em,
            endereco: editable.endereco || null,
            descricao_servico: editable.descricao_servico,
            valor: Number.isFinite(editable.valor) ? editable.valor : 0,
            observacoes: editable.observacoes || null,
            status: editable.status || "confirmado"
          };
          const p_itens = editable.tipo === "estofados"
            ? editable.items.map(it => ({
                catalogo_preco_id: it.catalogo_preco_id || null,
                nome: it.nome,
                quantidade: it.quantidade,
                valor_unitario: Number(it.valor_unitario),
                valor_total: Math.round(Number(it.valor_unitario) * it.quantidade * 100) / 100,
                valor_original: it.valor_original && it.valor_original > it.valor_unitario ? it.valor_original : null,
                observacoes: it.observacoes || null
              }))
            : [];
          const p_novo_cliente = editable.tipo !== "apartamento" && !editable.cliente_id && editable.newClient
            ? { nome: editable.newClient.nome, telefone: editable.newClient.telefone || "" }
            : null;

          const { data: rpcId, error } = await panelSupabase.rpc("agendamento_salvar_direto", {
            p_id: draftId,
            p_edicao: false,
            p_agendamento,
            p_itens,
            p_novo_cliente
          });
          if (error) {
            saving = false;
            errBox.textContent = error.message || "Não foi possível salvar o agendamento.";
            confirmBtn.disabled = false;
            confirmBtn.textContent = state.conflicts?.length ? "Agendar mesmo assim" : "Confirmar e agendar";
            return;
          }
          savedId = typeof rpcId === "string" && rpcId ? rpcId : draftId;
          saving = false;
          renderCard();
          if (typeof toast === "function") toast("Agendamento criado com sucesso!");
          if (onAgenda) {
            if (typeof loadAgenda === "function") loadAgenda();
            if (typeof loadClients === "function") loadClients();
          }
        } catch {
          saving = false;
          errBox.textContent = "Não foi possível salvar o agendamento agora.";
          confirmBtn.disabled = false;
          confirmBtn.textContent = state.conflicts?.length ? "Agendar mesmo assim" : "Confirmar e agendar";
        }
      };

      scrollAgendaMessages();
    }

    renderCard();
  }

  function renderAgendaAnswer(bubble, data) {
    if (data?.bookingDraft) {
      renderBookingDraftCard(bubble, data.bookingDraft, data.answer);
      return;
    }

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

  async function invokeAssistant(body, userBubble, thinkingText, voiceControls) {
    const request = new AbortController();
    agendaAssistantRequest = request;
    setBusy(true);
    const answer = appendAgendaMessage(thinkingText);
    scrollAgendaMessages();
    try {
      const { data, error } = await panelSupabase.functions.invoke("assistente-bez", { body, signal: request.signal });
      if (request.signal.aborted) return;
      if (error) {
        if (voiceControls) voiceControls.setTranscript("");
        const response = error.context;
        if (response?.status === 429 || response?.status === 400 || response?.status === 401 || response?.status === 413) {
          const result = await response.json().catch(() => ({}));
          if (!request.signal.aborted) answer.textContent = result.error || "Não foi possível concluir a consulta.";
        } else {
          answer.textContent = "O Assistente Bez está indisponível no momento. Tente mais tarde.";
        }
        return;
      }
      if (voiceControls) voiceControls.setTranscript(data?.transcript);
      renderAgendaAnswer(answer, data);
    } catch {
      if (voiceControls) voiceControls.setTranscript("");
      if (!request.signal.aborted) answer.textContent = "O Assistente Bez está indisponível no momento. Tente mais tarde.";
    } finally {
      if (agendaAssistantRequest === request) {
        agendaAssistantRequest = null;
        setBusy(false);
        scrollAgendaMessages();
      }
    }
  }

  function submitTextQuestion(question) {
    const trimmed = String(question || "").trim();
    if (!trimmed || agendaAssistantRequest || isRecording) return;
    const bubble = appendAgendaMessage(trimmed, true);
    agendaQuestion.value = "";
    agendaQuestion.focus({ preventScroll: true });
    void invokeAssistant({ question: trimmed, allowScheduling: true }, bubble, "Consultando a Agenda…", null);
  }

  async function sendRecordedVoice() {
    if (!activeRecorder || isProcessingAudio) return;
    isProcessingAudio = true;
    agendaVoiceCancel.disabled = true;
    agendaVoiceSend.disabled = true;
    const recorder = activeRecorder;
    activeRecorder = null;
    try {
      const { blob } = await recorder.stop();
      setVoiceUi(false);
      isProcessingAudio = false;
      const voiceMsg = appendVoiceUserMessage();
      scrollAgendaMessages();
      const formData = new FormData();
      formData.append("audio", blob, "audio.wav");
      await invokeAssistant(formData, null, "Transcrevendo áudio…", voiceMsg);
    } catch (err) {
      isProcessingAudio = false;
      setVoiceUi(false);
      appendAgendaMessage(err?.message || "Não foi possível processar o áudio gravado.");
      scrollAgendaMessages();
    }
  }

  agendaAssistantMic.onclick = async () => {
    if (agendaAssistantRequest || isRecording || isProcessingAudio) return;
    if (typeof BezAssistantAudio === "undefined") {
      appendAgendaMessage("Gravação de áudio indisponível neste navegador.");
      scrollAgendaMessages();
      return;
    }
    const recorder = BezAssistantAudio.createRecorder({
      maxSeconds: 60,
      onTick: seconds => {
        agendaVoiceTimer.textContent = formatSeconds(seconds) + " / 01:00";
      },
      onMaxReached: () => {
        void sendRecordedVoice();
      }
    });
    activeRecorder = recorder;
    setVoiceUi(true);
    try {
      await recorder.start();
    } catch (err) {
      if (activeRecorder === recorder) activeRecorder = null;
      setVoiceUi(false);
      const name = err?.name || "";
      const friendly = (name === "NotAllowedError" || name === "PermissionDeniedError")
        ? "Permissão de microfone negada. Libere o acesso ao microfone nos ajustes do navegador para gravar áudios."
        : name === "NotFoundError"
          ? "Nenhum microfone foi encontrado neste aparelho."
          : (err?.message || "Não foi possível iniciar a gravação de áudio.");
      appendAgendaMessage(friendly);
      scrollAgendaMessages();
    }
  };

  agendaVoiceCancel.onclick = () => {
    cancelActiveVoice();
  };

  agendaVoiceSend.onclick = () => {
    void sendRecordedVoice();
  };

  agendaQuickSuggestions.querySelectorAll("[data-bez-sug]").forEach(btn => {
    btn.onclick = () => {
      const suggestion = SUGGESTIONS[Number(btn.dataset.bezSug)];
      if (suggestion) submitTextQuestion(suggestion.prompt);
    };
  });

  agendaAssistantForm.onsubmit = event => {
    event.preventDefault();
    submitTextQuestion(agendaQuestion.value);
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
