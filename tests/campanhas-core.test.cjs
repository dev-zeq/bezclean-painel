const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/js/campanhas-core.js');
test('WhatsApp brasileiro identifica o mesmo número sem perder dígitos',()=>{
 for(const p of ['(47) 99999-9999','+55 47 99999-9999','0055 47 99999-9999','5547999999999'])assert.equal(C.phone(p),'5547999999999');
 assert.equal(C.phone('(47) 3333-3333'),'554733333333');assert.equal(C.phone('99999-9999'),null);assert.equal(C.phone('+1 555 1234'),null);
});
test('Exemplo financeiro: realizado está dentro do fechado, potencial fica separado',()=>{
 const p=[{id:'a',cliente_id:'c1',status_comercial:'interessado',valor_potencial:3100,primeiro_contato_em:'x',ultima_resposta_em:'x',interessado_em:'x'},{id:'b',cliente_id:'c2',status_comercial:'interessado',valor_potencial:600,primeiro_contato_em:'x',ultima_resposta_em:'x',interessado_em:'x'}];
 const a=[{id:'one',cliente_id:'c2',campanha_cliente_id:'b',valor:800,status:'concluido',inicio_em:'2026-10-05T11:00:00Z'},{id:'two',cliente_id:'c2',campanha_cliente_id:'b',valor:650,status:'confirmado',inicio_em:'2026-10-06T11:00:00Z'}];
 const m=C.metrics(C.rows(p,[],a,[]),2400);assert.equal(m.potential,3100);assert.equal(m.scheduled,1450);assert.equal(m.realized,800);assert.equal(m.remaining,950);assert.equal(m.percent,1450/2400*100);assert.equal(m.appointments,1);assert.equal(m.completed,1);assert.equal(m.responses,2);
});
test('Conversão de 600: potencial → agendado → concluído → cancelado',()=>{
 const p=[{id:'p',cliente_id:'c',status_comercial:'interessado',valor_potencial:600,interessado_em:'x'}];let a=[];const calc=()=>C.metrics(C.rows(p,[],a,[]),2400);
 assert.equal(calc().potential,600);a=[{id:'a',cliente_id:'c',campanha_cliente_id:'p',status:'agendado',valor:600,inicio_em:'2026-10-06T11:00:00Z'}];assert.equal(calc().potential,0);assert.equal(calc().scheduled,600);assert.equal(calc().realized,0);
 a[0].status='concluido';assert.equal(calc().scheduled,600);assert.equal(calc().realized,600);a[0].status='cancelado';assert.equal(calc().scheduled,0);assert.equal(calc().realized,0);assert.equal(calc().potential,600);
});
test('Orçamento atualiza potencial sem somar versões; recusa não mantém potencial',()=>{
 const p=[{id:'p',cliente_id:'c',status_comercial:'interessado',valor_potencial:600}];const q=[{id:'q1',campanha_cliente_id:'p',status:'enviado',created_at:'2026-10-05T12:00:00Z',valor_total:700},{id:'q2',campanha_cliente_id:'p',status:'rascunho',created_at:'2026-10-05T13:00:00Z',valor_total:900}];assert.equal(C.rows(p,[],[],q)[0].potential,900);p[0].status_comercial='nao_interessado';assert.equal(C.rows(p,[],[],q)[0].potential,0);
});
test('Último serviço usa somente concluídos e distingue ausência de histórico',()=>{
 const p=[{id:'p',cliente_id:'c',status_comercial:'nao_contatado'}];const a=[{cliente_id:'c',status:'concluido',inicio_em:'2026-01-01T12:00:00Z'},{cliente_id:'c',status:'agendado',inicio_em:'2026-10-06T12:00:00Z'},{cliente_id:'c',status:'cancelado',inicio_em:'2026-09-01T12:00:00Z'}];assert.equal(C.rows(p,[],a,[])[0].last.inicio_em,a[0].inicio_em);assert.equal(C.rows(p,[],[],[])[0].last,undefined);
});
test('Resposta negativa continua contando como resposta; meta não fica negativa',()=>{
 const r=C.rows([{id:'p',cliente_id:'c',status_comercial:'nao_interessado',ultima_resposta_em:'x'}],[],[{cliente_id:'c',campanha_cliente_id:'p',status:'concluido',inicio_em:'2026-10-05T12:00:00Z',valor:3000}],[]);const m=C.metrics(r,2400);assert.equal(m.responses,1);assert.equal(m.remaining,0);assert.equal(m.percent,125);
});
test('Formatação monetária, mensagens e datas seguem Brasil',()=>{assert.equal(C.parseMoney('R$ 1.234,56'),1234.56);assert.equal(C.parseMoney('600,00'),600);assert.equal(C.parseMoney(''),null);assert.ok(Number.isNaN(C.parseMoney('-3')));assert.equal(C.message('Oi {nome}! {nome}, tudo bem?','Bruna Oliveira'),'Oi Bruna! Bruna, tudo bem?');assert.equal(C.dateKey('2026-10-06T01:00:00Z'),'2026-10-05');});
