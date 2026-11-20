const agendaAssistant = $("agendaAssistant");
const agendaAssistantLauncher = $("agendaAssistantLauncher");
const agendaAssistantClose = $("agendaAssistantClose");
const agendaAssistantForm = $("agendaAssistantForm");
const agendaAssistantButton = $("agendaAssistantSend");
const agendaQuestion = $("agendaQuestion");
const agendaMessages = $("agendaMessages");
const agendaWelcome = agendaMessages.firstElementChild;
const agendaControls = [...document.querySelectorAll("#panelView .top, #agenda .agenda-actions, #agenda .agenda-toolbar")];
const agendaAssistantMobile = window.matchMedia("(max-width: 768px)");
let agendaAssistantRequest = null;
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
agendaAssistantLayout.observe($("summaryContainer"));
agendaAssistant.addEventListener("toggle", event => {
  const open = event.newState === "open";
  agendaAssistantLauncher.setAttribute("aria-expanded", String(open));
  agendaAssistantLauncher.classList.toggle("is-open", open);
  $("agendaAssistantIcon").innerHTML = BezIcons.get(open ? "close" : "sparkles");
  if (open) {
    fitAgendaAssistant();
    scrollAgendaMessages();
  }
});

function resetAgendaAssistant() {
  agendaAssistantRequest?.abort();
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
  const bubble = document.createElement("p");
  bubble.className = "bez-bubble";
  bubble.textContent = text;
  message.append(speaker, bubble);
  agendaMessages.append(message);
  return bubble;
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
    const { data, error } = await db.functions.invoke("assistente-bez", { body: { question }, signal: request.signal });
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
    answer.textContent = typeof data?.answer === "string" ? data.answer : "Não foi possível concluir a consulta.";
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
