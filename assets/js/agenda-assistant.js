const agendaAssistantForm = $("agendaAssistantForm");
const agendaAssistantButton = agendaAssistantForm.querySelector("button");
let agendaAssistantRequest = null;

function resetAgendaAssistant() {
  agendaAssistantRequest?.abort();
  agendaAssistantRequest = null;
  agendaAssistantForm.reset();
  agendaAssistantButton.disabled = false;
  $("agendaAnswer").textContent = "";
  $("agendaAssistant").open = false;
}

agendaAssistantForm.onsubmit = async event => {
  event.preventDefault();
  const question = $("agendaQuestion").value.trim();
  if (!question || agendaAssistantRequest) return;

  const request = new AbortController();
  agendaAssistantRequest = request;
  agendaAssistantButton.disabled = true;
  const answer = $("agendaAnswer");
  answer.textContent = "Consultando a Agenda…";
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
    }
  }
};
