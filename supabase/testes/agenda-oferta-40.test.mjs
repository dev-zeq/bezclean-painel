import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("Oferta da Agenda é gravada com os itens e respeita o proprietário", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table clientes(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
      nome text not null, telefone text not null, endereco text);
    create table apartamentos(id uuid primary key, owner_id uuid not null default auth.uid());
    create table agendamentos(id uuid primary key, owner_id uuid not null default auth.uid(), tipo text not null,
      cliente_id uuid references clientes, apartamento_id uuid references apartamentos, inicio_em timestamptz not null,
      fim_em timestamptz not null, endereco text, descricao_servico text, valor numeric(12,2) not null, observacoes text,
      status text not null, excluido_em timestamptz);
    create table agendamento_itens(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(),
      agendamento_id uuid not null references agendamentos, catalogo_preco_id uuid, nome text not null,
      quantidade int not null, valor_unitario numeric(12,2) not null, valor_total numeric(12,2) not null, observacoes text);
  `);
  for (const table of ["clientes", "apartamentos", "agendamentos", "agendamento_itens"]) {
    await db.exec(`
      alter table ${table} enable row level security;
      create policy pertence_a_conta on ${table} for all to authenticated
        using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
      grant select, insert, update, delete on ${table} to authenticated;
    `);
  }
  await db.exec(await readFile(new URL("../migrations/20261120222653_agenda_oferta_40.sql", import.meta.url), "utf8"));
  const owner = "10000000-0000-4000-8000-000000000001";
  const otherOwner = "10000000-0000-4000-8000-000000000002";
  const id = "10000000-0000-4000-8000-000000000010";
  const customer = { nome: "Cliente de teste", telefone: "47999990000" };
  const data = { tipo: "estofados", inicio_em: "2026-11-22T10:00:00-03:00", fim_em: "2026-11-22T12:00:00-03:00",
    descricao_servico: "Sofá de teste", valor: 199, status: "confirmado" };
  const sofa = { nome: "Sofá de teste", quantidade: 1, valor_unitario: 199, valor_total: 199, valor_original: 331.67 };
  const call = (user, editing, event, items, newClient, appointmentId = id) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await tx.exec("set local role authenticated");
    return (await tx.query("select agendamento_salvar_direto($1,$2,$3::jsonb,$4::jsonb,$5::jsonb) as id",
      [appointmentId, editing, JSON.stringify(event), JSON.stringify([items].flat()), newClient ? JSON.stringify(newClient) : null])).rows[0].id;
  });
  assert.equal(await call(owner, false, data, sofa, customer), id);
  assert.equal(await call(owner, false, data, sofa, customer), id);
  assert.equal((await db.query("select count(*)::int as total from clientes")).rows[0].total, 1);
  const { cliente_id } = (await db.query("select cliente_id from agendamentos")).rows[0];
  const price = async () => Number((await db.query("select valor from agendamentos")).rows[0].valor);
  const crossed = async () => (await db.query("select valor_original from agendamento_itens")).rows[0].valor_original;
  assert.equal(Number(await crossed()), 331.67);
  assert.equal(await price(), 199);
  await assert.rejects(call(owner, true, { ...data, cliente_id, valor: 200 }, { ...sofa, valor_original: 300 }), /oferta_40_check/);
  assert.equal(await price(), 199);
  assert.equal(Number(await crossed()), 331.67);
  await assert.rejects(call(otherOwner, true, { ...data, valor: 200 }, sofa, customer), /Atendimento não encontrado/);
  assert.equal((await db.query("select count(*)::int as total from clientes")).rows[0].total, 1);
  assert.equal(await call(owner, true, { ...data, cliente_id }, { ...sofa, valor_original: null }), id);
  assert.equal(await crossed(), null);
  assert.deepEqual((await db.query(`select has_function_privilege('anon','public.agendamento_salvar_direto(uuid,boolean,jsonb,jsonb,jsonb)','execute') as anon`)).rows[0], { anon: false });

  const cleaning = "10000000-0000-4000-8000-000000000011";
  const apartment = "10000000-0000-4000-8000-000000000012";
  const apartmentBooking = "10000000-0000-4000-8000-000000000013";
  await db.query("insert into apartamentos (id, owner_id) values ($1,$2)", [apartment, owner]);
  assert.equal(await call(owner, false, { ...data, tipo: "faxina", cliente_id }, [], null, cleaning), cleaning);
  assert.equal(await call(owner, false, { ...data, tipo: "apartamento", apartamento_id: apartment }, [], null, apartmentBooking), apartmentBooking);
  assert.deepEqual((await db.query("select tipo, cliente_id, apartamento_id from agendamentos where id = $1", [apartmentBooking])).rows,
    [{ tipo: "apartamento", cliente_id: null, apartamento_id: apartment }]);
});
