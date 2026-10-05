'use strict';
const db=window.supabase.createClient('https://qunaqtxadifmwbmycqum.supabase.co','sb_publishable_iMbIE9yLK6VGMLaEsYFbHA_S42mbd0W');
const C=window.CampanhasCore,$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let campaign=null,clients=[],appointments=[],quotes=[],participants=[],models=[],contacts=[],rows=[],currentId=null,filter='todos',busy=false,loading=false;
const date=value=>new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3000);}
function errorText(error){const raw=String(error?.message||error||'');if(/fetch|network|offline/i.test(raw))return 'Sem conexão. Tente novamente; o registro não foi confirmado.';if(/schema cache|does not exist|could not find/i.test(raw))return 'Campanhas ainda não está disponível no banco. Atualize o painel após a publicação.';return raw||'Não foi possível salvar. Tente novamente.';}
async function result(query){const {data,error}=await query;if(error)throw error;return data;}
async function all(table,select='*',condition){let list=[];for(let offset=0;;offset+=500){let q=db.from(table).select(select).order('id').range(offset,offset+499);if(condition)q=condition(q);const data=await result(q);list.push(...(data||[]));if(!data||data.length<500)break;}return list;}
async function load(){
 if(loading)return;loading=true;$('refresh').disabled=true;$('error').classList.add('hidden');
 try{
  const session=await result(db.auth.getSession());if(!session.session){location.href='./';return;}
  const campaigns=await result(db.from('campanhas').select('*').order('created_at',{ascending:false}));
  campaign=campaigns.find(c=>c.status==='ativa')||campaigns[0];
  if(!campaign){$('initial').classList.remove('hidden');$('loading').textContent='Sua primeira campanha está pronta para começar.';$('startCampaign').classList.remove('hidden');return;}
  const data=await Promise.all([
    all('clientes','id,nome,telefone,endereco,telefone_normalizado'),
    all('agendamentos','id,cliente_id,inicio_em,fim_em,descricao_servico,valor,status,campanha_cliente_id'),
    all('orcamentos','id,cliente_id,created_at,status,validade_em,valor_total,agendamento_id,campanha_cliente_id'),
    all('campanha_clientes','*',q=>q.eq('campanha_id',campaign.id)),
    all('modelos_mensagem','*',q=>q.eq('campanha_id',campaign.id))
  ]);
  [clients,appointments,quotes,participants,models]=data;
  contacts=[];for(let i=0;i<participants.length;i+=100)contacts.push(...await all('campanha_contatos','*',q=>q.in('campanha_cliente_id',participants.slice(i,i+100).map(p=>p.id))));
  models.sort((a,b)=>a.titulo.localeCompare(b.titulo,'pt-BR'));
  rows=C.rows(participants,clients,appointments,quotes).sort((a,b)=>{
    const rank=x=>x.status==='nao_contatado'?0:x.status==='interessado'?1:2;
    return rank(a)-rank(b)||(a.last?new Date(a.last.inicio_em).getTime():0)-(b.last?new Date(b.last.inicio_em).getTime():0)||(a.client?.nome||'').localeCompare(b.client?.nome||'','pt-BR');
  });
  $('initial').classList.add('hidden');$('dashboard').classList.remove('hidden');$('addClient').disabled=campaign.status!=='ativa';render();
 }catch(error){$('error').textContent=errorText(error);$('error').classList.remove('hidden');$('loading').textContent='Não foi possível carregar a campanha.';$('retry').classList.remove('hidden');}
 finally{loading=false;$('refresh').disabled=false;}
}
function render(){
 const m=C.metrics(rows,Number(campaign.meta_faturamento));$('campaignTitle').textContent=campaign.nome;$('goal').textContent=C.money(campaign.meta_faturamento);
 for(const key of ['potential','scheduled','realized','remaining'])$(key).textContent=C.money(m[key]);
 $('progress').value=Math.min(100,m.percent);$('progressText').textContent=m.percent.toLocaleString('pt-BR',{maximumFractionDigits:1})+'% da meta fechada';
 $('counts').innerHTML=[['contacted','Contatados'],['responses','Respostas'],['interested','Interessados'],['appointments','Agendados'],['completed','Realizados'],['total','Na campanha']].map(([key,label])=>'<article><b>'+(key==='total'?rows.length:m[key])+'</b><span>'+label+'</span></article>').join('');
 const weekTotals=[0,0];for(const r of rows)for(const a of r.linked){const d=C.dateKey(a.inicio_em);if(d>='2026-10-05'&&d<='2026-10-11')weekTotals[0]+=Number(a.valor);if(d>='2026-10-12'&&d<='2026-10-18')weekTotals[1]+=Number(a.valor);}
 $('week').textContent='5–11/10: '+C.money(weekTotals[0])+' · 12–18/10: '+C.money(weekTotals[1])+' · Sem cobrança de sinal';
 const filters=[['todos','Todos'],['nao_contatado','Não contatados'],['interessado','Interessados'],['agendado','Agendados'],['realizado','Realizados'],['nao_interessado','Não interessados']];
 $('filters').innerHTML=filters.map(([key,label])=>'<button type="button" data-filter="'+key+'" class="'+(key===filter?'active':'')+'" aria-pressed="'+(key===filter)+'">'+label+'</button>').join('');
 $('filters').querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderList();render();});renderList();
}
function renderList(){
 const term=$('search').value.trim().toLocaleLowerCase('pt-BR'),digits=term.replace(/\D/g,'');
 const list=rows.filter(r=>(filter==='todos'||r.status===filter)&&(!term||(r.client?.nome||'').toLocaleLowerCase('pt-BR').includes(term)||(digits&&C.phone(r.client?.telefone)?.includes(digits))));
 $('list').innerHTML=list.length?list.map(r=>{
  const last=r.last?date(r.last.inicio_em)+' · há '+Math.max(0,Math.floor((Date.now()-new Date(r.last.inicio_em))/86400000))+' dias':'Sem atendimento registrado no painel';
  return '<article class="card campaign-client"><div class="campaign-client-head"><h3>'+esc(r.client?.nome||'Cliente')+'</h3><span class="campaign-badge '+r.status+'">'+C.labels[r.status]+'</span></div><p>'+esc(r.client?.telefone||'Sem WhatsApp')+'</p><p>'+esc(last)+(r.last?'<br>'+esc(r.last.descricao_servico)+' · '+C.money(r.last.valor):'')+'</p>'+(r.origem==='whatsapp_servico_realizado'?'<p>Base antiga · WhatsApp / serviço realizado</p>':'')+(r.primeiro_contato_em?'<p>Contatado em '+date(r.primeiro_contato_em)+'</p>':'')+(r.scheduled?'<p><b>Fechado: '+C.money(r.scheduled)+'</b></p>':r.status==='interessado'?'<p><b>Potencial: '+C.money(r.potential)+'</b></p>':'')+'<div class="campaign-client-actions"><button type="button" class="primary" data-contact="'+r.id+'">'+(r.primeiro_contato_em?'Acompanhar':'WhatsApp')+'</button></div></article>';
 }).join(''):'<div class="card campaign-empty">'+(rows.length?'Nenhum cliente neste filtro.':'Adicione clientes da sua lista antiga do WhatsApp ou escolha da base do painel.')+'</div>';
 $('list').querySelectorAll('[data-contact]').forEach(b=>b.onclick=()=>openContact(b.dataset.contact));
}
async function action(button,errorId,fn){if(busy)return;busy=true;button.disabled=true;$(errorId).textContent='';try{await fn();}catch(e){$(errorId).textContent=errorText(e);$(errorId).classList.remove('hidden');}finally{busy=false;button.disabled=false;}}
const current=()=>rows.find(r=>r.id===currentId);
function draftKey(){return 'bez-campanha-draft:'+currentId;}
function pendingDraft(){try{return JSON.parse(sessionStorage.getItem(draftKey())||'null');}catch{return null;}}
function persistDraft(opened=false){const previous=pendingDraft();const text=$('messageText').value,model=$('modelSelect').value;
 const d=previous&&previous.text===text&&previous.model===model?previous:{text,model,eventId:crypto.randomUUID(),opened:false};d.opened=d.opened||opened;sessionStorage.setItem(draftKey(),JSON.stringify(d));return d;}
function suggestModel(){const usage=new Map(models.map(m=>[m.id,0]));for(const c of contacts)if(c.tipo==='envio_confirmado'&&usage.has(c.modelo_mensagem_id))usage.set(c.modelo_mensagem_id,usage.get(c.modelo_mensagem_id)+1);return [...models].sort((a,b)=>usage.get(a.id)-usage.get(b.id))[0];}
function setMessage(){const m=models.find(m=>m.id===$('modelSelect').value);$('messageText').value=C.message(m?.conteudo,current()?.client?.nome);persistDraft();}
function refreshContactDetails(){const r=current();if(!r)return;$('contactName').textContent=r.client?.nome||'Cliente';$('contactInfo').textContent=(r.client?.telefone||'')+' · '+C.labels[r.status]+(r.primeiro_contato_em?' · Mensagem enviada em '+date(r.primeiro_contato_em):'');$('createQuote').href='orcamentos.html?v=20261005a&campanha_cliente='+encodeURIComponent(r.id);$('potentialValue').value=r.valor_potencial==null?'':Number(r.valor_potencial).toLocaleString('pt-BR',{minimumFractionDigits:2});
 $('linkedQuotes').innerHTML=r.linkedQuotes.map(q=>'<a class="secondary" href="orcamentos.html?v=20261005a&orcamento='+encodeURIComponent(q.id)+'">Orçamento · '+C.money(q.valor_total)+' · '+esc(q.status)+'</a>').join('');
 const history=contacts.filter(c=>c.campanha_cliente_id===r.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));const names={abertura_whatsapp:'WhatsApp aberto (envio não confirmado)',envio_confirmado:'Envio confirmado',resposta:'Resposta registrada',interesse:'Interesse registrado',nao_interessado:'Não interessado'};
 $('contactHistory').innerHTML='<ul>'+history.map(h=>'<li>'+date(h.created_at)+' · '+names[h.tipo]+(h.texto_utilizado?'<details><summary>Texto utilizado</summary><p>'+esc(h.texto_utilizado).replaceAll('\n','<br>')+'</p></details>':'')+'</li>').join('')+'</ul>'+(r.last?'<p>Último serviço: '+date(r.last.inicio_em)+' · '+esc(r.last.descricao_servico)+' · '+C.money(r.last.valor)+'</p>':'<p>Sem serviço anterior registrado no painel.</p>');
}
function openContact(id){currentId=id;const r=current();if(!r)return;$('contactError').textContent='';$('modelSelect').innerHTML=models.map(m=>'<option value="'+m.id+'">'+esc(m.titulo)+'</option>').join('');const draft=pendingDraft();$('modelSelect').value=draft&&models.some(m=>m.id===draft.model)?draft.model:suggestModel()?.id||'';
 if(draft)$('messageText').value=draft.text;else setMessage();refreshContactDetails();$('openWhatsApp').disabled=!models.length;$('confirmSent').disabled=!models.length;$('contactDialog').showModal();}
async function record(type,options={}){const r=current();if(!r)throw Error('Cliente não encontrado.');await result(db.rpc('campanha_registrar_contato',{p_id:r.id,p_tipo:type,p_evento_id:options.eventId||crypto.randomUUID(),p_modelo_id:options.model||null,p_texto:options.text||null,p_valor:options.value??null}));await load();if(!$('error').classList.contains('hidden'))throw Error('Registro salvo, mas os indicadores não puderam ser atualizados. Toque em Atualizar.');refreshContactDetails();}
$('startCampaign').onclick=()=>action($('startCampaign'),'error',async()=>{await result(db.rpc('campanha_iniciar_mvp'));await load();});
$('retry').onclick=load;$('refresh').onclick=load;$('search').oninput=renderList;
$('addClient').onclick=()=>{$('addForm').reset();$('addError').textContent='';$('duplicates').innerHTML='';$('addDialog').showModal();};
$('quickPhone').oninput=()=>{const phone=C.phone($('quickPhone').value);const matches=phone?clients.filter(c=>C.phone(c.telefone)===phone):[];$('duplicates').innerHTML=matches.length===1?'<p>Usaremos o cadastro: <b>'+esc(matches[0].nome)+'</b></p>':matches.length>1?'<p>Escolha o cadastro existente:</p>'+matches.map(c=>'<button type="button" data-duplicate="'+c.id+'">'+esc(c.nome)+'</button>').join(''):'';$('duplicates').querySelectorAll('[data-duplicate]').forEach(b=>b.onclick=()=>action($('saveClient'),'addError',()=>addClient(b.dataset.duplicate)));};
async function addClient(clientId=null){if(!clientId&&!C.phone($('quickPhone').value))throw Error('Informe o WhatsApp com DDD.');const id=await result(db.rpc('campanha_adicionar_cliente',{p_campanha_id:campaign.id,p_nome:$('quickName').value.trim(),p_telefone:$('quickPhone').value,p_cliente_id:clientId,p_origem:'whatsapp_servico_realizado'}));await load();toast('Cliente vinculado à campanha.');if($('keepAdding').checked){$('quickName').value='';$('quickPhone').value='';$('duplicates').innerHTML='';$('quickName').focus();}else{$('addDialog').close();if(rows.some(r=>r.id===id))openContact(id);}}
$('addForm').onsubmit=e=>{e.preventDefault();action($('saveClient'),'addError',()=>addClient());};
function renderExisting(){const term=$('existingSearch').value.trim().toLocaleLowerCase('pt-BR'),member=new Set(participants.map(p=>p.cliente_id));const past=new Map();appointments.filter(a=>a.status==='concluido').forEach(a=>{if(!past.has(a.cliente_id)||new Date(past.get(a.cliente_id))<new Date(a.inicio_em))past.set(a.cliente_id,a.inicio_em);});const list=clients.filter(c=>!member.has(c.id)&&(!term||(c.nome+' '+c.telefone).toLocaleLowerCase('pt-BR').includes(term))).sort((a,b)=>Number(!past.has(a.id))-Number(!past.has(b.id))||(new Date(past.get(a.id)||0)-new Date(past.get(b.id)||0)));$('existingList').innerHTML=list.length?list.map(c=>'<button type="button" data-existing="'+c.id+'"><b>'+esc(c.nome)+'</b> · '+esc(c.telefone)+(past.has(c.id)?'<br>Último serviço: '+date(past.get(c.id)):'<br>Sem serviço concluído no painel')+'</button>').join(''):'<p>Nenhum cliente disponível.</p>';$('existingList').querySelectorAll('[data-existing]').forEach(b=>b.onclick=()=>action(b,'existingError',async()=>{const c=clients.find(c=>c.id===b.dataset.existing);const id=await result(db.rpc('campanha_adicionar_cliente',{p_campanha_id:campaign.id,p_nome:c.nome,p_telefone:c.telefone,p_cliente_id:c.id,p_origem:'painel'}));await load();$('existingDialog').close();openContact(id);}));}
$('existingClients').onclick=()=>{$('existingSearch').value='';$('existingError').textContent='';renderExisting();$('existingDialog').showModal();};$('existingSearch').oninput=renderExisting;
$('modelSelect').onchange=setMessage;$('messageText').oninput=()=>persistDraft();$('nextModel').onclick=()=>{const i=models.findIndex(m=>m.id===$('modelSelect').value);$('modelSelect').value=models[(i+1)%models.length]?.id||'';setMessage();};
$('openWhatsApp').onclick=async()=>{
 const r=current(),phone=C.phone(r?.client?.telefone);if(!phone){$('contactError').textContent='Confira o WhatsApp do cliente na área Clientes.';return;}if(!$('messageText').value.trim()){$('contactError').textContent='Preencha a mensagem.';return;}
 const d=persistDraft(true);const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);const url=(mobile?'https://wa.me/'+phone+'?text=':'https://web.whatsapp.com/send?phone='+phone+'&text=')+encodeURIComponent(d.text);window.open(url,'_blank','noopener');
 await action($('openWhatsApp'),'contactError',()=>record('abertura_whatsapp',{model:d.model,text:d.text}));
};
$('confirmSent').onclick=()=>action($('confirmSent'),'contactError',async()=>{const d=pendingDraft();if(!d?.opened)throw Error('Abra o WhatsApp antes de confirmar este envio.');await record('envio_confirmado',{eventId:d.eventId,model:d.model,text:d.text});sessionStorage.removeItem(draftKey());toast('Envio registrado.');$('confirmSent').disabled=true;});
$('nextClient').onclick=()=>{if(busy)return;const currentIndex=rows.findIndex(r=>r.id===currentId);const next=[...rows.slice(currentIndex+1),...rows.slice(0,currentIndex)].find(r=>r.status==='nao_contatado'&&r.id!==currentId);$('contactDialog').close();if(next)openContact(next.id);else toast('Não há outro cliente sem contato.');};
$('replied').onclick=()=>action($('replied'),'contactError',()=>record('resposta'));$('notInterested').onclick=()=>action($('notInterested'),'contactError',()=>record('nao_interessado'));
$('interestForm').onsubmit=e=>{e.preventDefault();action($('saveInterest'),'contactError',async()=>{const value=C.parseMoney($('potentialValue').value);if(Number.isNaN(value))throw Error('Informe um valor válido, como 600,00.');await record('interesse',{value});toast('Interesse registrado.');});};
function editModel(){const m=models.find(m=>m.id===$('editModelSelect').value);$('editModelTitle').value=m?.titulo||'';$('editModelText').value=m?.conteudo||'';}
$('models').onclick=()=>{$('modelsError').textContent='';$('editModelSelect').innerHTML=models.map(m=>'<option value="'+m.id+'">'+esc(m.titulo)+'</option>').join('');editModel();$('modelsDialog').showModal();};$('editModelSelect').onchange=editModel;
$('modelsForm').onsubmit=e=>{e.preventDefault();action($('saveModel'),'modelsError',async()=>{const title=$('editModelTitle').value.trim(),text=$('editModelText').value.trim();if(!title||!text)throw Error('Preencha título e mensagem.');const updated=await result(db.from('modelos_mensagem').update({titulo:title,conteudo:text,updated_at:new Date().toISOString()}).eq('id',$('editModelSelect').value).eq('campanha_id',campaign.id).select('id'));if(!updated?.length)throw Error('Modelo não encontrado ou sem permissão.');await load();$('modelsDialog').close();toast('Modelo atualizado.');});};
$('linkRecord').onclick=()=>{const r=current();const available=[...quotes.filter(q=>q.cliente_id===r.cliente_id&&(!q.campanha_cliente_id||q.campanha_cliente_id===r.id)).map(q=>({value:'orcamento:'+q.id,text:'Orçamento · '+C.money(q.valor_total)+' · '+q.status})),...appointments.filter(a=>a.cliente_id===r.cliente_id&&a.status!=='cancelado'&&(!a.campanha_cliente_id||a.campanha_cliente_id===r.id)).map(a=>({value:'agendamento:'+a.id,text:'Atendimento '+date(a.inicio_em)+' · '+C.money(a.valor)+' · '+a.status}))];$('recordSelect').innerHTML='<option value="">Selecione</option>'+available.map(a=>'<option value="'+a.value+'">'+esc(a.text)+'</option>').join('');$('linkError').textContent=available.length?'':'Este cliente ainda não tem orçamento ou agendamento. Use Montar orçamento.';$('linkDialog').showModal();};
$('linkForm').onsubmit=e=>{e.preventDefault();action($('saveLink'),'linkError',async()=>{const [type,id]=$('recordSelect').value.split(':');if(!id)throw Error('Selecione um registro.');await result(db.rpc('campanha_vincular_registro',{p_participante_id:currentId,p_tipo:type,p_registro_id:id}));await load();refreshContactDetails();$('linkDialog').close();toast('Registro vinculado.');});};
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)$(b.dataset.close).close();});
let resumeTimer;function resume(){clearTimeout(resumeTimer);resumeTimer=setTimeout(async()=>{if(campaign){await load();if($('contactDialog').open)refreshContactDetails();}},250);}window.addEventListener('focus',resume);window.addEventListener('pageshow',e=>{if(e.persisted)resume();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();});
load();
