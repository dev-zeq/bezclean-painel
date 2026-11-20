// Base da Agenda: login, clientes, catálogo, itens, lixeira e bloqueios.
// As visões do calendário, o formulário por tipo e os apartamentos ficam em agenda.js.
const db=panelSupabase;
let currentDate=new Date(),services=[],selectedItems=[],allClients=[],keepClientId=null,currentAppointment=null,calendarMode="month";currentDate.setHours(0,0,0,0);
const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,"0"),dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(+v||0),esc=v=>{const e=document.createElement("i");e.textContent=v||"";return e.innerHTML},time=v=>new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(v)),cap=s=>s.charAt(0).toUpperCase()+s.slice(1),dateTime=(d,t)=>new Date(`${d}T${t}:00`);
function message(id,text,ok=false){const n=$(id);n.textContent=text;n.style.color=ok?"var(--success)":"var(--danger)"}function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2800)}
let agendaUserId = null;
let defaultAppointmentOffer = true;
let appointmentDraftId;
function view(session) {
  $("authView").classList.toggle("hidden", !!session);
  $("panelView").classList.toggle("hidden", !session);
  const userId = session?.user.id || null;
  defaultAppointmentOffer = QuotePicker.offerFromMetadata(session?.user.user_metadata);
  if (userId === agendaUserId) return;
  agendaUserId = userId;
  agendaRequest++;
  agendaEvents = [];
  agendaBlocks = [];
  apartments = [];
  allClients = [];
  services = [];
  currentAppointment = null;
  $("agendaContent").replaceChildren();
  $("summaryContainer").replaceChildren();
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  if (session) {
    loadClients();
    loadServices();
    loadApartments();
    setAgendaMode(initialAgendaMode());
    const url = new URL(location.href);
    const target = url.searchParams.get("atendimento");
    if (target) {
      url.searchParams.delete("atendimento");
      history.replaceState(null, "", url);
      if (/^[\w-]{1,80}$/.test(target)) openDetails(target);
    }
  }
}
async function loadClients(){const user=agendaUserId;const {data,error}=await db.from("clientes").select("id,nome,telefone,endereco,arquivado_em").order("nome");if(error||user!==agendaUserId)return;allClients=data;renderClientOptions()}function renderClientOptions(){const s=$("clientSelect"),old=s.value;s.innerHTML='<option value="">Selecione um cliente</option>'+allClients.filter(x=>!ManageCore.isArchived(x)||x.id===keepClientId).map(x=>`<option value="${x.id}">${esc(x.nome)}${ManageCore.isArchived(x)?" (arquivado)":""} · ${esc(x.telefone)}</option>`).join("");s.value=old}
async function loadServices(){const user=agendaUserId;const {data,error}=await db.from("catalogo_precos").select("id,nome,valor,categoria,tipo").eq("ativo",true).in("tipo",["base","adicional"]).order("categoria").order("nome");if(error||user!==agendaUserId)return;services=data;renderServiceCatalog()}function renderServiceCatalog(){const term=($("serviceSearch")?.value||"").trim().toLocaleLowerCase("pt-BR"),list=services.filter(x=>x.nome.toLocaleLowerCase("pt-BR").includes(term));const labels={sofa:"Sofás",poltrona:"Poltronas",colchao:"Colchões",cadeiras:"Cadeiras",automotivo:"Automotivo",sofa_modelo:"Adicionais para sofá"};const groups=Object.entries(list.reduce((acc,x)=>{(acc[x.categoria]??=[]).push(x);return acc},{}));$("serviceCatalog").innerHTML=groups.length?groups.map(([cat,items])=>`<details class="service-group" ${term||cat==="sofa"?"open":""}><summary>${labels[cat]||cat} <span>${items.length}</span></summary><div class="service-options">${items.map(x=>`<button class="service-option ${selectedItems.some(i=>i.id===x.id)?"selected":""}" data-service-id="${x.id}" type="button"><span>${esc(x.nome)}</span><b>${money(x.valor)}</b><i>${selectedItems.some(i=>i.id===x.id)?"Adicionado":"+ Adicionar"}</i></button>`).join("")}</div></details>`).join(""):'<p class="hint">Nenhum serviço encontrado.</p>';$("serviceCatalog").querySelectorAll("[data-service-id]").forEach(btn=>btn.onclick=()=>{const item=services.find(x=>x.id===btn.dataset.serviceId);if(item&&!selectedItems.some(x=>x.id===item.id)){const row = { ...item, valor_unitario: Number(item.valor || 0), quantidade: 1 }; applyAppointmentOffer(row); selectedItems.push(row);renderItems();renderServiceCatalog()}})}
function applyAppointmentOffer(item) {
  QuotePicker.priceItem(item, $("appointmentOffer").checked);
  item.valor_original = QuotePicker.crossedOf(item);
}

const lineTotal = item => Math.round((Number(item.valor_unitario) || 0) * item.quantidade * 100) / 100;

function updateAppointmentTotal() {
  $("appointmentValue").value = selectedItems.reduce((total, item) => total + lineTotal(item), 0).toFixed(2);
}

function appointmentLineAmount(item, total = lineTotal(item)) {
  const original = QuotePicker.crossedOf(item);
  const crossed = original === null ? "" : '<s>' + money(original * item.quantidade) + '</s> ';
  return crossed + '<strong>' + money(total) + '</strong>';
}

function renderItems(updateTotal = true) {
  const box = $("selectedServices");
  box.innerHTML = selectedItems.length ? selectedItems.map((item, index) =>
    '<div class="service-chip">' +
    '<span class="appointment-item-name">' + esc(item.nome) + '</span>' +
    '<label class="chip-qty">Qtd.<input data-qty type="number" inputmode="numeric" min="1" value="' + item.quantidade + '"></label>' +
    '<label class="appointment-unit-price">Unitário (R$)<input data-unit type="number" inputmode="decimal" min="0" step="0.01" value="' + (Number.isFinite(item.valor_unitario) ? item.valor_unitario.toFixed(2) : "") + '"></label>' +
    '<div class="appointment-line-amount" data-line-total>' + appointmentLineAmount(item) + '</div>' +
    '<button type="button" data-remove aria-label="Remover item ' + (index + 1) + '">×</button></div>'
  ).join("") : '<p class="hint">Nenhum serviço selecionado.</p>';

  box.querySelectorAll(".service-chip").forEach((row, index) => {
    const item = selectedItems[index];
    const refreshAmounts = () => {
      row.querySelector("[data-line-total]").innerHTML = appointmentLineAmount(item);
      updateAppointmentTotal();
    };
    row.querySelector("[data-qty]").oninput = event => {
      item.quantidade = Math.max(1, Math.floor(event.target.valueAsNumber) || 1);
      refreshAmounts();
    };
    row.querySelector("[data-unit]").oninput = event => {
      item.valor_unitario = event.target.valueAsNumber;
      applyAppointmentOffer(item);
      refreshAmounts();
    };
    row.querySelector("[data-remove]").onclick = () => {
      selectedItems.splice(index, 1);
      renderItems();
      renderServiceCatalog();
    };
  });
  if (updateTotal) updateAppointmentTotal();
}

$("appointmentOffer").onchange = () => {
  selectedItems.forEach(applyAppointmentOffer);
  renderItems(false);
};

function resetForm() {
  currentAppointment = null;
  appointmentDraftId = crypto.randomUUID();
  $("appointmentForm").reset();
  $("appointmentOffer").checked = defaultAppointmentOffer;
  $("appointmentId").value = "";
  $("appointmentDate").value = dateKey(currentDate);
  $("duration").value = 120;
  $("newClientFields").classList.add("hidden");
  $("newClientToggle").textContent = "+ Novo cliente";
  $("clientSelect").disabled = false;
  selectedItems = [];
  keepClientId = null;
  renderClientOptions();
  renderItems();
  renderServiceCatalog();
  message("appointmentMessage", "");
  resetAgendaFields();
}

function toggleNewClient(force){const box=$("newClientFields"),show=force??box.classList.contains("hidden");box.classList.toggle("hidden",!show);$("newClientToggle").textContent=show?"Usar cliente existente":"+ Novo cliente";$("clientSelect").disabled=show}
async function deleteAppointment(){const a=currentAppointment;if(!a)return;const block=ManageCore.appointmentBlock(a);if(block){toast(block);return}const when=new Date(a.inicio_em).toLocaleDateString("pt-BR")+" "+time(a.inicio_em);const ok=await Manage.confirm({title:"Excluir atendimento?",message:"Excluir é diferente de cancelar: o atendimento de "+AgendaCore.title(a)+" ("+when+") sai da Agenda e vai para a Lixeira, podendo ser restaurado. Use Cancelar atendimento se o cliente apenas desistiu. Orçamento ligado volta para Enviado.",confirmLabel:"Excluir",danger:true});if(!ok)return;const {error}=await db.rpc("agendamento_excluir",{p_id:a.id});if(error){toast(ManageCore.friendlyError(error,"Não foi possível excluir o atendimento."));return}$("detailsDialog").close();toast("Atendimento movido para a lixeira.");loadAgenda()}
async function openTrash(){$("trashList").innerHTML='<p class="hint">Carregando…</p>';$("trashDialog").showModal();const {data,error}=await db.from("agendamentos").select("id,tipo,inicio_em,descricao_servico,valor,status,excluido_em,clientes(nome),apartamentos(nome)").not("excluido_em","is",null).order("excluido_em",{ascending:false});if(error){$("trashList").innerHTML='<p class="hint">Não foi possível carregar a lixeira.</p>';return}$("trashList").innerHTML=data.length?data.map(x=>`<div class="trash-item"><div><b>${esc(AgendaCore.title(x))}</b><small>${new Date(x.inicio_em).toLocaleDateString("pt-BR")} ${time(x.inicio_em)} · ${esc(x.descricao_servico)} · ${money(x.valor)}</small></div><button class="secondary" data-restore="${x.id}" type="button">♻️ Restaurar</button></div>`).join(""):'<p class="hint">A lixeira está vazia.</p>';$("trashList").querySelectorAll("[data-restore]").forEach(b=>b.onclick=async()=>{b.disabled=true;const {error:restoreError}=await db.rpc("agendamento_restaurar",{p_id:b.dataset.restore});if(restoreError){b.disabled=false;toast(ManageCore.friendlyError(restoreError,"Não foi possível restaurar."));return}toast("Atendimento restaurado.");openTrash();loadAgenda()})}
$("authForm").onsubmit=async e=>{e.preventDefault();const {error}=await db.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error)message("authMessage","E-mail ou senha incorretos.")};$("signUpBtn").onclick=async()=>{const {data,error}=await db.auth.signUp({email:$("email").value,password:$("password").value});message("authMessage",error?error.message:data.session?"Conta criada.":"Confira o e-mail para confirmar.",!error)};$("newClientToggle").onclick=()=>toggleNewClient();$("serviceSearch").oninput=renderServiceCatalog;$("editBtn").onclick = () => {
  const appointment = currentAppointment;
  $("detailsDialog").close();
  resetForm();
  $("appointmentId").value = appointment.id;
  $("appointmentDate").value = dateKey(new Date(appointment.inicio_em));
  $("appointmentTime").value = new Date(appointment.inicio_em).toTimeString().slice(0, 5);
  $("duration").value = Math.round((new Date(appointment.fim_em) - new Date(appointment.inicio_em)) / 60000);
  $("appointmentAddress").value = appointment.endereco || "";
  $("appointmentNotes").value = appointment.observacoes || "";
  keepClientId = appointment.cliente_id;
  renderClientOptions();
  $("clientSelect").value = appointment.cliente_id || "";
  selectedItems = appointment.agendamento_itens.map(item => {
    const quantidade = Math.max(1, +item.quantidade || 1);
    return {
      id: item.catalogo_preco_id,
      nome: item.nome,
      quantidade,
      valor_unitario: item.valor_unitario != null ? +item.valor_unitario : +item.valor_total / quantidade,
      valor_original: item.valor_original,
      observacoes: item.observacoes
    };
  });
  $("appointmentOffer").checked = selectedItems.some(item => QuotePicker.crossedOf(item) !== null);
  $("appointmentValue").value = appointment.valor;
  renderItems(false);
  renderServiceCatalog();
  fillAgendaFields(appointment);
  $("appointmentDialog").showModal();
};
$("completeBtn").onclick=async()=>{const {error}=await db.from("agendamentos").update({status:"concluido"}).eq("id",currentAppointment.id);if(error){toast(ManageCore.friendlyError(error,"Não foi possível concluir."));return;}$("detailsDialog").close();toast("Marcado como concluído.");loadAgenda()};$("cancelBtn").onclick=async()=>{const ok=await Manage.confirm({title:"Cancelar atendimento?",message:"O atendimento continua no histórico como cancelado e o horário fica livre. Para remover um agendamento criado só para teste, use Excluir em Mais ações.",confirmLabel:"Cancelar atendimento",danger:true});if(!ok)return;const {error}=await db.from("agendamentos").update({status:"cancelado"}).eq("id",currentAppointment.id);if(error){toast(ManageCore.friendlyError(error,"Não foi possível cancelar."));return}$("detailsDialog").close();toast("Atendimento cancelado.");loadAgenda()};$("trashBtn").onclick=openTrash;$("blockBtn").onclick=()=>openAgendaBlock();$("blockForm").onsubmit=async e=>{e.preventDefault();const s=dateTime($("blockDate").value,$("blockStart").value),f=dateTime($("blockDate").value,$("blockEnd").value);if(f<=s)return message("blockMessage","O fim precisa ser depois do início.");const {error}=await db.from("bloqueios_agenda").insert({inicio_em:s.toISOString(),fim_em:f.toISOString(),motivo:$("blockReason").value||null});if(error)return message("blockMessage",error.message);$("blockDialog").close();toast("Horário bloqueado.");loadAgenda()};document.addEventListener("click",e=>{if(e.target.dataset.close)$(e.target.dataset.close).close()});
