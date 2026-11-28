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
    { label: "Horários livres amanhã", prompt: "Quais horários livres amanhã?" },
    { label: "Orçamentos em aberto", prompt: "Quais orçamentos estão em aberto ou faltam agendar?" },
    { label: "Clientes para chamar", prompt: "Quais clientes estão há mais de 6 meses sem atendimento?" },
    { label: "Faturamento do mês", prompt: "Quanto faturamos este mês?" },
    { label: "Quem está devendo", prompt: "Quais faxinas e apartamentos ainda não foram pagos?" }
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
          <p>Pergunte sobre agenda, clientes, orçamentos e faturamento, peça mensagens de WhatsApp ou peça para agendar por texto ou áudio.</p>
          <p id="agendaAssistantHelp">Nada é salvo nem enviado sem você tocar em confirmar ou abrir o WhatsApp.</p>
        </div>
      </div>
    </div>
    <div id="agendaQuickSuggestions" class="bez-suggestions" aria-label="Sugestões rápidas">${SUGGESTIONS.map((s, idx) =>
      `<button type="button" class="bez-sug-chip" data-bez-sug="${idx}">${esc(s.label)}</button>`
    ).join("")}</div>
    <form id="agendaAssistantForm" class="bez-composer">
      <div id="agendaTextRow" class="bez-input-row">
        <input id="agendaQuestion" class="bez-input" name="question" type="text" maxlength="600" autocomplete="off" placeholder="Pergunte ou peça algo…" aria-label="Pergunta ou pedido para o Assistente Bez" aria-describedby="agendaAssistantHelp">
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
    chatHistory = [];
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

  function renderAgendaList(bubble, listing) {
    const period = document.createElement("p");
    period.className = "bez-agenda-period";
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
    bubble.append(period, entries);
    if (typeof listing.note === "string" && listing.note) {
      const note = document.createElement("p");
      note.textContent = listing.note;
      bubble.append(note);
    }
    bubble.append(status);
  }

  function renderWhatsappLinks(bubble, links) {
    const list = document.createElement("div");
    list.className = "bez-wa-links";
    for (const link of links) {
      // Só links do WhatsApp montados pelo servidor viram botão.
      if (typeof link?.url !== "string" || !link.url.startsWith("https://wa.me/") || typeof link.label !== "string") continue;
      const anchor = document.createElement("a");
      anchor.className = "bez-action-card bez-wa-link";
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      const label = document.createElement("span");
      label.textContent = link.label;
      const action = document.createElement("span");
      action.className = "bez-action-cta";
      action.textContent = "Abrir";
      anchor.append(label, action);
      list.append(anchor);
    }
    if (list.childElementCount) bubble.append(list);
  }

  function renderAgendaAnswer(bubble, data) {
    const answerText = typeof data?.answer === "string" && data.answer ? data.answer : "Não foi possível concluir a consulta.";
    if (data?.bookingDraft) {
      renderBookingDraftCard(bubble, data.bookingDraft, answerText);
      if (Array.isArray(data.links) && data.links.length) renderWhatsappLinks(bubble, data.links);
      renderActionCards(bubble, data.acoes);
      return;
    }
    const text = document.createElement("p");
    text.textContent = answerText;
    bubble.replaceChildren(text);
    const listing = data?.agenda;
    if (typeof listing?.period === "string" && Array.isArray(listing.entries) && listing.entries.length) {
      renderAgendaList(bubble, listing);
    }
    if (Array.isArray(data?.links) && data.links.length) renderWhatsappLinks(bubble, data.links);
    renderActionCards(bubble, data?.acoes);
  }

  /* ---------- Cartões de ação (orçamento, agendar orçamento, bloqueio, concluir) ---------- */
  // O servidor só monta o cartão. Gravar acontece aqui, com a sessão da equipe,
  // pelos mesmos caminhos dos botões do painel, e só depois do toque em confirmar.

  const newId = () => typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
  const errorText = (error, fallback) => (error && error.message) || fallback;

  const REVIEW_STATUS = {
    already_requested: "O pedido de avaliação já tinha sido enviado a este cliente.",
    accepted_unrecorded: "A Meta aceitou o pedido de avaliação, mas o registro ficou pendente.",
    accepted: "Pedido de avaliação enviado."
  };

  const ACTION_EXECUTORS = {
    async bloqueio(payload) {
      const { error } = await panelSupabase.from("bloqueios_agenda")
        .insert({ inicio_em: payload.inicio_em, fim_em: payload.fim_em, motivo: payload.motivo || null });
      if (error) throw new Error(errorText(error, "Não foi possível bloquear."));
      return { message: "Horário bloqueado." };
    },

    async pagamento(payload) {
      const { data, error } = await panelSupabase.from("agendamentos").update({ status_pagamento: payload.status_pagamento })
        .eq("id", payload.agendamento_id).eq("status_pagamento", payload.anterior).select("id").maybeSingle();
      if (error) throw new Error(errorText(error, "Não foi possível marcar o pagamento."));
      if (!data) throw new Error("O pagamento mudou desde a pergunta. Abra a Agenda e confira.");
      const labels = { pago: "Pagamento marcado como pago.", parcial: "Pagamento marcado como pago em parte.", pendente: "Pagamento marcado como pendente." };
      return { message: labels[payload.status_pagamento] || "Pagamento atualizado.", appointmentId: payload.agendamento_id };
    },

    async concluir(payload) {
      const { data, error } = await panelSupabase.from("agendamentos").update({ status: "concluido" })
        .eq("id", payload.agendamento_id).eq("status", payload.status_atual).select("id").maybeSingle();
      if (error) throw new Error(errorText(error, "Não foi possível concluir."));
      if (!data) throw new Error("O atendimento mudou desde a pergunta. Abra a Agenda e confira.");
      let message = "Atendimento concluído.";
      if (payload.pedir_avaliacao && payload.cliente_id) {
        try {
          const { data: review, error: reviewError } = await panelSupabase.functions.invoke("pedir-avaliacao", {
            body: { clientId: payload.cliente_id, confirmed: true }
          });
          if (reviewError) {
            const detail = await reviewError.context?.json?.().catch(() => null);
            message += " " + (detail?.error || "O pedido de avaliação não foi confirmado: confira o WhatsApp antes de reenviar.");
          } else {
            message += " " + (REVIEW_STATUS[review?.status] || "O pedido de avaliação não foi confirmado.");
          }
        } catch {
          message += " O pedido de avaliação não foi confirmado: confira o WhatsApp antes de reenviar.";
        }
      }
      return { message, appointmentId: payload.agendamento_id };
    },

    async orcamento(payload) {
      let clienteId = payload.cliente_id;
      if (!clienteId && payload.novo_cliente) {
        const { data, error } = await panelSupabase.from("clientes").insert({
          nome: payload.novo_cliente.nome, telefone: payload.novo_cliente.telefone, endereco: payload.novo_cliente.endereco || null
        }).select("id").single();
        if (error) throw new Error(errorText(error, "Não foi possível cadastrar o cliente."));
        clienteId = data.id;
        payload.cliente_id = clienteId; // nova tentativa não duplica o cliente
      }
      const { data: quote, error } = await panelSupabase.from("orcamentos")
        .insert({ ...payload.orcamento, cliente_id: clienteId }).select("id").single();
      if (error) throw new Error(errorText(error, "Não foi possível criar o orçamento."));
      const { error: itemError } = await panelSupabase.from("orcamento_itens")
        .insert(payload.itens.map(item => ({ ...item, orcamento_id: quote.id })));
      if (itemError) {
        await panelSupabase.from("orcamentos").delete().eq("id", quote.id);
        throw new Error(errorText(itemError, "Não foi possível gravar os itens."));
      }
      return { message: "Orçamento criado como rascunho.", href: "./orcamentos.html", hrefLabel: "Ver orçamentos" };
    },

    async agendar_orcamento(payload) {
      let appointmentId;
      if (payload.campanha) {
        const { data, error } = await panelSupabase.rpc("campanha_agendar_orcamento", {
          p_orcamento_id: payload.orcamento_id, p_inicio: payload.inicio_em, p_fim: payload.fim_em, p_endereco: payload.endereco
        });
        if (error) throw new Error(errorText(error, "Não foi possível agendar."));
        appointmentId = typeof data === "string" ? data : data?.id || null;
      } else {
        payload.rascunho_id ||= newId(); // a mesma tentativa reaproveita o agendamento já salvo
        const { data, error } = await panelSupabase.rpc("agendamento_salvar_direto", {
          p_id: payload.rascunho_id,
          p_edicao: false,
          p_agendamento: {
            tipo: "estofados", cliente_id: payload.cliente_id, inicio_em: payload.inicio_em, fim_em: payload.fim_em,
            endereco: payload.endereco, descricao_servico: payload.descricao_servico, valor: payload.valor,
            observacoes: payload.observacoes, status: "confirmado"
          },
          p_itens: payload.itens,
          p_novo_cliente: null
        });
        if (error) throw new Error(errorText(error, "Não foi possível agendar."));
        appointmentId = typeof data === "string" && data ? data : payload.rascunho_id;
        const { error: quoteError } = await panelSupabase.from("orcamentos")
          .update({ status: "aprovado", agendamento_id: appointmentId, updated_at: new Date().toISOString() })
          .eq("id", payload.orcamento_id).is("agendamento_id", null);
        if (quoteError) return { message: "Agendado, mas não consegui marcar o orçamento como aprovado. Confira em Orçamentos.", appointmentId };
      }
      return { message: "Orçamento agendado.", appointmentId };
    }
  };

  function renderActionCard(msgEl, action) {
    if (!action || typeof action.tipo !== "string" || !ACTION_EXECUTORS[action.tipo] || !Array.isArray(action.linhas)) return;
    const card = document.createElement("div");
    card.className = "bez-draft-card bez-action-confirm";
    const head = document.createElement("div");
    head.className = "bez-draft-head";
    const title = document.createElement("span");
    title.className = "bez-draft-type";
    title.textContent = String(action.titulo || "Ação");
    head.append(title);
    const rows = document.createElement("div");
    rows.className = "bez-draft-rows";
    for (const line of action.linhas) {
      if (!Array.isArray(line)) continue;
      const row = document.createElement("div");
      row.className = "bez-draft-row";
      const key = document.createElement("span");
      key.className = "bez-draft-k";
      key.textContent = String(line[0] ?? "");
      const value = document.createElement("div");
      value.className = "bez-draft-v";
      String(line[1] ?? "").split("\n").forEach((part, idx) => {
        const el = document.createElement(idx === 0 ? "strong" : "div");
        el.textContent = part;
        value.append(el);
      });
      row.append(key, value);
      rows.append(row);
    }
    const warnings = document.createElement("div");
    warnings.className = "bez-draft-warning";
    warnings.setAttribute("role", "status");
    for (const text of Array.isArray(action.avisos) ? action.avisos : []) {
      const p = document.createElement("p");
      p.textContent = String(text);
      warnings.append(p);
    }
    const errorBox = document.createElement("p");
    errorBox.className = "bez-draft-error";
    errorBox.setAttribute("role", "alert");
    const buttons = document.createElement("div");
    buttons.className = "bez-draft-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "bez-draft-edit";
    cancel.textContent = "Cancelar";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "bez-draft-confirm";
    const confirmLabel = String(action.confirmar || "Confirmar");
    confirm.textContent = confirmLabel;
    buttons.append(cancel, confirm);
    card.append(head, rows, warnings, errorBox, buttons);
    msgEl.classList.add("has-draft");
    msgEl.append(card);

    const finish = (text, extra) => {
      const done = document.createElement("div");
      done.className = "bez-draft-saved";
      const p = document.createElement("p");
      p.textContent = text;
      done.append(p);
      if (extra) done.append(extra);
      buttons.replaceWith(done);
      errorBox.remove();
    };
    cancel.onclick = () => finish("Cancelado. Nada foi alterado.");
    let busy = false;
    confirm.onclick = async () => {
      if (busy) return;
      busy = true;
      confirm.disabled = cancel.disabled = true;
      confirm.textContent = "Salvando…";
      errorBox.textContent = "";
      try {
        const result = await ACTION_EXECUTORS[action.tipo](action.payload || {});
        let extra = null;
        if (result.appointmentId) {
          extra = document.createElement(onAgenda ? "button" : "a");
          extra.className = "bez-draft-open-btn";
          extra.textContent = "Ver atendimento";
          if (onAgenda) {
            extra.type = "button";
            const status = document.createElement("span");
            extra.onclick = () => openAssistantAppointment(result.appointmentId, extra, status);
          } else {
            extra.href = "./?atendimento=" + encodeURIComponent(result.appointmentId);
          }
        } else if (result.href) {
          extra = document.createElement("a");
          extra.className = "bez-draft-open-btn";
          extra.href = result.href;
          extra.textContent = result.hrefLabel || "Abrir";
        }
        finish("✅ " + result.message, extra);
        if (typeof toast === "function") toast(result.message);
        if (onAgenda && typeof loadAgenda === "function") loadAgenda();
      } catch (error) {
        errorBox.textContent = "❌ " + (error?.message || "Não foi possível concluir agora.");
        confirm.textContent = confirmLabel;
        confirm.disabled = cancel.disabled = false;
        busy = false;
      }
      scrollAgendaMessages();
    };
  }

  function renderActionCards(bubble, actions) {
    if (!Array.isArray(actions)) return;
    actions.slice(0, 5).forEach(action => renderActionCard(bubble.parentElement, action));
  }

  // Memória curta da conversa: só nesta aba, some ao recarregar ou sair.
  const MAX_HISTORY = 8;
  let chatHistory = [];
  function rememberTurn(userText, answerText) {
    if (typeof userText !== "string" || !userText.trim() || typeof answerText !== "string" || !answerText.trim()) return;
    chatHistory.push({ role: "user", content: userText.trim() }, { role: "assistant", content: answerText.trim() });
    chatHistory = chatHistory.slice(-MAX_HISTORY);
  }

  async function invokeAssistant(body, userText, thinkingText, voiceControls) {
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
      rememberTurn(voiceControls ? data?.transcript : userText, data?.answer);
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
    appendAgendaMessage(trimmed, true);
    agendaQuestion.value = "";
    agendaQuestion.focus({ preventScroll: true });
    void invokeAssistant({ question: trimmed, history: chatHistory }, trimmed, "Pensando…", null);
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
      formData.append("history", JSON.stringify(chatHistory));
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
