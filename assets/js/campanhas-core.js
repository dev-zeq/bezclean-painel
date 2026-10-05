(function(root){
  'use strict';
  const labels={nao_contatado:'Não contatado',mensagem_enviada:'Mensagem enviada',respondeu:'Respondeu',interessado:'Interessado',agendado:'Agendado',realizado:'Realizado',nao_interessado:'Não interessado'};
  function phone(value){let n=String(value||'').replace(/^\s*00/,'').replace(/\D/g,'');if(n.length===10||n.length===11)n='55'+n;return /^55\d{10,11}$/.test(n)?n:null;}
  function money(value){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);}
  function parseMoney(value){const s=String(value||'').trim().replace(/R\$\s*/,'').replace(/\s/g,'');if(!s)return null;const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);return Number.isFinite(n)&&n>=0?n:NaN;}
  function dateKey(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
  function rows(participants,clients,appointments,quotes){
    const byClient=new Map(clients.map(c=>[c.id,c]));
    return participants.map(p=>{
      const past=appointments.filter(a=>a.cliente_id===p.cliente_id&&a.status==='concluido').sort((a,b)=>new Date(b.inicio_em)-new Date(a.inicio_em));
      const linked=appointments.filter(a=>a.campanha_cliente_id===p.id&&a.status!=='cancelado');
      const pending=linked.filter(a=>a.status!=='concluido');
      const done=linked.filter(a=>a.status==='concluido');
      const linkedQuotes=quotes.filter(q=>q.campanha_cliente_id===p.id);
      const quote=linkedQuotes.filter(q=>!q.agendamento_id&&!['recusado','expirado'].includes(q.status)&&(!q.validade_em||q.validade_em>=dateKey(new Date()))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
      const status=pending.length?'agendado':done.length?'realizado':p.status_comercial;
      const potential=!linked.length&&p.status_comercial==='interessado'?Number(quote?quote.valor_total:p.valor_potencial)||0:0;
      return {...p,client:byClient.get(p.cliente_id),last:past[0],linked,done,pending,linkedQuotes,quote,status,potential,
        scheduled:linked.reduce((sum,a)=>sum+Number(a.valor||0),0),realized:done.reduce((sum,a)=>sum+Number(a.valor||0),0)};
    });
  }
  function metrics(list,goal){const m={potential:0,scheduled:0,realized:0,contacted:0,responses:0,interested:0,appointments:0,completed:0};for(const r of list){m.potential+=r.potential;m.scheduled+=r.scheduled;m.realized+=r.realized;if(r.primeiro_contato_em)m.contacted++;if(r.ultima_resposta_em)m.responses++;if(r.interessado_em)m.interested++;if(r.linked.length)m.appointments++;if(r.done.length)m.completed++;}m.remaining=Math.max(0,goal-m.scheduled);m.percent=goal>0?m.scheduled/goal*100:0;return m;}
  function message(text,name){return String(text||'').replaceAll('{nome}',String(name||'').trim().split(/\s+/)[0]||'');}
  const api={labels,phone,money,parseMoney,dateKey,rows,metrics,message};root.CampanhasCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
