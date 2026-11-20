import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createAssistantHandler } from "../functions/assistente-bez/index.ts";

const users = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const appointments = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
const date = "2026-11-23";
const supabase = "https://supabase.example";
const schema = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  create table public.agendamentos (
    id uuid primary key, owner_id uuid not null, inicio_em timestamptz not null,
    fim_em timestamptz not null, tipo text, status text, excluido_em timestamptz
  );
  create table public.bloqueios_agenda (
    owner_id uuid not null, inicio_em timestamptz not null, fim_em timestamptz not null
  );
  alter table public.agendamentos enable row level security;
  alter table public.bloqueios_agenda enable row level security;
  create policy agendamentos_por_conta on public.agendamentos for all to authenticated
    using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
  create policy bloqueios_por_conta on public.bloqueios_agenda for all to authenticated
    using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
  grant select on public.agendamentos, public.bloqueios_agenda to anon, authenticated;
`;

test("duas contas isoladas e cotas protegidas em Postgres local", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(schema);
  await db.exec(await readFile(new URL("../migrations/20261120220241_assistente_bez_limites.sql", import.meta.url), "utf8"));
  for (const [i, owner] of users.entries()) {
    await db.query(
      "insert into agendamentos values ($1, $2, $3, $4, 'faxina', 'confirmado', null)",
      [appointments[i], owner, date + (i === 0 ? "T09:00:00-03:00" : "T11:00:00-03:00"), date + (i === 0 ? "T10:00:00-03:00" : "T12:00:00-03:00")]
    );
    await db.query(
      "insert into bloqueios_agenda values ($1, $2, $3)",
      [owner, date + (i === 0 ? "T14:00:00-03:00" : "T16:00:00-03:00"), date + (i === 0 ? "T15:00:00-03:00" : "T17:00:00-03:00")]
    );
  }

  const asUser = (id, query, params = []) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
    await tx.exec("set local role authenticated");
    return (await tx.query(query, params)).rows;
  });
  const asService = (query, params = []) => db.transaction(async tx => {
    await tx.exec("set local role service_role");
    return (await tx.query(query, params)).rows;
  });
  const reserve = id => asService("select assistente_bez_reservar_consulta($1) as status", [id]).then(rows => rows[0].status);

  let providerCalls = 0;
  const handler = createAssistantHandler({
    base: supabase, publishable: "teste", quotaKey: "sb_secret_teste",
    deepseekKey: "teste", origins: []
  }, async (url, { headers, body }) => {
    const path = new URL(url).pathname;
    const owner = /^Bearer (.+)$/.exec(headers.Authorization)?.[1];
    if (path === "/auth/v1/user") return users.includes(owner) ? Response.json({ id: owner }) : new Response(null, { status: 401 });
    if (path === "/rest/v1/rpc/assistente_bez_reservar_consulta") {
      assert.equal(headers.apikey, "sb_secret_teste");
      return Response.json(await reserve(JSON.parse(body).p_usuario));
    }
    if (new URL(url).hostname === "api.deepseek.com") {
      providerCalls++;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ modo: "agenda", inicio: date, fim: date }) } }] });
    }
    assert.equal(headers.apikey, "teste");
    assert(users.includes(owner));
    if (path === "/rest/v1/agendamentos") {
      return Response.json(await asUser(owner, "select id, inicio_em, fim_em, tipo, status from agendamentos order by inicio_em"));
    }
    if (path === "/rest/v1/bloqueios_agenda") {
      return Response.json(await asUser(owner, "select inicio_em, fim_em from bloqueios_agenda order by inicio_em"));
    }
    throw new Error("Requisição inesperada");
  });
  const ask = id => handler(new Request(supabase + "/functions/v1/assistente-bez", {
    method: "POST", headers: { Authorization: "Bearer " + id },
    body: JSON.stringify({ question: "Liste os atendimentos do dia " + date })
  }));

  for (const [i, owner] of users.entries()) {
    const other = 1 - i;
    const response = await ask(owner);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.agenda.entries.flatMap(entry => entry.appointmentId ? [entry.appointmentId] : []), [appointments[i]]);
    assert.match(result.answer, i === 0 ? /14:00–15:00/ : /16:00–17:00/);
    assert.doesNotMatch(result.answer, i === 0 ? /16:00–17:00/ : /14:00–15:00/);
    assert.deepEqual(await asUser(owner, "select id from agendamentos where id = $1", [appointments[other]]), []);
    assert.deepEqual(await asUser(owner, "select id from agendamentos where id = $1", [appointments[i]]), [{ id: appointments[i] }]);
    await assert.rejects(asUser(owner, "select assistente_bez_reservar_consulta($1)", [owner]), /permission denied/);
  }

  assert.equal((await ask("sessao-invalida")).status, 401);
  const permissions = (await db.query(`
    select has_function_privilege('anon', 'public.assistente_bez_reservar_consulta(uuid)', 'execute') as anon,
      has_schema_privilege('authenticated', 'assistente_bez_private', 'usage') as authenticated,
      has_function_privilege('service_role', 'public.assistente_bez_reservar_consulta(uuid)', 'execute') as service
  `)).rows[0];
  assert.deepEqual(permissions, { anon: false, authenticated: false, service: true });

  let limited;
  for (let attempt = 0; attempt < 2 && limited?.status !== 429; attempt++) {
    await asService(`
      update assistente_bez_private.quota
      set minuto = date_trunc('minute', clock_timestamp()), total_minuto = 5
      where titular = $1
    `, [users[0]]);
    limited = await ask(users[0]);
  }
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");

  await asService("update assistente_bez_private.quota set total = 30 where titular = $1", [users[0]]);
  assert.equal(await reserve(users[0]), "dia");
  assert.equal(await reserve(users[1]), "ok");
  await asService("update assistente_bez_private.quota set total = 200 where titular = 'global'");
  const before = providerCalls;
  assert.equal((await ask(users[1])).status, 429);
  assert.equal(providerCalls, before);

  await db.exec(await readFile(new URL("../assistente_bez_limites_rollback.sql", import.meta.url), "utf8"));
  assert.equal((await db.query("select to_regnamespace('assistente_bez_private') as quota")).rows[0].quota, null);
  assert.equal((await db.query("select to_regprocedure('public.assistente_bez_reservar_consulta(uuid)') as quota")).rows[0].quota, null);
  assert.deepEqual((await db.query("select id from agendamentos order by id")).rows, appointments.map(id => ({ id })));
});
