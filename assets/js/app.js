const SUPABASE_URL="https://qunaqtxadifmwbmycqum.supabase.co";
const SUPABASE_KEY="sb_publishable_iMbIE9yLK6VGMLaEsYFbHA_S42mbd0K9";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let currentDate=new Date();currentDate.setHours(0,0,0,0);

const $=id=>document.getElementById(id);
const fmtMoney=value=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
const pad=n=>String(n).padStart(2,"0");
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const displayDate=d=>new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(d);
const asLocal=(date,time)=>new Date(`${date}T${time}:00`);
const showMessage=(id,message,ok=false)=>{const node=$(id);node.textContent=message;node.style.color=ok?"var(--success)":"var(--danger)"};
const toast=message=>{const node=$("toast");node.textContent=message;node.classList.add("show");setTimeout(()=>node.classList.remove("show"),3200)};

function setView(session){$("authView").classList.toggle("hidden",!!session);$("panelView").classList.toggle("hidden",!session);if(session)loadAgenda()}

async function loadAgenda(){
  $("selectedDate").textContent=displayDate(currentDate);
  const start=new Date(currentDate),end=new Date(currentDate);end.setDate(end.getDate()+1);
  const [appointments,blocks]=await Promise.all([
    db.from("agendamentos").select("id,inicio_em,fim_em,descricao_servico,valor,status,endereco,clientes(nome,telefone)").gte("inicio_em",start.toISOString()).lt("inicio_em",end.toISOString()).order("inicio_em"),
    db.from("bloqueios_agenda").select("id,inicio_em,fim_em,motivo").gte("inicio_em",start.toISOString()).lt("inicio_em",end.toISOString()).order("inicio_em")
  ]);
  if(appointments.error||blocks.error){$("agendaContent").innerHTML='<div class="empty-state"><strong>Não foi possível carregar a agenda.</strong><span>Tente atualizar a página.</span></div>';return}
  renderAgenda(appointments.data||[],blocks.data||[]);
}

function renderAgenda(appointments,blocks){
  const items=[
    ...appointments.map(a=>({kind:"appointment",at:new Date(a.inicio_em),data:a})),
    ...blocks.map(b=>({kind:"block",at:new Date(b.inicio_em),data:b}))
  ].sort((a,b)=>a.at-b.at);
  const total=appointments.filter(a=>a.status!=="cancelado").reduce((sum,a)=>sum+Number(a.valor||0),0);
  $("todayCount").textContent=appointments.filter(a=>a.status!=="cancelado").length;
  $("todayValue").textContent=fmtMoney(total);
  const next=appointments.find(a=>new Date(a.inicio_em)>new Date());
  $("nextAppointment").textContent=next?`${new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(next.inicio_em))} · ${next.clientes?.nome?.split(" ")[0]||"Cliente"}`:"Livre";
  if(!items.length){$("agendaContent").innerHTML='<div class="empty-state"><strong>Dia livre por enquanto</strong><span>Crie um agendamento ou bloqueie um horário.</span></div>';return}
  $("agendaContent").innerHTML='<div class="appointment-list">'+items.map(item=>{
    const time=new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(item.at);
    if(item.kind==="block")return `<div class="time-row"><div class="time">${time}</div><div class="event-card blocked"><div class="event-title"><span>Horário bloqueado</span></div><p>${escapeHtml(item.data.motivo||"Indisponível")}</p></div></div>`;
    const a=item.data,client=a.clientes?.nome||"Cliente",status=a.status.replace("_"," ");
    return `<div class="time-row"><div class="time">${time}</div><div class="event-card"><div class="event-title"><span>${escapeHtml(client)}</span><span class="status ${a.status}">${escapeHtml(status)}</span></div><p>${escapeHtml(a.descricao_servico)} · ${fmtMoney(a.valor)}${a.endereco?`<br>${escapeHtml(a.endereco)}`:""}</p></div></div>`;
  }).join("")+"</div>";
}
function escapeHtml(value){const d=document.createElement("div");d.textContent=value||"";return d.innerHTML}

$("authForm").addEventListener("submit",async event=>{
  event.preventDefault();showMessage("authMessage","");
  const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  if(error)showMessage("authMessage",error.message==="Invalid login credentials"?"E-mail ou senha incorretos.":error.message);
});
$("signUpBtn").addEventListener("click",async()=>{
  showMessage("authMessage","");
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||password.length<6){showMessage("authMessage","Informe e-mail e uma senha com ao menos 6 caracteres.");return}
  const {data,error}=await db.auth.signUp({email,password});
  if(error){showMessage("authMessage",error.message);return}
  showMessage("authMessage",data.session?"Conta criada. Você já entrou no painel!":"Conta criada. Confira seu e-mail para confirmar o acesso.",true);
});
$("signOutBtn").addEventListener("click",()=>db.auth.signOut());
$("previousDay").addEventListener("click",()=>{currentDate.setDate(currentDate.getDate()-1);loadAgenda()});
$("nextDay").addEventListener("click",()=>{currentDate.setDate(currentDate.getDate()+1);loadAgenda()});
$("todayBtn").addEventListener("click",()=>{currentDate=new Date();currentDate.setHours(0,0,0,0);loadAgenda()});
$("newAppointmentBtn").addEventListener("click",()=>{$("appointmentDate").value=dateKey(currentDate);$("appointmentMessage").textContent="";$("appointmentDialog").showModal()});
$("blockBtn").addEventListener("click",()=>{$("blockDate").value=dateKey(currentDate);$("blockMessage").textContent="";$("blockDialog").showModal()});
document.addEventListener("click",event=>{const id=event.target.dataset.close;if(id)$(id).close()});

$("appointmentForm").addEventListener("submit",async event=>{
  event.preventDefault();showMessage("appointmentMessage","");
  const name=$("clientName").value.trim(),phone=$("clientPhone").value.trim(),address=$("appointmentAddress").value.trim();
  let {data:client,error:clientError}=await db.from("clientes").select("id").eq("telefone",phone).maybeSingle();
  if(clientError){showMessage("appointmentMessage",clientError.message);return}
  if(!client){const insert=await db.from("clientes").insert({nome:name,telefone:phone,endereco:address}).select("id").single();client=insert.data;clientError=insert.error}
  if(clientError||!client){showMessage("appointmentMessage",clientError?.message||"Não foi possível salvar o cliente.");return}
  const start=asLocal($("appointmentDate").value,$("appointmentTime").value);
  const end=new Date(start.getTime()+Number($("duration").value)*60000);
  const {error}=await db.from("agendamentos").insert({cliente_id:client.id,inicio_em:start.toISOString(),fim_em:end.toISOString(),endereco:address||null,descricao_servico:$("serviceDescription").value.trim(),valor:Number($("appointmentValue").value),observacoes:$("appointmentNotes").value.trim()||null});
  if(error){showMessage("appointmentMessage",error.message);return}
  $("appointmentDialog").close();$("appointmentForm").reset();toast("Agendamento criado com sucesso!");loadAgenda();
});
$("blockForm").addEventListener("submit",async event=>{
  event.preventDefault();showMessage("blockMessage","");
  const start=asLocal($("blockDate").value,$("blockStart").value),end=asLocal($("blockDate").value,$("blockEnd").value);
  if(end<=start){showMessage("blockMessage","O horário final precisa ser depois do inicial.");return}
  const {error}=await db.from("bloqueios_agenda").insert({inicio_em:start.toISOString(),fim_em:end.toISOString(),motivo:$("blockReason").value.trim()||null});
  if(error){showMessage("blockMessage",error.message);return}
  $("blockDialog").close();$("blockForm").reset();toast("Horário bloqueado.");loadAgenda();
});
db.auth.onAuthStateChange((_event,session)=>setView(session));
db.auth.getSession().then(({data:{session}})=>setView(session));