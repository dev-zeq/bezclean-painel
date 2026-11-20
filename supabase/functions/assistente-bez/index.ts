import { answerAgenda, parseIntent, validateQuestion } from "./core.mjs";

type Config = {
  base: string;
  publishable: string;
  quotaKey: string;
  deepseekKey: string;
  origins: string[];
};
const modelUrl = "https://api.deepseek.com/chat/completions";
const rowLimit = 200;
const bodyLimit = 4096;
const clarification = "Informe o dia ou período (até 31 dias) e se quer ver os atendimentos, os horários livres ou buscar por cidade ou bairro.";
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

class RequestError extends Error {
  status: number;
  retryAfter?: string;
  constructor(status: number, message: string, retryAfter?: string) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function readQuestion(request: Request) {
  if (!request.body) throw new Error("Pergunta vazia");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) throw new RequestError(413, "A pergunta é muito grande.");
      text += decoder.decode(value, { stream: true });
    }
    return validateQuestion(JSON.parse(text + decoder.decode())?.question);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createAssistantHandler(config: Config, requestUpstream = fetch, now = () => new Date()) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const cors = new Headers({ "Vary": "Origin" });
    if (origin && config.origins.includes(origin)) {
      cors.set("Access-Control-Allow-Origin", origin);
      cors.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
      cors.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    const json = (body: unknown, status: number, retryAfter?: string) => {
      const headers = new Headers(cors);
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Cache-Control", "no-store");
      if (retryAfter) headers.set("Retry-After", retryAfter);
      return new Response(JSON.stringify(body), { status, headers });
    };
    if (origin && !cors.has("Access-Control-Allow-Origin")) return json({ error: "Origem não autorizada." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer \S+$/.test(authorization)) return json({ error: "Entre no painel para usar o assistente." }, 401);
    if (!config.base || !config.publishable || !config.quotaKey || !config.deepseekKey) {
      return json({ error: "O Assistente Bez está indisponível." }, 503);
    }

    try {
      const userHeaders = { apikey: config.publishable, Authorization: authorization };
      const auth = await requestUpstream(config.base + "/auth/v1/user", { headers: userHeaders, signal: AbortSignal.timeout(5000) });
      if (auth.status === 401 || auth.status === 403) throw new RequestError(401, "Sessão inválida. Entre novamente no painel.");
      if (!auth.ok) throw new Error("Autenticação indisponível");
      const user = await auth.json();
      if (typeof user?.id !== "string" || user.is_anonymous) throw new RequestError(401, "Entre no painel para usar o assistente.");

      let question;
      try {
        question = await readQuestion(request);
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(400, "Escreva uma pergunta de até 400 caracteres, sem telefone, e-mail ou links.");
      }

      // A chave de servidor só autentica a reserva de cota. As leituras usam a sessão do usuário.
      const quotaHeaders: Record<string, string> = { apikey: config.quotaKey, "Content-Type": "application/json" };
      if (!config.quotaKey.startsWith("sb_secret_")) quotaHeaders.Authorization = "Bearer " + config.quotaKey;
      const quota = await requestUpstream(config.base + "/rest/v1/rpc/assistente_bez_reservar_consulta", {
        method: "POST", headers: quotaHeaders, body: JSON.stringify({ p_usuario: user.id }), signal: AbortSignal.timeout(5000)
      });
      if (!quota.ok) throw new Error("Cota indisponível");
      const reservation = await quota.json();
      if (reservation === "minuto") throw new RequestError(429, "Limite por minuto atingido. Tente novamente em instantes.", "60");
      if (reservation === "dia") throw new RequestError(429, "Limite diário atingido. Tente novamente amanhã.");
      if (reservation !== "ok") throw new Error("Cota inválida");

      const today = dateFormatter.format(now());
      const interpretation = await requestUpstream(modelUrl, {
        method: "POST",
        headers: { Authorization: "Bearer " + config.deepseekKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          model: "deepseek-flash", thinking: { type: "disabled" }, temperature: 0, max_tokens: 200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `Interprete perguntas da Agenda em português. Hoje em São Paulo: ${today}.
Retorne somente JSON com modo (agenda, livres, local ou esclarecer), inicio e fim (datas inclusivas AAAA-MM-DD), cidade e bairro (textos ou null).
Use agenda para listar atendimentos e bloqueios, livres para disponibilidade e local para busca por cidade ou bairro.
Se a busca por local vier sem período, use hoje e os seis dias seguintes. Para outras perguntas sem data, ambíguas, sobre alterações, fora da Agenda ou sobre pessoas, use modo esclarecer. Nunca invente nome de local. A consulta pode abranger até 31 dias.` },
            { role: "user", content: question }
          ]
        })
      });
      if (!interpretation.ok) throw new Error("Provedor indisponível");
      const modelResult = await interpretation.json();
      const content = modelResult.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length > 2000) throw new Error("Interpretação inválida");
      const intent = parseIntent(JSON.parse(content));
      if (!intent) return json({ answer: clarification }, 200);

      const { start, end } = intent.range;
      async function readRows(table: string, select: string, filters: Record<string, string> = {}) {
        const query = new URLSearchParams({
          select, inicio_em: "lt." + end, fim_em: "gt." + start,
          order: "inicio_em.asc,id.asc", limit: String(rowLimit + 1), ...filters
        });
        const response = await requestUpstream(config.base + "/rest/v1/" + table + "?" + query, {
          headers: userHeaders, signal: AbortSignal.timeout(7000)
        });
        if (!response.ok) throw new Error("Agenda indisponível");
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Resposta inválida da Agenda");
        if (rows.length > rowLimit) throw new RequestError(400, "Há muitos registros neste período. Consulte um intervalo menor.");
        return rows;
      }
      const [events, blocks] = await Promise.all([
        readRows("agendamentos", intent.mode === "local"
          ? "inicio_em,fim_em,tipo,status,cidade,bairro,clientes(cidade,bairro)"
          : "inicio_em,fim_em,tipo,status", { excluido_em: "is.null", status: "neq.cancelado" }),
        intent.mode === "local" ? [] : readRows("bloqueios_agenda", "inicio_em,fim_em")
      ]);
      return json({ answer: answerAgenda(intent, events, blocks) }, 200);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status, error.retryAfter);
      // Evita registrar a pergunta, o token ou a resposta do provedor.
      return json({ error: "Não foi possível consultar a Agenda agora. Tente novamente." }, 503);
    }
  };
}

if (import.meta.main) {
  const env = (name: string) => Deno.env.get(name) || "";
  const firstKey = (name: string) => {
    try {
      const keys = JSON.parse(env(name) || "{}");
      return keys.default || "";
    } catch {
      return "";
    }
  };
  Deno.serve(createAssistantHandler({
    base: env("SUPABASE_URL"),
    publishable: firstKey("SUPABASE_PUBLISHABLE_KEYS") || env("SUPABASE_ANON_KEY"),
    quotaKey: firstKey("SUPABASE_SECRET_KEYS") || env("SUPABASE_SERVICE_ROLE_KEY"),
    deepseekKey: env("DEEPSEEK_API_KEY"),
    origins: (env("ASSISTENTE_ALLOWED_ORIGINS") || "https://painel.bezclean.com.br").split(",").map(origin => origin.trim())
  }));
}
