import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createAssistantHandler } from "../supabase/functions/assistente-bez/index.ts";

const repo = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
const port = Number(process.env.BEZ_PREVIEW_PORT || 8126);
const origin = "http://" + host + ":" + port;
const owner = "00000000-0000-4000-8000-000000000001";
const dateKey = date => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
const today = dateKey(new Date());
const tomorrow = dateKey(new Date(Date.now() + 86400000));
const slot = (day, time) => new Date(day + "T" + time + ":00-03:00").toISOString();
const client = { id: "cliente-teste", nome: "Cliente de teste", telefone: "47999990000", cidade: "Itapema", bairro: "Centro" };
const apartment = { id: "apartamento-teste", nome: "Apartamento de teste", edificio: "Edifício de teste", ativo: true, airbnb: true };
const created = (id, day, start, end, extra = {}) => ({
  id, inicio_em: slot(day, start), fim_em: slot(day, end), descricao_servico: "Limpeza de teste",
  status: "confirmado", valor: 180, tipo: "faxina", cliente_id: client.id, ...extra
});
const records = {
  agendamentos: [
    created("atendimento-teste", today, "09:00", "10:30"),
    created("apartamento-reserva", tomorrow, "11:30", "13:00", { tipo: "apartamento", apartamento_id: apartment.id, cliente_id: null }),
    created("cancelado-teste", today, "16:00", "17:00", { status: "cancelado" }),
    created("lixeira-teste", today, "17:00", "18:00", { excluido_em: slot(today, "18:00") })
  ],
  bloqueios_agenda: [{ id: "bloqueio-teste", inicio_em: slot(today, "14:00"), fim_em: slot(today, "15:00"), motivo: "Compromisso de teste" }],
  clientes: [client], apartamentos: [apartment], agendamento_itens: [],
  catalogo_precos: [{ id: "servico-teste", nome: "Sofá de teste", valor: 120, categoria: "sofa", tipo: "base", ativo: true }]
};

const to64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const user = { id: owner, aud: "authenticated", role: "authenticated", email: "teste@example.test", app_metadata: {}, user_metadata: {} };
const expires = Math.floor(Date.now() / 1000) + 86400;
const token = [to64({ alg: "HS256", typ: "JWT" }), to64({ sub: owner, role: "authenticated", exp: expires }), "c2ltdWxhZG8"].join(".");
const session = { access_token: token, refresh_token: "preview-refresh", expires_at: expires, expires_in: 86400, token_type: "bearer", user };
let quotaDay = today, quotaMinute = 0, dayUses = 0, minuteUses = 0;

function matches(row, query) {
  return [...query].every(([key, term]) => {
    const [op, value] = term.split(/\.(.*)/s);
    if (op === "eq") return String(row[key]) === value;
    if (op === "neq") return String(row[key]) !== value;
    if (op === "lt") return Date.parse(row[key]) < Date.parse(value);
    if (op === "gt") return Date.parse(row[key]) > Date.parse(value);
    if (op === "is") return row[key] == null;
    if (op === "not") return row[key] != null;
    if (op === "in") return value.slice(1, -1).split(",").includes(String(row[key]));
    return true;
  });
}

function enrich(table, row) {
  if (table !== "agendamentos") return row;
  return { ...row,
    clientes: records.clientes.find(c => c.id === row.cliente_id) || null,
    apartamentos: records.apartamentos.find(a => a.id === row.apartamento_id) || null,
    agendamento_itens: records.agendamento_itens.filter(item => item.agendamento_id === row.id)
  };
}

const reserved = createAssistantHandler(
  { base: origin, publishable: "sb_publishable_preview", quotaKey: "sb_secret_preview", deepseekKey: "preview-only", origins: [origin] },
  (url, options) => {
    if (url.startsWith(origin + "/")) return fetch(url, options);
    const question = JSON.parse(options.body).messages[1].content.toLowerCase();
    const date = question.includes("amanhã") ? tomorrow : today;
    const place = question.includes("itapema") || question.includes("centro");
    const modo = place ? "local" : /livre|dispon/.test(question) ? "livres" : /hoje|amanhã/.test(question) ? "agenda" : "esclarecer";
    const interpretation = {
      modo, inicio: date, fim: date,
      cidade: question.includes("itapema") ? "Itapema" : null,
      bairro: question.includes("centro") ? "Centro" : null
    };
    return Response.json({ choices: [{ message: { content: JSON.stringify(interpretation) } }] });
  }
);

async function api(request, url) {
  const path = url.pathname;
  if (path === "/functions/v1/assistente-bez") return reserved(request);
  if (path === "/auth/v1/token" && request.method === "POST") return Response.json(session);
  if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (path === "/auth/v1/user") return request.headers.get("authorization") === "Bearer " + token
    ? Response.json(user) : Response.json({ message: "Sessão simulada inválida" }, { status: 401 });
  if (path === "/rest/v1/rpc/assistente_bez_reservar_consulta") {
    if (request.headers.get("apikey") !== "sb_secret_preview") return new Response(null, { status: 403 });
    const now = new Date(), currentDay = dateKey(now), currentMinute = Math.floor(now.getTime() / 60000);
    if (currentDay !== quotaDay) { quotaDay = currentDay; dayUses = 0; }
    if (currentMinute !== quotaMinute) { quotaMinute = currentMinute; minuteUses = 0; }
    if (dayUses >= 30) return Response.json("dia");
    if (minuteUses >= 5) return Response.json("minuto");
    dayUses++;
    minuteUses++;
    return Response.json("ok");
  }
  if (request.headers.get("authorization") !== "Bearer " + token) return new Response(null, { status: 401 });
  if (path === "/rest/v1/rpc/agendamento_excluir" || path === "/rest/v1/rpc/agendamento_restaurar") {
    const { p_id } = await request.json();
    const record = records.agendamentos.find(item => item.id === p_id);
    if (!record) return new Response(null, { status: 404 });
    record.excluido_em = path.endsWith("excluir") ? new Date().toISOString() : null;
    return new Response(null, { status: 204 });
  }
  const table = path.split("/").pop();
  if (!Object.hasOwn(records, table)) return new Response(null, { status: 404 });
  let rows = records[table].filter(row => matches(row, url.searchParams));
  if (request.method === "POST") {
    const payload = await request.json();
    rows = [payload].flat().map(row => ({ id: randomUUID(), ...row }));
    records[table].push(...rows);
  }
  if (request.method === "PATCH") {
    const payload = await request.json();
    rows.forEach(row => Object.assign(row, payload));
  }
  if (request.method === "DELETE") records[table] = records[table].filter(row => !rows.includes(row));
  if (!url.searchParams.has("select")) return new Response(null, { status: 204 });
  rows = rows.map(row => enrich(table, row)).slice(0, Number(url.searchParams.get("limit") || rows.length));
  return Response.json(request.headers.get("accept")?.includes("vnd.pgrst.object") ? rows[0] || null : rows);
}

async function staticFile(path) {
  const name = path === "/" ? "/index.html" : path;
  const file = resolve(repo, "." + name);
  if (!file.startsWith(repo + sep) || !/^\/(index\.html$|(assets|proposta-agenda)\/)/.test(name)) {
    return new Response("Prévia local da Agenda", { status: 404 });
  }
  const content = await readFile(file, "utf8");
  const html = name.endsWith(".html");
  let body = content;
  if (html) {
    body = body.replace(/<script src="\/pwa\.js[^"]*"><\/script>/, "")
      .replace('<h1>Entrar no painel</h1>', '<h1>Entrar na prévia</h1><p>Use teste@example.test e a senha agenda-teste.</p>')
      .replace('<div class="page" id="agenda">', '<div class="page" id="agenda"><p role="note">Prévia local com dados fictícios. Alterações são descartadas ao reiniciar.</p>');
    if (process.env.BEZ_PREVIEW_SDK) body = body.replace("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", "/preview-supabase.js");
  }
  if (name === "/assets/js/app.js") {
    const rewritten = body.replace(/window\.supabase\.createClient\("[^"]+","[^"]+"\)/, 'window.supabase.createClient(location.origin,"sb_publishable_preview")');
    if (rewritten === body) throw new Error("Configuração da prévia não aplicada");
    body = rewritten;
  }
  return new Response(body, { headers: { "Content-Type": (html ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript") + "; charset=utf-8" } });
}

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin);
    let response;
    if (url.pathname === "/preview-supabase.js" && process.env.BEZ_PREVIEW_SDK) {
      response = new Response(await readFile(process.env.BEZ_PREVIEW_SDK), { headers: { "Content-Type": "text/javascript" } });
    } else if (/^\/(auth|rest|functions)\/v1\//.test(url.pathname)) {
      const body = ["GET", "HEAD"].includes(incoming.method) ? null : incoming;
      response = await api(new Request(url, { method: incoming.method, headers: incoming.headers, body, duplex: "half" }), url);
    } else {
      response = await staticFile(url.pathname);
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(error.code === "ENOENT" ? 404 : 500).end();
    if (error.code !== "ENOENT") process.stderr.write(error.message + "\n");
  }
}).listen(port, host, () => process.stdout.write("Prévia da Agenda disponível em " + origin + "\n"));
