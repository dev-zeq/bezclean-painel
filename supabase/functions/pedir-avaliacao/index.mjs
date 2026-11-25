const endpoint = "https://graph.facebook.com/v26.0/449654144903672/messages";
const template = "avaliacao_google_pos_atendimento";
const allowedOrigin = "https://painel.bezclean.com.br";

export function createHandler(config, upstream = fetch) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    };
    const response = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && origin !== allowedOrigin) return response(403, { error: "Origem não autorizada." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return response(405, { error: "Método não permitido." });

    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer \S+$/.test(authorization)) return response(401, { error: "Entre no painel para continuar." });
    if (!config.base || !config.key || !config.serviceKey || !config.token) {
      return response(503, { error: "O envio pelo WhatsApp ainda não está configurado." });
    }

    let clientId;
    try {
      const body = await request.json();
      clientId = body?.clientId;
      if (body?.confirmed !== true || typeof clientId !== "string" ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId)) {
        return response(400, { error: "Confirme o pedido de avaliação para um cliente válido." });
      }
    } catch {
      return response(400, { error: "Pedido inválido." });
    }

    const userHeaders = { apikey: config.key, Authorization: authorization };
    const serviceHeaders = { apikey: config.serviceKey, "Content-Type": "application/json" };
    if (!config.serviceKey.startsWith("sb_secret_")) serviceHeaders.Authorization = "Bearer " + config.serviceKey;
    const ledger = config.base + "/rest/v1/whatsapp_review_requests";
    const filter = "?client_id=eq." + clientId;
    const call = (url, options) => upstream(url, { ...options, signal: AbortSignal.timeout(10000) });

    try {
      const session = await call(config.base + "/auth/v1/user", { headers: userHeaders });
      if (!session.ok) return response(session.status >= 500 ? 503 : 401, { error: "Não foi possível validar a sessão." });
      const user = await session.json();
      if (!user?.id || user.is_anonymous) return response(401, { error: "Entre no painel para continuar." });

      const lookup = await call(config.base + "/rest/v1/clientes" + "?id=eq." + clientId +
        "&select=telefone&arquivado_em=is.null", { headers: userHeaders });
      if (!lookup.ok) throw new Error("Client lookup failed");
      const [client] = await lookup.json();
      if (!client) return response(404, { error: "Cliente ativo não encontrado." });
      let phone = String(client.telefone || "").trim().replace(/^00/, "").replace(/\D/g, "");
      if (phone.length === 10 || phone.length === 11) phone = "55" + phone;
      if (!/^55[1-9]\d{9,10}$/.test(phone)) return response(422, { error: "Confira o WhatsApp com DDD no cadastro." });

      const reserved = await call(ledger, { method: "POST", headers: serviceHeaders,
        body: JSON.stringify({ client_id: clientId, requested_by: user.id }) });
      if (reserved.status === 409) {
        const previous = await call(ledger + filter + "&select=message_id", { headers: serviceHeaders });
        if (!previous.ok) throw new Error("Request lookup failed");
        const [record] = await previous.json();
        return record?.message_id
          ? response(200, { status: "already_requested" })
          : response(409, { error: "Já existe uma tentativa sem confirmação. Confira o WhatsApp antes de reenviar." });
      }
      if (!reserved.ok) throw new Error("Could not reserve request");

      const result = await call(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template",
          template: { name: template, language: { code: "pt_BR" } } })
      });
      const meta = await result.json();
      if (!result.ok) {
        if (result.status < 500 && meta?.error?.code) {
          const released = await call(ledger + filter, { method: "DELETE", headers: serviceHeaders });
          if (!released.ok) throw new Error("Could not release request");
          return response(502, { error: "A Meta recusou o envio. Código: " + String(Number(meta.error.code)) + "." });
        }
        throw new Error("Unknown send result");
      }
      const messageId = meta?.messages?.[0]?.id;
      if (typeof messageId !== "string" || !messageId.startsWith("wamid.")) throw new Error("Unknown send result");
      const saved = await call(ledger + filter, { method: "PATCH", headers: serviceHeaders,
        body: JSON.stringify({ message_id: messageId }) });
      return response(200, { status: saved.ok ? "accepted" : "accepted_unrecorded" });
    } catch {
      return response(503, { error: "Não foi possível confirmar o pedido. Confira o WhatsApp antes de tentar novamente." });
    }
  };
}

if (import.meta.main) {
  const env = (name) => Deno.env.get(name) || "";
  const defaultKey = (name) => {
    try { return JSON.parse(env(name) || "{}").default || ""; } catch { return ""; }
  };
  Deno.serve(createHandler({
    base: env("SUPABASE_URL"),
    key: defaultKey("SUPABASE_PUBLISHABLE_KEYS") || env("SUPABASE_ANON_KEY"),
    serviceKey: defaultKey("SUPABASE_SECRET_KEYS") || env("SUPABASE_SERVICE_ROLE_KEY"),
    token: env("WHATSAPP_ACCESS_TOKEN")
  }));
}
