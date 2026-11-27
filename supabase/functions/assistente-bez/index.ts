import {
  buildBookingDraft,
  freeWindows,
  parseIntent,
  validateAudioHeader,
  validateSchedulingText
} from "./core.mjs";
import {
  FERRAMENTAS,
  MAX_RODADAS,
  clientesParaRetorno,
  filtrarLocal,
  linkWhatsapp,
  listaAgenda,
  periodo,
  promptSistema,
  resumoAgenda,
  resumoFaturamento,
  resumoOrcamentos,
  termoBusca,
  validarHistorico
} from "./ferramentas.mjs";

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
const bodyLimit = 24 * 1024;
const toolResultLimit = 20000;
const maxLinksPerAnswer = 10;
const totalDeadlineMs = 110000;
const audioBodyLimit = 4 * 1024 * 1024;

/** Erro que vira mensagem para o modelo (ex.: período grande demais), sem derrubar a conversa. */
class ToolError extends Error {}

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
    return { question: validateSchedulingText(payload?.question), history: validarHistorico(payload?.history) };
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
  let history: { role: string; content: string }[] = [];
  const rawHistory = form.get("history");
  if (typeof rawHistory === "string" && rawHistory.length <= bodyLimit) {
    try {
      history = validarHistorico(JSON.parse(rawHistory));
    } catch {
      history = [];
    }
  }
  return { bytes, format, history };
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

      let audioInput: { bytes: Uint8Array; format: { ext: string; mime: string }; history: { role: string; content: string }[] } | null = null;
      let question = "";
      let history: { role: string; content: string }[] = [];
      let transcript: string | null = null;

      if (isMultipart) {
        audioInput = await readAudioPayload(request);
        history = audioInput.history;
      } else {
        try {
          const parsed = await readJsonPayload(request);
          question = parsed.question;
          history = parsed.history;
        } catch (error) {
          if (error instanceof RequestError) throw error;
          throw new RequestError(400, "Escreva uma mensagem de até 600 caracteres, sem e-mail ou links.");
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

      const startedAt = Date.now();
      const nowDate = now();
      const offer40 = typeof user?.user_metadata?.oferta_40 === "boolean" ? user.user_metadata.oferta_40 : true;

      async function rest(path: string) {
        const response = await requestUpstream(config.base + "/rest/v1/" + path, {
          headers: userHeaders, signal: AbortSignal.timeout(7000)
        });
        if (!response.ok) throw new Error("Painel indisponível");
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Resposta inválida do painel");
        return rows;
      }

      // Lê em páginas de 1000 (limite padrão do PostgREST) até maxRows.
      async function restAll(path: string, maxRows = 5000) {
        const all: unknown[] = [];
        for (let offset = 0; offset < maxRows; offset += 1000) {
          const page = await rest(path + "&limit=1000&offset=" + offset);
          all.push(...page);
          if (page.length < 1000) break;
        }
        return all as Record<string, any>[];
      }

      async function readRows(table: string, select: string, startIso: string, endIso: string, filters: Record<string, string> = {}) {
        const query = new URLSearchParams({
          select, inicio_em: "lt." + endIso, fim_em: "gt." + startIso,
          order: "inicio_em.asc,id.asc", limit: String(rowLimit + 1), ...filters
        });
        const rows = await rest(table + "?" + query);
        if (rows.length > rowLimit) throw new ToolError("Há muitos registros neste período. Consulte um intervalo menor.");
        return rows;
      }

      const activeFilter = { excluido_em: "is.null", status: "neq.cancelado" };
      const range = (args: Record<string, any>, maxDays = 31) => {
        try {
          return periodo(args?.inicio, args?.fim, maxDays);
        } catch (error) {
          throw new ToolError((error as Error).message);
        }
      };

      // O que a resposta leva além do texto do modelo.
      let agenda: unknown = null;
      let bookingDraft: unknown = null;
      let draftAnswer: string | null = null;
      const links: { label: string; url: string }[] = [];

      const tools: Record<string, (args: Record<string, any>) => Promise<unknown>> = {
        async ver_agenda(args) {
          const p = range(args);
          const [rawEvents, blocks] = await Promise.all([
            readRows("agendamentos",
              "id,tipo,status,status_pagamento,inicio_em,fim_em,descricao_servico,valor,endereco,cidade,bairro,excluido_em,clientes(nome,telefone,endereco,bairro,cidade),apartamentos(nome)",
              p.start, p.end, activeFilter),
            readRows("bloqueios_agenda", "inicio_em,fim_em,motivo", p.start, p.end)
          ]);
          const local = filtrarLocal(rawEvents, args.cidade, args.bairro);
          const filtered = Boolean(args.cidade || args.bairro);
          agenda = listaAgenda(p, local.eventos, filtered ? [] : blocks);
          return {
            periodo: p.inicio + " a " + p.fim,
            ...resumoAgenda(local.eventos, filtered ? [] : blocks),
            ...(local.semLocal ? { fora_do_filtro_por_falta_de_endereco: local.semLocal } : {})
          };
        },

        async horarios_livres(args) {
          const p = range(args);
          const [events, blocks] = await Promise.all([
            readRows("agendamentos", "inicio_em,fim_em,status,excluido_em", p.start, p.end, activeFilter),
            readRows("bloqueios_agenda", "inicio_em,fim_em", p.start, p.end)
          ]);
          const days: Record<string, string[]> = {};
          for (let t = Date.parse(p.inicio + "T00:00:00Z"); t <= Date.parse(p.fim + "T00:00:00Z"); t += 86400000) {
            const day = new Date(t).toISOString().slice(0, 10);
            days[day] = freeWindows(day, events, blocks).map(w => w.inicio + "–" + w.fim);
          }
          return { janela_considerada: "08:00–18:00", livres_por_dia: days };
        },

        async buscar_clientes(args) {
          const term = termoBusca(args.termo);
          if (!term) throw new ToolError("Informe ao menos 2 letras ou números para buscar.");
          const digits = term.replace(/\D/g, "");
          const like = "*" + term + "*";
          const ors = ["nome.ilike." + like, "bairro.ilike." + like, "cidade.ilike." + like, "telefone.ilike." + like];
          if (digits.length >= 4 && digits !== term) ors.push("telefone.ilike.*" + digits + "*");
          const clients = await rest("clientes?" + new URLSearchParams({
            select: "id,nome,telefone,endereco,bairro,cidade,observacoes",
            arquivado_em: "is.null", or: "(" + ors.join(",") + ")", order: "nome.asc", limit: "15"
          }));
          if (!clients.length) return { clientes: [] };
          const history = await rest("agendamentos?" + new URLSearchParams({
            select: "cliente_id,inicio_em,status,descricao_servico,valor",
            cliente_id: "in.(" + clients.map(c => c.id).join(",") + ")",
            excluido_em: "is.null", order: "inicio_em.desc", limit: "150"
          }));
          return {
            clientes: clients.map(c => ({
              nome: c.nome, telefone: c.telefone || null, endereco: c.endereco || null,
              bairro: c.bairro || null, cidade: c.cidade || null, observacoes: c.observacoes || null,
              ultimos_atendimentos: history.filter(h => h.cliente_id === c.id).slice(0, 5).map(h => ({
                data: String(h.inicio_em).slice(0, 10), status: h.status, servico: h.descricao_servico || null, valor: h.valor
              }))
            }))
          };
        },

        async clientes_para_retorno(args) {
          const months = Number.isInteger(args.meses_min) && args.meses_min >= 1 && args.meses_min <= 36 ? args.meses_min : 6;
          const [clients, events] = await Promise.all([
            restAll("clientes?select=id,nome,telefone,bairro,cidade,arquivado_em&arquivado_em=is.null&order=id.asc", 3000),
            restAll("agendamentos?select=cliente_id,inicio_em,status,descricao_servico,valor,excluido_em&excluido_em=is.null&status=neq.cancelado&order=inicio_em.desc,id.asc", 5000)
          ]);
          const result = clientesParaRetorno(clients, events, nowDate.getTime(), months);
          return { meses_minimos: months, ...result };
        },

        async orcamentos_pendentes() {
          const quotes = await restAll("orcamentos?select=id,status,valor_total,validade_em,created_at,agendamento_id,excluido_em,clientes(nome,telefone),orcamento_itens(nome,quantidade)&excluido_em=is.null&status=in.(rascunho,enviado,aprovado)&order=created_at.desc,id.asc", 2000);
          return resumoOrcamentos(quotes, nowDate.getTime());
        },

        async faturamento(args) {
          const p = range(args, 366);
          const events = await restAll("agendamentos?" + new URLSearchParams({
            select: "id,tipo,status,status_pagamento,valor,inicio_em,excluido_em,agendamento_itens(nome,quantidade,valor_total)",
            and: "(inicio_em.gte." + p.start + ",inicio_em.lt." + p.end + ")",
            excluido_em: "is.null", status: "neq.cancelado", order: "inicio_em.asc,id.asc"
          }), 5000);
          return { periodo: p.inicio + " a " + p.fim, ...resumoFaturamento(events) };
        },

        async tabela_precos(args) {
          const params: Record<string, string> = {
            select: "nome,valor,categoria,tipo", ativo: "eq.true", "tipo": "in.(base,adicional)",
            order: "categoria.asc,nome.asc", limit: "300"
          };
          const term = termoBusca(args.busca);
          if (term) params.nome = "ilike.*" + term + "*";
          const [items, promo] = await Promise.all([
            rest("catalogo_precos?" + new URLSearchParams(params)),
            rest("promocao_precos?select=ativa,percentual,categorias,ate&limit=1").catch(() => [])
          ]);
          return {
            itens: items.map(i => ({ nome: i.nome, valor: i.valor, categoria: i.categoria })),
            oferta_40_em_sofas: offer40,
            promocao: promo[0] || null
          };
        },

        async modelos_mensagem() {
          const models = await rest("modelos_mensagem?select=titulo,chave,conteudo&campanha_id=is.null&order=titulo.asc&limit=30");
          return { modelos: models.map(m => ({ titulo: m.titulo, chave: m.chave, conteudo: String(m.conteudo || "").slice(0, 1200) })) };
        },

        async link_whatsapp(args) {
          if (links.length >= maxLinksPerAnswer) throw new ToolError("Limite de " + maxLinksPerAnswer + " links por resposta.");
          const url = linkWhatsapp(args.telefone, args.mensagem);
          if (!url) throw new ToolError("Telefone inválido ou ausente para " + (args.nome || "este cliente") + ".");
          const name = typeof args.nome === "string" && args.nome.trim() ? args.nome.trim().slice(0, 60) : "cliente";
          links.push({ label: "WhatsApp · " + name, url });
          return { botao_criado: true, observacao: "A equipe abre o WhatsApp e envia; nada foi enviado." };
        },

        async propor_agendamento(args) {
          const intent = parseIntent({ modo: "agendar", agendamento: args });
          if (!intent) throw new ToolError("Dados do agendamento inválidos.");
          const date = intent.booking.data;
          const dayRange = date ? periodo(date, date) : null;
          const [clients, apartments, catalog, dayEvents, dayBlocks] = await Promise.all([
            rest("clientes?select=id,nome,telefone,endereco,bairro,cidade,arquivado_em&arquivado_em=is.null&limit=1000"),
            rest("apartamentos?select=id,nome,edificio,endereco,airbnb,ativo&ativo=eq.true&limit=200"),
            rest("catalogo_precos?select=id,nome,valor,categoria,tipo&ativo=eq.true&tipo=in.(base,adicional)&limit=300"),
            dayRange
              ? readRows("agendamentos", "id,tipo,status,inicio_em,fim_em,excluido_em,clientes(nome),apartamentos(nome,airbnb)", dayRange.start, dayRange.end, activeFilter)
              : [],
            dayRange ? readRows("bloqueios_agenda", "inicio_em,fim_em,motivo", dayRange.start, dayRange.end) : []
          ]);
          const draft = buildBookingDraft(intent, { clients, apartments, catalog, events: dayEvents, blocks: dayBlocks, offer40 });
          bookingDraft = draft.bookingDraft;
          draftAnswer = draft.answer;
          const d = draft.bookingDraft;
          return {
            cartao_exibido: true,
            salvo: false,
            pode_confirmar: d.canConfirm,
            faltando: d.missingFields,
            avisos: d.warnings,
            conflitos: d.conflicts.map((c: { label: string }) => c.label),
            cliente: d.clientStatus === "existing" ? "cadastrado" : d.clientStatus === "new" ? "novo cadastro" : d.clientStatus === "ambiguous" ? "mais de um cliente parecido: a equipe escolhe no cartão" : "não informado",
            servicos: d.descricao_servico,
            valor: d.valor
          };
        }
      };

      async function runTool(name: string, rawArgs: string) {
        const tool = tools[name];
        if (!tool) return { erro: "Ferramenta desconhecida." };
        let args: Record<string, any> = {};
        try {
          args = rawArgs ? JSON.parse(rawArgs) : {};
          if (!args || typeof args !== "object" || Array.isArray(args)) args = {};
        } catch {
          return { erro: "Argumentos inválidos." };
        }
        try {
          const result = await tool(args);
          const text = JSON.stringify(result);
          return text.length > toolResultLimit
            ? { erro: "Resultado grande demais. Refaça com um período ou filtro menor." }
            : result;
        } catch (error) {
          if (error instanceof ToolError) return { erro: error.message };
          return { erro: "Não foi possível ler esses dados agora." };
        }
      }

      async function callModel(messages: unknown[], allowTools: boolean) {
        const remaining = totalDeadlineMs - (Date.now() - startedAt);
        if (remaining < 3000) throw new Error("Tempo esgotado");
        const response = await requestUpstream(modelUrl, {
          method: "POST",
          headers: { Authorization: "Bearer " + config.deepseekKey, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(Math.min(25000, remaining)),
          body: JSON.stringify({
            model: "deepseek-flash", thinking: { type: "disabled" }, temperature: 0.3, max_tokens: 1200,
            messages,
            ...(allowTools ? { tools: FERRAMENTAS, tool_choice: "auto" } : {})
          })
        });
        if (!response.ok) throw new Error("Provedor indisponível");
        const result = await response.json();
        const message = result?.choices?.[0]?.message;
        if (!message || typeof message !== "object") throw new Error("Resposta inválida do provedor");
        return message;
      }

      const messages: any[] = [
        { role: "system", content: promptSistema(nowDate) },
        ...history,
        { role: "user", content: question }
      ];
      let answer = "";
      for (let round = 0; round <= MAX_RODADAS; round++) {
        const message = await callModel(messages, round < MAX_RODADAS);
        const calls = Array.isArray(message.tool_calls) ? message.tool_calls.slice(0, 8) : [];
        if (!calls.length) {
          answer = typeof message.content === "string" ? message.content.trim() : "";
          break;
        }
        messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
        for (const call of calls) {
          const result = await runTool(String(call?.function?.name || ""), String(call?.function?.arguments || ""));
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      answer = answer.slice(0, 4000) || draftAnswer || "Não consegui responder agora. Tente reformular o pedido.";

      return json({
        ...(transcript ? { transcript } : {}),
        answer,
        ...(agenda ? { agenda } : {}),
        ...(bookingDraft ? { bookingDraft } : {}),
        ...(links.length ? { links } : {})
      }, 200);
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
