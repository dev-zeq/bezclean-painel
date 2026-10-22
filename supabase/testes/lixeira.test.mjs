// Teste do SQL em Postgres local (PGlite), sem tocar no Supabase. Uso: npm i @electric-sql/pglite && node supabase/testes/lixeira.test.mjs
import {PGlite} from '@electric-sql/pglite';import fs from 'fs';
const R='/home/zeqmiranda/painel-bezclean/supabase/';
const db=new PGlite();
const U1='11111111-1111-1111-1111-111111111111',U2='22222222-2222-2222-2222-222222222222';
await db.exec(`
create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
create type status_agendamento as enum('agendado','confirmado','em_andamento','concluido','cancelado');
create type status_pagamento as enum('pendente','parcial','pago');
create table clientes(id uuid primary key default gen_random_uuid(), owner_id uuid not null, nome text);
create table agendamentos(id uuid primary key default gen_random_uuid(), owner_id uuid not null, cliente_id uuid, inicio_em timestamptz default now(), fim_em timestamptz default now(), descricao_servico text default 'x', valor numeric default 0, endereco text, observacoes text, status status_agendamento default 'agendado', status_pagamento status_pagamento default 'pendente', campanha_cliente_id uuid, updated_at timestamptz default now());
create table orcamentos(id uuid primary key default gen_random_uuid(), owner_id uuid not null, cliente_id uuid, status text default 'rascunho', agendamento_id uuid references agendamentos(id) on delete set null, valor_total numeric default 0, observacoes text, campanha_cliente_id uuid, updated_at timestamptz default now());
create table orcamento_itens(id uuid primary key default gen_random_uuid(), orcamento_id uuid, catalogo_preco_id uuid, nome text, quantidade int default 1, valor_unitario numeric, valor_total numeric, observacoes text);
create table agendamento_itens(id uuid primary key default gen_random_uuid(), agendamento_id uuid, catalogo_preco_id uuid, nome text, quantidade int, valor_unitario numeric, valor_total numeric, observacoes text);
create table bloqueios_agenda(id uuid primary key default gen_random_uuid(), owner_id uuid, inicio_em timestamptz, fim_em timestamptz);
`);
await db.exec(fs.readFileSync(R+'arquivar_lixeira.sql','utf8'));
await db.exec('alter table agendamentos alter column owner_id set default auth.uid()');
let n=0,bad=0;
const t=async(l,f,expectErr)=>{try{const r=await f();if(expectErr){bad++;console.log('FALHOU (devia dar erro)',l)}else{n++;console.log('OK  ',l,r??'')}}catch(e){if(expectErr&&(!expectErr.test||expectErr.test(e.message))){n++;console.log('OK  ',l,'→ erro esperado:',e.message.slice(0,70))}else{bad++;console.log('ERR ',l,e.message)}}};
const as=async u=>db.exec(`set app.uid='${u}'`);
const q=async s=>(await db.query(s)).rows;
await db.exec(`insert into clientes(id,owner_id,nome) values ('c0000000-0000-0000-0000-000000000001','${U1}','A');
insert into agendamentos(id,owner_id,cliente_id,status) values
 ('a0000000-0000-0000-0000-000000000001','${U1}','c0000000-0000-0000-0000-000000000001','agendado'),
 ('a0000000-0000-0000-0000-000000000002','${U1}','c0000000-0000-0000-0000-000000000001','concluido'),
 ('a0000000-0000-0000-0000-000000000003','${U1}','c0000000-0000-0000-0000-000000000001','cancelado'),
 ('a0000000-0000-0000-0000-000000000004','${U1}','c0000000-0000-0000-0000-000000000001','agendado');
update agendamentos set status_pagamento='pago' where id='a0000000-0000-0000-0000-000000000004';
insert into orcamentos(id,owner_id,cliente_id,status,agendamento_id) values
 ('b0000000-0000-0000-0000-000000000001','${U1}','c0000000-0000-0000-0000-000000000001','aprovado','a0000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-000000000002','${U1}','c0000000-0000-0000-0000-000000000001','aprovado','a0000000-0000-0000-0000-000000000002'),
 ('b0000000-0000-0000-0000-000000000003','${U1}','c0000000-0000-0000-0000-000000000001','aprovado','a0000000-0000-0000-0000-000000000003'),
 ('b0000000-0000-0000-0000-000000000004','${U1}','c0000000-0000-0000-0000-000000000001','rascunho',null),
 ('b0000000-0000-0000-0000-000000000005','${U1}','c0000000-0000-0000-0000-000000000001','aprovado','a0000000-0000-0000-0000-000000000004');
insert into orcamento_itens(orcamento_id,nome,valor_total) values ('b0000000-0000-0000-0000-000000000004','Sofá',199);`);
const A=i=>`a0000000-0000-0000-0000-00000000000${i}`,B=i=>`b0000000-0000-0000-0000-00000000000${i}`;
await as(U1);
await t('orçamento simples → lixeira',async()=>{await db.query(`select orcamento_excluir('${B(4)}')`);return JSON.stringify(await q(`select excluido_em is not null as lixeira from orcamentos where id='${B(4)}'`))});
await t('itens preservados na lixeira',async()=>JSON.stringify(await q(`select count(*)::int n from orcamento_itens where orcamento_id='${B(4)}'`)));
await t('excluir de novo falha',()=>db.query(`select orcamento_excluir('${B(4)}')`),/lixeira/);
await t('restaurar orçamento',async()=>{await db.query(`select orcamento_restaurar('${B(4)}')`);return JSON.stringify(await q(`select excluido_em from orcamentos where id='${B(4)}'`))});
await t('orçamento com atendimento agendado exige p_com_agendamento',()=>db.query(`select orcamento_excluir('${B(1)}')`),/AGENDAMENTO_VINCULADO/);
await t('orçamento + atendimento juntos',async()=>{await db.query(`select orcamento_excluir('${B(1)}', true)`);return JSON.stringify(await q(`select (select excluido_em is not null from orcamentos where id='${B(1)}') o,(select excluido_em is not null from agendamentos where id='${A(1)}') a`))});
await t('restaurar orçamento restaura o atendimento junto',async()=>{await db.query(`select orcamento_restaurar('${B(1)}')`);return JSON.stringify(await q(`select (select excluido_em is null from orcamentos where id='${B(1)}') o,(select excluido_em is null from agendamentos where id='${A(1)}') a`))});
await t('orçamento de atendimento concluído é bloqueado',()=>db.query(`select orcamento_excluir('${B(2)}', true)`),/concluído/);
await t('orçamento de atendimento pago é bloqueado',()=>db.query(`select orcamento_excluir('${B(5)}', true)`),/concluído ou pago/);
await t('orçamento de atendimento cancelado: exclui só o orçamento',async()=>{await db.query(`select orcamento_excluir('${B(3)}')`);return JSON.stringify(await q(`select (select excluido_em is not null from orcamentos where id='${B(3)}') o,(select excluido_em is null from agendamentos where id='${A(3)}') a_intacto`))});
await t('atendimento → lixeira desliga o orçamento (volta a enviado)',async()=>{await db.query(`select agendamento_excluir('${A(1)}')`);return JSON.stringify(await q(`select status, agendamento_id is null as sem_ag, agendamento_excluido_id is not null as lembra from orcamentos where id='${B(1)}'`))});
await t('restaurar atendimento religa o orçamento',async()=>{await db.query(`select agendamento_restaurar('${A(1)}')`);return JSON.stringify(await q(`select status, agendamento_id is not null as ligado, agendamento_excluido_id is null as limpo from orcamentos where id='${B(1)}'`))});
await t('atendimento concluído não pode ser excluído (função)',()=>db.query(`select agendamento_excluir('${A(2)}')`),/concluído/);
await t('atendimento pago não pode ser excluído (função)',()=>db.query(`select agendamento_excluir('${A(4)}')`),/concluído/);
await t('guarda no banco: update direto também é bloqueado',()=>db.query(`update agendamentos set excluido_em=now() where id='${A(2)}'`),/concluído/);
await t('atendimento cancelado pode ir à lixeira',()=>db.query(`select agendamento_excluir('${A(3)}')`));
await as(U2);
await t('outro usuário não enxerga/exclui (owner_id)',()=>db.query(`select orcamento_excluir('${B(4)}')`),/não encontrado/);
await t('outro usuário não restaura',()=>db.query(`select agendamento_restaurar('${A(3)}')`),/não encontrado/);
await as(U1);
await t('migração é reaplicável',async()=>{await db.exec(fs.readFileSync(R+'arquivar_lixeira.sql','utf8'))});
await t('campanha_agendar_orcamento ignora lixeira no conflito',async()=>{
  await db.exec(`update orcamentos set campanha_cliente_id=gen_random_uuid(), agendamento_id=null where id='${B(4)}'; insert into agendamentos(owner_id,cliente_id,inicio_em,fim_em,status,excluido_em) values('${U1}','c0000000-0000-0000-0000-000000000001','2030-01-01 10:00+00','2030-01-01 12:00+00','agendado',now())`);
  const r=await q(`select campanha_agendar_orcamento('${B(4)}','2030-01-01 10:00+00','2030-01-01 12:00+00') id`); return r[0].id?'agendou':'?'});
await db.exec(fs.readFileSync(R+'arquivar_lixeira_rollback.sql','utf8'));
await t('rollback remove colunas e funções',async()=>JSON.stringify(await q(`select (select count(*)::int from information_schema.columns where column_name in ('excluido_em','arquivado_em','agendamento_excluido_id')) cols,(select count(*)::int from pg_proc where proname in ('orcamento_excluir','agendamento_excluir')) fns`)));
console.log(n,'ok',bad,'falhas');process.exit(bad?1:0)
