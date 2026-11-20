export function parseRange(start, end) {
  const valid = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end)) throw new Error('Datas inválidas');
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z');
  if (b < a || b - a > 30 * 86400000) throw new Error('Período inválido: máximo de 31 dias');
  return { start: start + 'T00:00:00-03:00', end: new Date(b + 86400000).toISOString().slice(0, 10) + 'T00:00:00-03:00' };
}

export function validateQuestion(value) {
  const question = typeof value === "string" ? value.trim() : "";
  if (!question || question.length > 400) throw new Error("Pergunta inválida");
  const withoutDates = question.replace(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/g, " ");
  if (/@|https?:\/\/|www\.|(?:\d[ .()+-]*){8,}/i.test(withoutDates)) throw new Error("Pergunta inválida");
  return question;
}

export function freeWindows(day, events, blocks, startHour = 8, endHour = 18) {
  const base = Date.parse(day + 'T00:00:00-03:00');
  const from = base + startHour * 3600000, to = base + endHour * 3600000;
  const occupied = [...events.filter(e => e.status !== 'cancelado' && !e.excluido_em), ...blocks]
    .map(e => [Math.max(from, Date.parse(e.inicio_em)), Math.min(to, Date.parse(e.fim_em))])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  let cursor = from;
  const free = [];
  for (const [a, b] of occupied) {
    if (a > cursor) free.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) free.push([cursor, to]);
  const fmt = t => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
  return free.filter(([a, b]) => b - a >= 30 * 60000).map(([a, b]) => ({ inicio: fmt(a), fim: fmt(b) }));
}

const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateLabel = value => value.slice(0, 10).split("-").reverse().join("/");
const types = { estofados: "Estofados", faxina: "Faxina avulsa", apartamento: "Apartamento fixo" };
const statuses = {
  provisorio: "a confirmar", agendado: "agendado", confirmado: "confirmado",
  em_andamento: "em andamento", concluido: "concluído"
};

function daysInRange(inicio, fim) {
  const days = [];
  for (let current = Date.parse(inicio + "T00:00:00Z"); current <= Date.parse(fim + "T00:00:00Z"); current += 86400000) {
    days.push(new Date(current).toISOString().slice(0, 10));
  }
  return days;
}

function locality(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseIntent(value) {
  if (!value || !["agenda", "livres", "local"].includes(value.modo)) return null;
  const { modo: mode, inicio, fim } = value;
  let range;
  try {
    range = parseRange(inicio, fim);
  } catch {
    return null;
  }
  const city = locality(value.cidade);
  const neighborhood = locality(value.bairro);
  const validLocality = text => text.length <= 80 && /^[\p{L}0-9.'’ -]*$/u.test(text);
  if (mode === "local" && (!(city || neighborhood) || !validLocality(city) || !validLocality(neighborhood))) return null;
  return { mode, range, inicio, fim, city, neighborhood };
}

export function answerAgenda(intent, events, blocks) {
  const period = intent.inicio === intent.fim ? dateLabel(intent.inicio) : dateLabel(intent.inicio) + " a " + dateLabel(intent.fim);
  const activeEvents = events.filter(event => event.status !== "cancelado" && !event.excluido_em);
  const dayTimes = (start, end) => {
    const startDay = dateFormat.format(new Date(start)), endDay = dateFormat.format(new Date(end));
    return dateLabel(startDay) + " " + timeFormat.format(new Date(start)) + "–" +
      (startDay === endDay ? "" : dateLabel(endDay) + " ") + timeFormat.format(new Date(end));
  };
  if (intent.mode === "livres") {
    const lines = daysInRange(intent.inicio, intent.fim).map(day => {
      const windows = freeWindows(day, activeEvents, blocks);
      return dateLabel(day) + " · " + (windows.length
        ? windows.slice(0, 4).map(slot => slot.inicio + "–" + slot.fim).join(", ") +
          (windows.length > 4 ? " (mais " + (windows.length - 4) + ")" : "")
        : "Nenhuma janela de pelo menos 30 minutos");
    });
    return "Horários livres estimados entre 08h e 18h, sem considerar deslocamentos.\n\n" + lines.join("\n");
  }
  let missingLocality = 0;
  const matching = intent.mode === "local" ? activeEvents.filter(event => {
    const fields = [
      [intent.city, locality(event.cidade) || locality(event.clientes?.cidade)],
      [intent.neighborhood, locality(event.bairro) || locality(event.clientes?.bairro)]
    ];
    if (fields.some(([wanted, actual]) => wanted && actual && wanted !== actual)) return false;
    if (fields.some(([wanted, actual]) => wanted && !actual)) {
      missingLocality++;
      return false;
    }
    return true;
  }) : activeEvents;
  const localityNote = missingLocality ? "\n\nAtendimentos com localidade incompleta para esta busca: " + missingLocality + "." : "";
  const records = matching.map(event => ({
    start: event.inicio_em, end: event.fim_em,
    label: [types[event.tipo] || "Atendimento", statuses[event.status]].filter(Boolean).join(" · ")
  })).concat(blocks.map(block => ({ start: block.inicio_em, end: block.fim_em, label: "Bloqueado" })));
  records.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!records.length) return "Nenhum registro encontrado para " + period + "." + localityNote;
  const lines = records.slice(0, 20).map(record => dayTimes(record.start, record.end) + " · " + record.label);
  return period + "\n\n" + lines.join("\n") +
    (records.length > 20 ? "\n\nExibindo 20 de " + records.length + " registros. Consulte um período menor para ver os demais." : "") + localityNote;
}
