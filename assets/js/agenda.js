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
      db.from("agendamentos").select("id,tipo,status,inicio_em,fim_em,descricao_servico,valor,endereco,cidade,bairro,clientes(nome,telefone),apartamentos(nome,edificio,airbnb,contato_telefone)").is("excluido_em", null).lt("inicio_em", end.toISOString()).gt("fim_em", start.toISOString()).order("inicio_em"),
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

async function openDetails(id) {
  const user = agendaUserId;
  const { data, error } = await db.from("agendamentos").select("*,clientes(nome,telefone,endereco),apartamentos(nome,edificio,endereco,contato_nome,contato_telefone,airbnb),agendamento_itens(*)").eq("id", id).single();
  if (user !== agendaUserId) return;
  if (error) { toast("Não foi possível abrir o atendimento."); return; }
  currentAppointment = data;
  const type = Core.typeOf(data), start = new Date(data.inicio_em), contact = data.apartamentos && [data.apartamentos.contato_nome, data.apartamentos.contato_telefone].filter(Boolean).join(" · ");
  $("detailsTitle").textContent = Core.title(data);
  $("detailsContent").innerHTML =
    '<p><span class="type-tag ev-' + type + '">' + Core.TYPES[type].short + '</span>' + airbnbTag(data) + ' <span class="status ' + data.status + '">' + (Core.STATUS[data.status] || data.status) + "</span></p>" +
    "<p><b>" + time(data.inicio_em) + "–" + time(data.fim_em) + "</b> · " + new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(start) + "</p>" +
    (data.apartamentos && data.apartamentos.edificio ? "<p>" + esc(data.apartamentos.edificio) + "</p>" : "") +
    "<p>" + esc(data.descricao_servico) + "</p>" +
    (data.agendamento_itens.length ? "<ul>" + data.agendamento_itens.map(item => "<li>" + (item.quantidade > 1 ? item.quantidade + "× " : "") + esc(item.nome) + " — " + money(item.valor_total) + "</li>").join("") + "</ul>" : "") +
    (+data.valor ? "<p><b>Total: " + money(data.valor) + "</b></p>" : "") +
    "<p>" + esc(data.endereco || "Endereço não informado") + "</p>" +
    (contact ? "<p>Contato: " + esc(contact) + "</p>" : "") +
    (data.observacoes ? "<p>" + esc(data.observacoes) + "</p>" : "");
  $("confirmBtn").hidden = data.status !== "provisorio";
  $("completeBtn").hidden = data.status === "concluido" || data.status === "cancelado";
  $("cancelBtn").hidden = data.status === "cancelado";
  const block = ManageCore.appointmentBlock(data);
  $("appointmentMenu").innerHTML = block ? "" : Manage.menu([{ id: "delete", icon: "🗑️", label: "Excluir atendimento (teste)", danger: true }]);
  Manage.bindMenu($("appointmentMenu"), { delete: deleteAppointment });
  if (block) $("detailsContent").insertAdjacentHTML("beforeend", '<p class="trash-note">' + esc(block) + "</p>");
  $("detailsDialog").showModal();
}

/* ---------- Formulário ---------- */

function setAppointmentType(type) {
  appointmentType = Core.TYPES[type] ? type : "estofados";
  document.querySelectorAll("#typeToggle [data-type]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.type === appointmentType)));
  $("clientSection").classList.toggle("hidden", appointmentType === "apartamento");
  $("apartmentSection").classList.toggle("hidden", appointmentType !== "apartamento");
  $("servicesSection").classList.toggle("hidden", appointmentType !== "estofados");
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
  if (type !== "apartamento" && !$("clientSelect").value && (!$("clientName").value.trim() || !$("clientPhone").value.trim())) return fail("Selecione um cliente ou informe nome e WhatsApp.");
  if (type === "estofados" && !selectedItems.length) return fail("Adicione ao menos um serviço.");
  const cleaning = $("cleaningType").value.trim();
  if (type !== "estofados" && !cleaning) return fail("Informe o tipo de limpeza.");

  button.disabled = true;
  try {
    let appointmentId = $("appointmentId").value;
    let clash = [];
    try { clash = await Core.findConflicts(db, range.start, range.end, appointmentId || null); } catch (error) { return fail("Não foi possível conferir a disponibilidade. Confira a conexão e tente de novo."); }
    if (clash.length && !(await Manage.confirm({ title: "Conflito de horário", message: Core.conflictMessage(clash), confirmLabel: "Agendar mesmo assim" }))) return;

    let clientId = type === "apartamento" ? null : $("clientSelect").value;
    if (type !== "apartamento" && !clientId) {
      const { data, error } = await db.from("clientes").insert({ nome: $("clientName").value.trim(), telefone: $("clientPhone").value.trim(), endereco: address }).select("id").single();
      if (error) return fail(error.message);
      clientId = data.id;
    }

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
    const editing = !!appointmentId;
    if (editing) {
      const { error } = await db.from("agendamentos").update(payload).eq("id", appointmentId);
      if (error) return fail(error.message);
      const { error: removeError } = await db.from("agendamento_itens").delete().eq("agendamento_id", appointmentId);
      if (removeError) return fail(removeError.message);
    } else {
      const { data, error } = await db.from("agendamentos").insert(payload).select("id").single();
      if (error) return fail(error.message);
      appointmentId = data.id;
    }
    if (type === "estofados") {
      const { error } = await db.from("agendamento_itens").insert(selectedItems.map(item => ({ agendamento_id: appointmentId, catalogo_preco_id: item.id, nome: item.nome, quantidade: item.quantidade || 1, valor_unitario: item.valor, valor_total: lineTotal(item) })));
      if (error) return fail(error.message);
    }
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

// Início: só depois que tudo acima existe.
db.auth.onAuthStateChange((_, session) => view(session));
