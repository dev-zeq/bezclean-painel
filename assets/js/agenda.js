// Agenda unificada: visões de mês, semana e dia, formulário por tipo de atendimento,
// cadastro de apartamentos e aviso de conflito. Carregado depois de app.js e usa os
// utilitários de lá (db, $, esc, money, toast, message, currentDate, calendarMode, selectedItems…).
// As regras (períodos, disponibilidade, conflitos) ficam em agenda-core.js.

const Core = AgendaCore;
let agendaEvents = [], agendaBlocks = [], apartments = [], appointmentType = "estofados", agendaRequest = 0, selectedMonthDay = null, conflictTimer = null, keepApartmentId = null;

/* ---------- Visões ---------- */

function initialAgendaMode() {
  try { const saved = localStorage.getItem("bz-agenda-modo"); if (["month", "week", "day"].includes(saved)) return saved; } catch (error) {}
  return window.matchMedia("(max-width:640px)").matches ? "week" : "month";
}

function setAgendaMode(mode) {
  calendarMode = mode;
  try { localStorage.setItem("bz-agenda-modo", mode); } catch (error) {}
  selectedMonthDay = dateKey(currentDate);
  loadAgenda();
}

async function loadAgenda() {
  const request = ++agendaRequest, { start, end } = Core.viewRange(calendarMode, currentDate);
  renderAgendaChrome(start, end);
  renderAgendaContent(start, "loading");

  try {
    const [events, blocks] = await Promise.all([
      db.from("agendamentos").select("id,tipo,status,inicio_em,fim_em,descricao_servico,valor,endereco,cidade,bairro,lembrete_caminho_modo,lembrete_caminho_novo_horario,lembrete_caminho_observacao,lembrete_caminho_status,lembrete_caminho_enviado_em,clientes(nome,telefone),apartamentos(nome,edificio,airbnb,contato_telefone)").is("excluido_em", null).lt("inicio_em", end.toISOString()).gt("fim_em", start.toISOString()).order("inicio_em"),
      db.from("bloqueios_agenda").select("id,inicio_em,fim_em,motivo").lt("inicio_em", end.toISOString()).gt("fim_em", start.toISOString()).order("inicio_em")
    ]);
    if (request !== agendaRequest) return;
    if (events.error || blocks.error) throw Error("Não foi possível carregar a agenda.");
    agendaEvents = events.data || [];
    agendaBlocks = blocks.data || [];
    renderAgendaContent(start);
  } catch (error) {
    if (request !== agendaRequest) return;
    agendaEvents = [];
    agendaBlocks = [];
    renderAgendaContent(start, "error");
  }
}

const airbnbTag = event => Core.isAirbnb(event) ? ' <b class="airbnb-tag">Airbnb</b>' : "";

/* ---------- Detalhes ---------- */

async function openDetails(id, { signal, onError = toast } = {}) {
  const user = agendaUserId;
  const query = db.from("agendamentos").select("*,clientes(nome,telefone,endereco,arquivado_em),apartamentos(nome,edificio,endereco,contato_nome,contato_telefone,airbnb),agendamento_itens(*)")
    .eq("id", id).is("excluido_em", null);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query.single();
  if (user !== agendaUserId || signal?.aborted) return;
  if (error || !data) { onError("Não foi possível abrir o atendimento. Ele pode ter sido removido da Agenda."); return; }
  currentAppointment = data;
  const type = Core.typeOf(data), start = new Date(data.inicio_em), contact = data.apartamentos && [data.apartamentos.contato_nome, data.apartamentos.contato_telefone].filter(Boolean).join(" · ");
  $("detailsTitle").textContent = Core.title(data);
  $("detailsContent").innerHTML =
    '<p><span class="type-tag ev-' + type + '">' + Core.TYPES[type].short + '</span>' + airbnbTag(data) + ' <span class="status ' + data.status + '">' + (Core.STATUS[data.status] || data.status) + "</span></p>" +
    "<p><b>" + time(data.inicio_em) + "–" + time(data.fim_em) + "</b> · " + new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(start) + "</p>" +
    (data.apartamentos && data.apartamentos.edificio ? "<p>" + esc(data.apartamentos.edificio) + "</p>" : "") +
    "<p>" + esc(data.descricao_servico) + "</p>" +
    (data.agendamento_itens.length ? "<ul>" + data.agendamento_itens.map(item => "<li>" + (item.quantidade > 1 ? item.quantidade + "× " : "") + esc(item.nome) + " — " + appointmentLineAmount(item, item.valor_total) + "</li>").join("") + "</ul>" : "") +
    (+data.valor ? "<p><b>Total: " + money(data.valor) + "</b></p>" : "") +
    "<p>" + esc(data.endereco || "Endereço não informado") + "</p>" +
    (contact ? "<p>Contato: " + esc(contact) + "</p>" : "") +
    (data.observacoes ? "<p>" + esc(data.observacoes) + "</p>" : "");
  $("confirmBtn").hidden = data.status !== "provisorio";
  renderAppointmentReview(data);
  $("cancelBtn").hidden = data.status === "cancelado";
  const block = ManageCore.appointmentBlock(data);
  $("appointmentMenu").innerHTML = block ? "" : Manage.menu([{ id: "delete", icon: "🗑️", label: "Excluir atendimento (teste)", danger: true }]);
  Manage.bindMenu($("appointmentMenu"), { delete: deleteAppointment });
  if (block) $("detailsContent").insertAdjacentHTML("beforeend", '<p class="trash-note">' + esc(block) + "</p>");
  renderWayNoticeBox(data);
  $("detailsDialog").showModal();
}

function reviewClient(appointment) {
  const client = appointment?.clientes;
  if (appointment?.status !== "concluido" || !appointment.cliente_id || !client?.telefone ||
      ManageCore.isArchived(client)) return null;
  return { ...client, id: appointment.cliente_id };
}

function renderAppointmentReview(appointment) {
  const completed = appointment.status === "concluido";
  $("completeBtn").hidden = completed || appointment.status === "cancelado";
  $("appointmentReviewBtn").hidden = !reviewClient(appointment);
  $("appointmentReviewStatus").textContent = "";
}

$("appointmentReviewBtn").onclick = () => {
  const client = reviewClient(currentAppointment);
  if (client) return Manage.requestReview(db, client, $("appointmentReviewBtn"), $("appointmentReviewStatus"));
};

/* ---------- Aviso a caminho / Atraso ---------- */

function renderWayNoticeBox(appointment) {
  const box = $("wayNoticeBox");
  if (!box) return;
  if (!Core.canUseWayNotice(appointment)) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  const badge = Core.wayNoticeBadge(appointment);
  const mode = appointment.lembrete_caminho_modo || "automatico";
  const showPause = mode === "automatico" || mode === "atraso";
  const showAuto = mode === "pausado" || mode === "atraso";

  box.classList.remove("hidden");
  box.innerHTML =
    '<div class="way-notice-head">' +
      "<strong>Aviso a caminho</strong>" +
      '<span class="way-badge is-' + esc(badge.tone) + '">' + esc(badge.text) + "</span>" +
    "</div>" +
    (badge.observation ? '<p class="way-notice-obs">' + esc(badge.observation) + "</p>" : "") +
    '<div class="way-notice-actions">' +
      '<button type="button" id="wayDelayBtn" class="secondary way-action-btn">Avisar atraso</button>' +
      (showPause ? '<button type="button" id="wayPauseBtn" class="secondary way-action-btn">Pausar aviso</button>' : "") +
      (showAuto ? '<button type="button" id="wayAutoBtn" class="secondary way-action-btn">Voltar p/ automático</button>' : "") +
    "</div>";

  $("wayDelayBtn").onclick = () => openDelayNoticeDialog(currentAppointment);
  if (showPause) $("wayPauseBtn").onclick = () => saveWayNotice("pausado");
  if (showAuto) $("wayAutoBtn").onclick = () => saveWayNotice("automatico");
}

function syncDelayShortcutHighlight() {
  const selected = $("delayNewTime").value;
  document.querySelectorAll("#delayQuickOptions [data-delay-min]").forEach(btn => {
    const match = btn.dataset.delayTime === selected;
    btn.classList.toggle("is-selected", match);
    btn.setAttribute("aria-pressed", String(match));
  });
}

function openDelayNoticeDialog(appointment) {
  if (!appointment) return;
  message("delayNoticeMessage", "");
  $("delayOriginalTime").textContent = "Horário original: " + time(appointment.inicio_em);
  document.querySelectorAll("#delayQuickOptions [data-delay-min]").forEach(btn => {
    const targetTime = Core.addMinutesToTime(appointment.inicio_em, Number(btn.dataset.delayMin));
    btn.dataset.delayTime = targetTime;
    btn.title = "Previsto: " + targetTime;
  });
  const currentDelay = appointment.lembrete_caminho_modo === "atraso" && appointment.lembrete_caminho_novo_horario
    ? appointment.lembrete_caminho_novo_horario
    : Core.addMinutesToTime(appointment.inicio_em, 15);
  $("delayNewTime").value = currentDelay;
  $("delayObservation").value = appointment.lembrete_caminho_modo === "atraso" ? (appointment.lembrete_caminho_observacao || "") : "";
  syncDelayShortcutHighlight();
  $("delayNoticeDialog").showModal();
}

async function saveWayNotice(action, options = {}) {
  if (!currentAppointment) return false;
  let payload;
  try {
    payload = Core.buildWayNoticePayload(action, options);
  } catch (err) {
    if (action === "atraso") message("delayNoticeMessage", err.message);
    else toast(err.message);
    return false;
  }

  const buttons = [$("wayDelayBtn"), $("wayPauseBtn"), $("wayAutoBtn"), $("saveDelayNoticeBtn")].filter(Boolean);
  buttons.forEach(btn => { btn.disabled = true; });
  try {
    const { error } = await db.from("agendamentos").update(payload).eq("id", currentAppointment.id);
    if (error) {
      const msg = ManageCore.friendlyError(error, "Não foi possível atualizar o aviso a caminho.");
      if (action === "atraso") message("delayNoticeMessage", msg);
      else toast(msg);
      return false;
    }
    Object.assign(currentAppointment, payload);
    renderWayNoticeBox(currentAppointment);
    toast(
      action === "atraso"
        ? "Aviso de atraso salvo."
        : action === "pausado"
          ? "Aviso a caminho pausado."
          : "Aviso voltou para automático."
    );
    loadAgenda();
    return true;
  } finally {
    buttons.forEach(btn => { btn.disabled = false; });
  }
}

/* ---------- Formulário ---------- */

function setAppointmentType(type) {
  appointmentType = Core.TYPES[type] ? type : "estofados";
  document.querySelectorAll("#typeToggle [data-type]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.type === appointmentType)));
  $("clientSection").classList.toggle("hidden", appointmentType === "apartamento");
  $("apartmentSection").classList.toggle("hidden", appointmentType !== "apartamento");
  $("servicesSection").classList.toggle("hidden", appointmentType !== "estofados");
  $("selectedServices").querySelectorAll("input").forEach(input => { input.disabled = appointmentType !== "estofados"; });
  $("cleaningTypeField").classList.toggle("hidden", appointmentType === "estofados");
  $("cleaningTypeOptions").innerHTML = (Core.CLEANING_TYPES[appointmentType] || []).concat(appointmentType === "apartamento" ? [Core.AIRBNB_CLEANING] : []).map(option => '<option value="' + option + '">').join("");
  $("appointmentValueHint").textContent = appointmentType === "estofados" ? "ajustável" : "opcional";
  if (appointmentType !== "estofados" && !$("cleaningType").value) $("cleaningType").value = Core.CLEANING_TYPES[appointmentType][0];
}

function updatePeriodFields() {
  const custom = $("periodSelect").value === "custom";
  $("timeField").classList.toggle("hidden", !custom);
  $("durationField").classList.toggle("hidden", !custom);
}

function currentRange() {
  const date = $("appointmentDate").value, period = $("periodSelect").value;
  if (!date || (period === "custom" && (!$("appointmentTime").value || !(+$("duration").value >= 30)))) return null;
  return Core.range(date, period, $("appointmentTime").value, +$("duration").value);
}

function scheduleConflictCheck() {
  clearTimeout(conflictTimer);
  conflictTimer = setTimeout(async () => {
    const range = currentRange(), note = $("conflictNote");
    if (!range) { note.classList.add("hidden"); return; }
    try {
      const list = await Core.findConflicts(db, range.start, range.end, $("appointmentId").value || null);
      note.classList.toggle("hidden", !list.length);
      note.textContent = list.length ? "⚠️ Já existe compromisso neste horário:\n" + list.map(item => "• " + item.label).join("\n") : "";
    } catch (error) { note.classList.add("hidden"); }
  }, 250);
}

// Chamado por resetForm() em app.js.
function resetAgendaFields() {
  keepApartmentId = null;
  $("cleaningType").value = "";
  setAppointmentType("estofados");
  renderApartmentOptions();
  $("apartmentSelect").value = "";
  $("periodSelect").value = "custom";
  $("statusSelect").innerHTML = '<option value="confirmado">Confirmado</option><option value="provisorio">Provisório (a confirmar)</option>';
  $("statusSelect").value = "confirmado";
  $("conflictNote").classList.add("hidden");
  $("appointmentTitle").textContent = "Novo agendamento";
  updatePeriodFields();
}

// Chamado ao editar um agendamento (app.js), depois de preencher os campos comuns.
function fillAgendaFields(appointment) {
  const type = Core.typeOf(appointment), start = new Date(appointment.inicio_em), end = new Date(appointment.fim_em);
  keepApartmentId = appointment.apartamento_id;
  renderApartmentOptions();
  $("apartmentSelect").value = appointment.apartamento_id || "";
  $("cleaningType").value = type === "estofados" ? "" : appointment.descricao_servico || "";
  setAppointmentType(type);
  $("periodSelect").value = Core.periodOf(Core.hhmm(start), Core.hhmm(end));
  if (!["confirmado", "provisorio"].includes(appointment.status)) $("statusSelect").insertAdjacentHTML("afterbegin", '<option value="' + appointment.status + '">' + (Core.STATUS[appointment.status] || appointment.status) + "</option>");
  $("statusSelect").value = appointment.status;
  $("appointmentTitle").textContent = "Editar agendamento";
  updatePeriodFields();
  scheduleConflictCheck();
}

function openNewAppointment(key, startTime, duration) {
  resetForm();
  if (key) $("appointmentDate").value = key;
  if (startTime) {
    $("appointmentTime").value = startTime;
    $("duration").value = Math.max(30, Math.floor(duration / 30) * 30);
  }
  updatePeriodFields();
  scheduleConflictCheck();
  $("appointmentDialog").showModal();
}

function openAppointmentFromDraft(draft) {
  if (!draft || typeof draft !== "object") return;
  resetForm();
  const type = Core.TYPES[draft.tipo] ? draft.tipo : "estofados";
  setAppointmentType(type);

  if (type === "apartamento") {
    $("apartmentSelect").value = draft.apartamento_id || "";
    $("cleaningType").value = draft.descricao_servico || "";
  } else {
    if (draft.cliente_id) {
      keepClientId = draft.cliente_id;
      renderClientOptions();
      $("clientSelect").value = draft.cliente_id;
      toggleNewClient(false);
    } else if (draft.cliente_nome) {
      toggleNewClient(true);
      $("clientName").value = draft.cliente_nome;
      $("clientPhone").value = draft.cliente_telefone || "";
    } else {
      toggleNewClient(false);
    }
    if (type === "faxina") $("cleaningType").value = draft.descricao_servico || "";
  }

  $("appointmentOffer").checked = draft.offer40 !== false;
  if (type === "estofados" && Array.isArray(draft.items) && draft.items.length) {
    selectedItems = draft.items.map(item => ({
      id: item.catalogo_preco_id || null,
      nome: item.nome || "Serviço",
      quantidade: Math.max(1, Number(item.quantidade) || 1),
      valor_unitario: Number.isFinite(item.valor_unitario) ? Number(item.valor_unitario) : NaN,
      valor_original: item.valor_original ?? null,
      observacoes: item.observacoes || null
    }));
    renderItems(false);
    renderServiceCatalog();
  }

  if (draft.data) $("appointmentDate").value = draft.data;
  $("periodSelect").value = ["manha", "tarde", "dia", "custom"].includes(draft.period) ? draft.period : "custom";
  if (draft.hora_inicio) $("appointmentTime").value = draft.hora_inicio;
  if (Number.isFinite(draft.duracao_minutos)) {
    $("duration").value = Math.max(30, Math.round(draft.duracao_minutos / 30) * 30);
  }
  $("statusSelect").value = ["confirmado", "provisorio"].includes(draft.status) ? draft.status : "confirmado";
  if (Number.isFinite(draft.valor)) {
    $("appointmentValue").value = Number(draft.valor).toFixed(2);
  } else if (type === "estofados" && selectedItems.length && selectedItems.every(i => Number.isFinite(i.valor_unitario))) {
    updateAppointmentTotal();
  }
  $("appointmentAddress").value = draft.endereco || "";
  $("appointmentNotes").value = draft.observacoes || "";

  updatePeriodFields();
  scheduleConflictCheck();
  $("appointmentDialog").showModal();
}
window.openAppointmentFromDraft = openAppointmentFromDraft;

async function saveAppointment(event) {
  event.preventDefault();
  const button = $("saveAppointmentBtn");
  if (button.disabled) return;
  message("appointmentMessage", "");
  const fail = text => message("appointmentMessage", text);
  const type = appointmentType, range = currentRange(), address = $("appointmentAddress").value.trim() || null;
  if (!range || !(range.end > range.start)) return fail("Informe data e horário válidos.");

  const apartment = apartments.find(item => item.id === $("apartmentSelect").value);
  if (type === "apartamento" && !apartment) return fail("Selecione o apartamento.");
  const clientId = type === "apartamento" || $("clientSelect").disabled ? null : $("clientSelect").value || null;
  const newClient = !clientId && type !== "apartamento"
    ? { nome: $("clientName").value.trim(), telefone: $("clientPhone").value.trim() } : null;
  if (newClient && !newClient.nome) return fail("Selecione um cliente ou informe o nome do novo cliente.");
  if (type === "estofados" && !selectedItems.length) return fail("Adicione ao menos um serviço.");
  if (type === "estofados" && selectedItems.some(item => !Number.isFinite(item.valor_unitario) || item.valor_unitario < 0)) {
    return fail("Informe o valor unitário de cada serviço.");
  }
  const cleaning = $("cleaningType").value.trim();
  if (type !== "estofados" && !cleaning) return fail("Informe o tipo de limpeza.");

  button.disabled = true;
  try {
    const editing = Boolean($("appointmentId").value);
    const appointmentId = $("appointmentId").value || appointmentDraftId;
    let clash = [];
    try { clash = await Core.findConflicts(db, range.start, range.end, appointmentId); } catch (error) { return fail("Não foi possível conferir a disponibilidade. Confira a conexão e tente de novo."); }
    if (clash.length && !(await Manage.confirm({ title: "Conflito de horário", message: Core.conflictMessage(clash), confirmLabel: "Agendar mesmo assim" }))) return;

    const payload = {
      tipo: type,
      cliente_id: clientId,
      apartamento_id: type === "apartamento" ? apartment.id : null,
      inicio_em: range.start.toISOString(),
      fim_em: range.end.toISOString(),
      endereco: address || (apartment ? [apartment.edificio, apartment.endereco].filter(Boolean).join(" · ") || null : null),
      descricao_servico: type === "estofados" ? selectedItems.map(item => (item.quantidade > 1 ? item.quantidade + "× " : "") + item.nome).join(" + ") : cleaning,
      valor: +$("appointmentValue").value || 0,
      observacoes: $("appointmentNotes").value.trim() || null,
      status: $("statusSelect").value
    };
    const items = type === "estofados" ? selectedItems.map(item => ({
      catalogo_preco_id: item.id, nome: item.nome, quantidade: item.quantidade,
      valor_unitario: item.valor_unitario, valor_total: lineTotal(item),
      valor_original: QuotePicker.crossedOf(item), observacoes: item.observacoes || null
    })) : [];
    const { error } = await db.rpc("agendamento_salvar_direto", {
      p_id: appointmentId, p_edicao: editing, p_agendamento: payload, p_itens: items, p_novo_cliente: newClient
    });
    if (error) return fail(error.message);
    $("appointmentDialog").close();
    toast(editing ? "Agendamento atualizado!" : "Agendamento criado com sucesso!");
    loadAgenda();
    loadClients();
  } finally { button.disabled = false; }
}

/* ---------- Apartamentos ---------- */

const apartmentLabel = apartment => apartment.nome + (apartment.edificio ? " · " + apartment.edificio : "") + (apartment.airbnb ? " · Airbnb" : "");

async function loadApartments() {
  const user = agendaUserId;
  const { data, error } = await db.from("apartamentos").select("*").order("nome");
  if (error || user !== agendaUserId) return;
  apartments = data || [];
  renderApartmentOptions();
}

function renderApartmentOptions() {
  const select = $("apartmentSelect"), old = select.value;
  select.innerHTML = '<option value="">Selecione o apartamento</option>' + apartments.filter(item => item.ativo || item.id === keepApartmentId).map(item => '<option value="' + item.id + '">' + esc(apartmentLabel(item)) + (item.ativo ? "" : " (inativo)") + "</option>").join("");
  select.value = old;
}

function renderApartmentList() {
  $("apartmentList").innerHTML = apartments.length ? apartments.map(item => '<div class="apt-item' + (item.ativo ? "" : " inactive") + '"><div><b>' + esc(item.nome) + "</b><small>" + esc([item.airbnb ? "Airbnb (nós cuidamos)" : "", item.edificio, item.contato_nome, item.ativo ? "" : "inativo"].filter(Boolean).join(" · ") || "Sem detalhes") + '</small></div><button type="button" class="secondary" data-apartment="' + item.id + '">Editar</button></div>').join("") : '<p class="hint">Nenhum apartamento cadastrado ainda. Cadastre abaixo uma única vez e depois é só selecionar.</p>';
  $("apartmentList").querySelectorAll("[data-apartment]").forEach(button => button.onclick = () => fillApartmentForm(apartments.find(item => item.id === button.dataset.apartment)));
}

function fillApartmentForm(apartment) {
  $("apartmentForm").reset();
  $("apartmentId").value = apartment ? apartment.id : "";
  $("apartmentFormTitle").textContent = apartment ? "Editar " + apartment.nome : "Novo apartamento";
  $("aptBuilding").value = apartment ? apartment.edificio || "" : "Edifício San Remo";
  $("aptActive").checked = apartment ? apartment.ativo : true;
  $("aptAirbnb").checked = !!(apartment && apartment.airbnb);
  if (apartment) {
    $("aptName").value = apartment.nome;
    $("aptAddress").value = apartment.endereco || "";
    $("aptContact").value = apartment.contato_nome || "";
    $("aptPhone").value = apartment.contato_telefone || "";
    $("aptNotes").value = apartment.observacoes || "";
  }
  message("apartmentMessage", "");
}

function openApartments() {
  renderApartmentList();
  fillApartmentForm(null);
  $("apartmentsDialog").showModal();
}

async function saveApartment(event) {
  event.preventDefault();
  const id = $("apartmentId").value, text = field => $(field).value.trim() || null;
  const payload = { nome: $("aptName").value.trim(), edificio: text("aptBuilding"), endereco: text("aptAddress"), contato_nome: text("aptContact"), contato_telefone: text("aptPhone"), observacoes: text("aptNotes"), ativo: $("aptActive").checked, airbnb: $("aptAirbnb").checked };
  if (!payload.nome) return message("apartmentMessage", "Informe o nome ou número do apartamento.");
  const result = id ? await db.from("apartamentos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id).select("id").single() : await db.from("apartamentos").insert(payload).select("id").single();
  if (result.error) return message("apartmentMessage", result.error.message);
  await loadApartments();
  renderApartmentList();
  fillApartmentForm(null);
  if (!id && appointmentType === "apartamento") $("apartmentSelect").value = result.data.id;
  toast(id ? "Apartamento atualizado." : "Apartamento cadastrado.");
}

/* ---------- Ligações ---------- */

initializeAgendaChrome();
document.querySelectorAll("[data-view-mode]").forEach(button => {
  button.onclick = () => {
    if (calendarMode !== button.dataset.viewMode) setAgendaMode(button.dataset.viewMode);
  };
});
function navigateAgenda(date) {
  currentDate = date;
  selectedMonthDay = dateKey(date);
  loadAgenda();
}
$("previousDay").onclick = () => navigateAgenda(Core.shift(calendarMode, currentDate, -1));
$("nextDay").onclick = () => navigateAgenda(Core.shift(calendarMode, currentDate, 1));
$("todayBtn").onclick = () => navigateAgenda(BezTime.dayStart(new Date()));
$("newAppointmentBtn").onclick = $("mobileFabBtn").onclick = () => openNewAppointment(selectedAgendaDay());
$("appointmentForm").onsubmit = saveAppointment;
document.querySelectorAll("#typeToggle [data-type]").forEach(button => button.onclick = () => setAppointmentType(button.dataset.type));
$("periodSelect").onchange = () => { updatePeriodFields(); scheduleConflictCheck(); };
["appointmentDate", "appointmentTime", "duration"].forEach(id => $(id).addEventListener("change", scheduleConflictCheck));
$("apartmentSelect").onchange = () => { const apartment = apartments.find(item => item.id === $("apartmentSelect").value); if (!apartment) return; $("appointmentAddress").value = [apartment.edificio, apartment.endereco].filter(Boolean).join(" · "); const cleaning = $("cleaningType"), presets = Core.CLEANING_TYPES.apartamento.concat(Core.AIRBNB_CLEANING); if (!cleaning.value || presets.includes(cleaning.value)) cleaning.value = apartment.airbnb ? Core.AIRBNB_CLEANING : Core.CLEANING_TYPES.apartamento[0]; };
$("apartmentsBtn").onclick = openApartments;
$("manageApartments").onclick = openApartments;
$("apartmentForm").onsubmit = saveApartment;
$("newApartmentBtn").onclick = () => fillApartmentForm(null);
$("confirmBtn").onclick = async () => {
  const { error } = await db.from("agendamentos").update({ status: "confirmado" }).eq("id", currentAppointment.id);
  if (error) { toast(ManageCore.friendlyError(error, "Não foi possível confirmar.")); return; }
  $("detailsDialog").close();
  toast("Atendimento confirmado.");
  loadAgenda();
};
document.querySelectorAll("#delayQuickOptions [data-delay-min]").forEach(btn => {
  btn.onclick = () => {
    if (btn.dataset.delayTime) $("delayNewTime").value = btn.dataset.delayTime;
    syncDelayShortcutHighlight();
  };
});
$("delayNewTime").addEventListener("input", syncDelayShortcutHighlight);
$("delayNoticeForm").onsubmit = async event => {
  event.preventDefault();
  message("delayNoticeMessage", "");
  const ok = await saveWayNotice("atraso", {
    novoHorario: $("delayNewTime").value,
    observacao: $("delayObservation").value
  });
  if (ok) $("delayNoticeDialog").close();
};

// Início: só depois que tudo acima existe.
db.auth.onAuthStateChange((_, session) => view(session));
