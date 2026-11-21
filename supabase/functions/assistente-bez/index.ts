import {
  answerAgenda,
  buildBookingDraft,
  parseIntent,
  parseRange,
  validateAudioHeader,
  validateQuestion,
  validateSchedulingText
} from "./core.mjs";

type Config = {
  base: string;
  publishable: string;
  quotaKey: string;
  deepseekKey: string;
  origins: string[];
};
const modelUrl = "https://api.deepseek.com/chat/completions";
const asrUrl = "https://api.deepseek.com/v1/tools/asr";
const rowLimit = 200;
const bodyLimit = 4096;
const audioBodyLimit = 4 * 1024 * 1024;
const clarification = "Informe o dia ou período (até 31 dias) e se quer ver os atendimentos, os horários livres ou buscar por cidade ou bairro. Para agendar, diga ou escreva os serviços, data, horário e nome do cliente.";
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });

class RequestError extends Error {
  status: number;
  retryAfter?: string;
  constructor(status: number, message: string, retryAfter?: string) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function readJsonPayload(request: Request) {
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
    const payload = JSON.parse(text + decoder.decode());
    const allowScheduling = Boolean(payload?.allowScheduling);
    const question = allowScheduling
      ? validateSchedulingText(payload?.question)
      : validateQuestion(payload?.question);
    return { question, allowScheduling };
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readAudioPayload(request: Request) {
  const lengthHeader = Number(request.headers.get("content-length") || 0);
  if (lengthHeader > audioBodyLimit + 8192) {
    throw new RequestError(413, "O áudio é muito grande (máximo 4 MB).");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new RequestError(400, "Não foi possível ler o áudio enviado.");
  }
  const audio = form.get("audio");
  if (!audio || typeof audio !== "object" || typeof (audio as Blob).arrayBuffer !== "function") {
    throw new RequestError(400, "Envie um arquivo de áudio válido.");
  }
  const bytes = new Uint8Array(await (audio as Blob).arrayBuffer());
  if (bytes.byteLength > audioBodyLimit) {
    throw new RequestError(413, "O áudio é muito grande (máximo 4 MB).");
  }
  const format = validateAudioHeader(bytes);
  if (!format || bytes.byteLength <= 44) {
    throw new RequestError(400, "Formato de áudio inválido. Envie áudio WAV ou Ogg.");
  }
  return { bytes, format };
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

      const contentType = (request.headers.get("content-type") || "").toLowerCase();
      const isMultipart = contentType.includes("multipart/form-data");

      let audioInput: { bytes: Uint8Array; format: { ext: string; mime: string } } | null = null;
      let question = "";
      let transcript: string | null = null;

      if (isMultipart) {
        audioInput = await readAudioPayload(request);
      } else {
        try {
          const parsed = await readJsonPayload(request);
          question = parsed.question;
        } catch (error) {
          if (error instanceof RequestError) throw error;
          throw new RequestError(400, "Escreva uma pergunta de até 400 caracteres, sem telefone, e-mail ou links.");
        }
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

      if (audioInput) {
        const asrForm = new FormData();
        asrForm.append(
          "file",
          new Blob([audioInput.bytes.slice().buffer], { type: audioInput.format.mime }),
          "audio." + audioInput.format.ext
        );
        const asrResponse = await requestUpstream(asrUrl, {
          method: "POST",
          headers: { Authorization: "Bearer " + config.deepseekKey },
          body: asrForm,
          signal: AbortSignal.timeout(20000)
        });
        if (!asrResponse.ok) throw new Error("Transcrição indisponível");
        const asrResult = await asrResponse.json();
        const rawTranscript = typeof asrResult?.text === "string" ? asrResult.text.trim() : "";
        if (!rawTranscript) {
          return json({
            transcript: "",
            answer: "Não consegui entender o áudio. Tente falar mais perto do microfone e sem ruído."
          }, 200);
        }
        try {
          question = validateSchedulingText(rawTranscript);
        } catch {
          throw new RequestError(400, "O áudio transcrito excedeu o limite ou trouxe endereço de site não permitido.");
        }
        transcript = question;
      }

      const nowDate = now();
      const today = dateFormatter.format(nowDate);
      const weekday = weekdayFormatter.format(nowDate);
      const interpretation = await requestUpstream(modelUrl, {
        method: "POST",
        headers: { Authorization: "Bearer " + config.deepseekKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          model: "deepseek-flash", thinking: { type: "disabled" }, temperature: 0, max_tokens: 450,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `Interprete mensagens da Agenda Bez Clean em português. Hoje em São Paulo: ${today} (${weekday}).
Retorne somente JSON com campo "modo": "agenda", "livres", "local", "agendar" ou "esclarecer".
- Para consultas ("agenda", "livres", "local"): inclua "inicio" e "fim" (AAAA-MM-DD inclusivas, até 31 dias), "cidade" e "bairro" (textos ou null). Use "agenda" para listar compromissos e bloqueios, "livres" para disponibilidade e "local" para cidade/bairro (sem período, use hoje e os 6 dias seguintes).
- Para pedido ou comando de agendamento ("agendar"): inclua "agendamento" com:
  "tipo" ("estofados"|"faxina"|"apartamento"|null),
  "data" (AAAA-MM-DD|null),
  "hora_inicio" (HH:MM|null), "hora_fim" (HH:MM|null), "periodo" ("manha"|"tarde"|"dia"|null), "duracao_minutos" (inteiro|null),
  "cliente_nome" (texto|null), "cliente_telefone" (texto|null), "apartamento_nome" (texto|null),
  "endereco" (texto|null), "cidade" (texto|null), "bairro" (texto|null),
  "tipo_limpeza" (texto|null), "observacoes" (texto|null),
  "itens": [{"nome": texto, "quantidade": inteiro, "valor_unitario": numero|null}],
  "valor_total" (numero|null), "status" ("confirmado"|"provisorio").
Nunca invente preços, datas, horários ou nomes não ditos pelo usuário; use null quando ausente. Se for ambíguo ou fora da Agenda, use "esclarecer".` },
            { role: "user", content: question }
          ]
        })
      });
      if (!interpretation.ok) throw new Error("Provedor indisponível");
      const modelResult = await interpretation.json();
      const content = modelResult.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length > 3000) throw new Error("Interpretação inválida");
      const intent = parseIntent(JSON.parse(content));
      if (!intent) return json({ ...(transcript ? { transcript } : {}), answer: clarification }, 200);

      async function readRows(table: string, select: string, startIso: string, endIso: string, filters: Record<string, string> = {}) {
        const query = new URLSearchParams({
          select, inicio_em: "lt." + endIso, fim_em: "gt." + startIso,
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

      async function readCatalogTable(path: string) {
        const response = await requestUpstream(config.base + "/rest/v1/" + path, {
          headers: userHeaders, signal: AbortSignal.timeout(7000)
        });
        if (!response.ok) throw new Error("Agenda indisponível");
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Resposta inválida da Agenda");
        return rows;
      }

      if (intent.mode === "agendar") {
        const conflictRange = intent.booking.data ? parseRange(intent.booking.data, intent.booking.data) : null;
        const [clients, apartments, catalog, dayEvents, dayBlocks] = await Promise.all([
          readCatalogTable("clientes?select=id,nome,telefone,endereco,bairro,cidade,arquivado_em&arquivado_em=is.null&limit=500"),
          readCatalogTable("apartamentos?select=id,nome,edificio,endereco,airbnb,ativo&ativo=eq.true&limit=200"),
          readCatalogTable("catalogo_precos?select=id,nome,valor,categoria,tipo&ativo=eq.true&tipo=in.(base,adicional)&limit=300"),
          conflictRange
            ? readRows("agendamentos", "id,tipo,status,inicio_em,fim_em,excluido_em,clientes(nome),apartamentos(nome,airbnb)", conflictRange.start, conflictRange.end, { excluido_em: "is.null", status: "neq.cancelado" })
            : [],
          conflictRange
            ? readRows("bloqueios_agenda", "inicio_em,fim_em,motivo", conflictRange.start, conflictRange.end)
            : []
        ]);
        const offer40 = typeof user?.user_metadata?.oferta_40 === "boolean" ? user.user_metadata.oferta_40 : true;
        const draftResponse = buildBookingDraft(intent, {
          clients,
          apartments,
          catalog,
          events: dayEvents,
          blocks: dayBlocks,
          offer40
        });
        return json({ ...(transcript ? { transcript } : {}), ...draftResponse }, 200);
      }

      const { start, end } = intent.range;
      const [events, blocks] = await Promise.all([
        readRows("agendamentos", intent.mode === "local"
          ? "id,inicio_em,fim_em,tipo,status,cidade,bairro,clientes(cidade,bairro)"
          : intent.mode === "agenda" ? "id,inicio_em,fim_em,tipo,status" : "inicio_em,fim_em,tipo,status",
        start, end, { excluido_em: "is.null", status: "neq.cancelado" }),
        intent.mode === "local" ? [] : readRows("bloqueios_agenda", "inicio_em,fim_em", start, end)
      ]);
      return json({ ...(transcript ? { transcript } : {}), ...answerAgenda(intent, events, blocks) }, 200);
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
