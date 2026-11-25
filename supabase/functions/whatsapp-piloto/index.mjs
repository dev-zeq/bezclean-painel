const response = (status, body = "") => new Response(body, { status });

export async function handler(request, env, upstream = fetch) {
  if (!env.secret || !env.verify || !env.url || !env.key) return response(503);
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("hub.mode") !== "subscribe" ||
        url.searchParams.get("hub.verify_token") !== env.verify) return response(403);
    return response(200, url.searchParams.get("hub.challenge") || "");
  }
  if (request.method !== "POST") return response(405);
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 1024 * 1024) return response(413);
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return response(401);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g), x => parseInt(x, 16));
  if (!await crypto.subtle.verify("HMAC", key, bytes, raw)) return response(401);
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return response(400); }
  const rows = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages" || change.value?.metadata?.phone_number_id !== "449654144903672") continue;
      for (const msg of change.value.messages || []) {
        if (msg.from !== "5547920039182" || typeof msg.id !== "string") continue;
        rows.push({ message_id: msg.id, sender: msg.from, kind: msg.type || "unknown", body: msg });
      }
    }
  }
  if (!rows.length) return response(200, "ok");
  const headers = { apikey: env.key, "Content-Type": "application/json",
    Prefer: "resolution=ignore-duplicates,return=minimal" };
  if (!env.key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + env.key;
  try {
    const res = await upstream(env.url + "/rest/v1/whatsapp_piloto_mensagens?on_conflict=message_id",
      { method: "POST", headers, body: JSON.stringify(rows) });
    return response(res.ok ? 200 : 503, res.ok ? "ok" : "");
  } catch { return response(503); }
}

if (import.meta.main) {
  const get = (name) => Deno.env.get(name) || "";
  let key = "";
  try { key = JSON.parse(get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch {}
  Deno.serve(req => handler(req, {
    secret: get("WHATSAPP_APP_SECRET"),
    verify: get("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    url: get("SUPABASE_URL"),
    key: key || get("SUPABASE_SERVICE_ROLE_KEY")
  }));
}
