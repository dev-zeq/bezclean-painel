import { handler } from "../supabase/functions/whatsapp-piloto/index.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const env = { secret: "secret", verify: "verify", url: "https://example.test", key: "sb_secret_test" };
async function signedRequest(payload, secret = env.secret) {
  const raw = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const signature = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://test.invalid", { method: "POST", headers: { "x-hub-signature-256": "sha256=" + signature }, body: raw });
}
function event(messages, phone = "449654144903672") {
  return { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phone }, messages } }] }] };
}
test("valida desafio e rejeita verificação incorreta", async () => {
  const good = await handler(new Request("https://test.invalid/?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123"), env);
  assert.equal(await good.text(), "123");
  assert.equal((await handler(new Request("https://test.invalid/?hub.mode=subscribe&hub.verify_token=wrong"), env)).status, 403);
});
test("rejeita assinaturas incorretas", async () => {
  const req = await signedRequest(event([]), "wrong");
  assert.equal((await handler(req, env)).status, 401);
});
test("grava apenas mensagens do número e aparelho do piloto", async () => {
  let rows;
  const msgs = [{ id: "first", from: "5547920039182", type: "text", text: { body: "oi" } }, { id: "second", from: "5547000000000", type: "text" }];
  const result = await handler(await signedRequest(event(msgs)), env, async (_, options) => {
    rows = JSON.parse(options.body);
    assert.match(options.headers.Prefer, /ignore-duplicates/);
    return new Response(null, { status: 201 });
  });
  assert.equal(result.status, 200);
  assert.deepEqual(rows.map(row => row.message_id), ["first"]);
  let called = false;
  await handler(await signedRequest(event(msgs, "other")), env, async () => { called = true; });
  assert.equal(called, false);
});
test("pede reenvio à Meta quando armazenamento falha", async () => {
  const msgs = [{ id: "one", from: "5547920039182", type: "text" }];
  const result = await handler(await signedRequest(event(msgs)), env, async () => new Response(null, { status: 503 }));
  assert.equal(result.status, 503);
});
