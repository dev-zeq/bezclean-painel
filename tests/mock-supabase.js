// Fixture local: exercita a interface sem acessar a base nem enviar mensagens.
// Não substitui o teste das funções SQL e das políticas RLS no Supabase.
window.fixture={
 campanhas:[{id:'campaign-1',nome:'50% OFF — Clientes Bez Clean',meta_faturamento:2400,status:'ativa',inicio_em:'2026-10-05',fim_em:'2026-10-18'}],
 clientes:[{id:'client-1',nome:'Cliente antigo de teste',telefone:'(47) 99999-9999',telefone_normalizado:'5547999999999'}],
 agendamentos:[],orcamentos:[],campanha_clientes:[],campanha_contatos:[],
 modelos_mensagem:Array.from({length:8},(_,i)=>({id:'model-'+i,campanha_id:'campaign-1',titulo:'Modelo '+(i+1),conteudo:'Oi, {nome}! Aqui é o Ezequiel, da Bez Clean 😊 Condições de até 50% OFF, com sofá de R$ 398 por R$ 199. Quer um orçamento para sofá, colchão ou cadeiras?'}))
};
class FixtureQuery{
 constructor(table){this.table=table;this.filters=[];this.offset=0;this.end=99999;}
 select(){return this;}
 order(){return this;}
 range(offset,end){this.offset=offset;this.end=end;return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
 single(){this.one=true;return this;}
 update(payload){this.payload=payload;return this;}
 then(resolve,reject){try{if(window.fixtureFail)throw Error('Failed to fetch');const matches=window.fixture[this.table].filter(r=>this.filters.every(f=>f(r)));if(this.payload)matches.forEach(r=>Object.assign(r,this.payload));const data=matches.slice(this.offset,this.end+1);return Promise.resolve({data:this.one?data[0]:structuredClone(data),error:null}).then(resolve,reject);}catch(error){return Promise.resolve({data:null,error}).then(resolve,reject);}}
}
window.open=(url)=>{window.fixtureWhatsAppUrl=url;return {};};
window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session:{user:{id:'fixture-owner'}}},error:null})},from:table=>new FixtureQuery(table),
 rpc:async(name,p={})=>{try{
  if(window.fixtureFail)throw Error('Failed to fetch');
  if(name==='campanha_iniciar_mvp')return {data:'campaign-1',error:null};
  if(name==='campanha_adicionar_cliente'){
   const phone=CampanhasCore.phone(p.p_telefone);let c=p.p_cliente_id?fixture.clientes.find(c=>c.id===p.p_cliente_id):fixture.clientes.find(c=>CampanhasCore.phone(c.telefone)===phone);
   if(!c){c={id:crypto.randomUUID(),nome:p.p_nome,telefone:phone};fixture.clientes.push(c);}let participant=fixture.campanha_clientes.find(r=>r.cliente_id===c.id&&r.campanha_id===p.p_campanha_id);
   if(!participant){participant={id:crypto.randomUUID(),cliente_id:c.id,campanha_id:p.p_campanha_id,status_comercial:'nao_contatado',origem:p.p_origem,created_at:new Date().toISOString()};fixture.campanha_clientes.push(participant);}return {data:participant.id,error:null};
  }
  if(name==='campanha_registrar_contato'){
   if(fixture.campanha_contatos.some(e=>e.id===p.p_evento_id))return {data:null,error:null};const r=fixture.campanha_clientes.find(r=>r.id===p.p_id);const now=new Date().toISOString();fixture.campanha_contatos.push({id:p.p_evento_id,campanha_cliente_id:p.p_id,tipo:p.p_tipo,modelo_mensagem_id:p.p_modelo_id,texto_utilizado:p.p_texto,created_at:now});
   if(p.p_tipo==='envio_confirmado'){r.primeiro_contato_em ||=now;if(r.status_comercial==='nao_contatado')r.status_comercial='mensagem_enviada';}
   if(['resposta','interesse','nao_interessado'].includes(p.p_tipo))r.ultima_resposta_em=now;
   if(p.p_tipo==='resposta'&&['nao_contatado','mensagem_enviada'].includes(r.status_comercial))r.status_comercial='respondeu';
   if(p.p_tipo==='interesse'){r.status_comercial='interessado';r.interessado_em ||=now;r.valor_potencial=p.p_valor;}
   if(p.p_tipo==='nao_interessado')r.status_comercial='nao_interessado';return {data:null,error:null};
  }
  if(name==='campanha_vincular_registro'){const table=p.p_tipo==='orcamento'?'orcamentos':'agendamentos';fixture[table].find(r=>r.id===p.p_registro_id).campanha_cliente_id=p.p_participante_id;return {data:null,error:null};}
  throw Error('RPC não prevista na fixture: '+name);
 }catch(error){return {data:null,error};}}
})};
