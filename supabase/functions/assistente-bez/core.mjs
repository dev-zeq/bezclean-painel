export function validateSchedulingText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 600) throw new Error("Mensagem inválida");
  if (/@|https?:\/\/|www\./i.test(text)) throw new Error("Mensagem inválida");
  return text;
}

export function validateAudioHeader(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (view.length < 12) return null;
  const tag = (start, len) => String.fromCharCode(...view.subarray(start, start + len));
  if (tag(0, 4) === "RIFF" && tag(8, 4) === "WAVE") return { ext: "wav", mime: "audio/wav" };
  if (tag(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg" };
  return null;
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

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const types = { estofados: "Estofados", faxina: "Faxina avulsa", apartamento: "Apartamento fixo" };

function locality(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

const cleanStr = (value, maxLen = 160) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed || null;
};

const isValidIsoDate = value =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;

const normalizeTime = value => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
};

const normalizePeriod = value => {
  if (typeof value !== "string") return null;
  const norm = locality(value);
  if (norm === "manha") return "manha";
  if (norm === "tarde") return "tarde";
  if (norm === "dia" || norm === "dia inteiro") return "dia";
  return null;
};

const nonNegNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
};

function parseBookingPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tipo = ["estofados", "faxina", "apartamento"].includes(raw.tipo) ? raw.tipo : null;
  const durRaw = Number(raw.duracao_minutos);
  const duracao_minutos = Number.isFinite(durRaw) && durRaw >= 30 && durRaw <= 540 ? Math.round(durRaw) : null;
  const itens = (Array.isArray(raw.itens) ? raw.itens : [])
    .slice(0, 15)
    .map(item => {
      const nome = cleanStr(item?.nome, 120);
      if (!nome) return null;
      const qtyRaw = Number(item?.quantidade);
      const quantidade = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(50, Math.round(qtyRaw)) : 1;
      return {
        nome,
        quantidade,
        valor_unitario: nonNegNumber(item?.valor_unitario)
      };
    })
    .filter(Boolean);

  return {
    tipo,
    data: isValidIsoDate(raw.data) ? raw.data : null,
    hora_inicio: normalizeTime(raw.hora_inicio),
    hora_fim: normalizeTime(raw.hora_fim),
    periodo: normalizePeriod(raw.periodo),
    duracao_minutos,
    cliente_nome: cleanStr(raw.cliente_nome, 120),
    cliente_telefone: cleanStr(raw.cliente_telefone, 40),
    apartamento_nome: cleanStr(raw.apartamento_nome, 120),
    endereco: cleanStr(raw.endereco, 240),
    cidade: cleanStr(raw.cidade, 80),
    bairro: cleanStr(raw.bairro, 80),
    tipo_limpeza: cleanStr(raw.tipo_limpeza, 120),
    observacoes: cleanStr(raw.observacoes, 400),
    itens,
    valor_total: nonNegNumber(raw.valor_total),
    status: raw.status === "provisorio" ? "provisorio" : "confirmado"
  };
}

export function parseIntent(value) {
  if (!value || value.modo !== "agendar") return null;
  const booking = parseBookingPayload(value.agendamento);
  return booking ? { mode: "agendar", booking } : null;
}

/* ---------- Agendamento assistido ---------- */

const BOOKING_PERIODS = {
  manha: { start: "08:00", end: "12:00" },
  tarde: { start: "13:00", end: "17:00" },
  dia: { start: "08:00", end: "17:00" }
};
const STOP_WORDS = new Set(["de", "do", "da", "dos", "das", "com", "para", "em", "e", "o", "a", "os", "as", "um", "uma", "higienizacao", "limpeza"]);
const PLURAL_MAP = {
  sofas: "sofa", cadeiras: "cadeira", poltronas: "poltrona", colchoes: "colchao",
  modulos: "modulo", modo: "modulo", modos: "modulo",
  lugares: "lugar", tapetes: "tapete", puffs: "puff", pufes: "puff", pufe: "puff",
  cabeceiras: "cabeceira", bancos: "banco", carros: "carro", impermeabilizacoes: "impermeabilizacao",
  camas: "cama", assentos: "assento"
};
const VARIANT_WORDS = new Set(["casal", "solteiro", "queen", "king", "retratil", "canto", "box"]);

function normBasic(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeItem(value) {
  const words = normBasic(value).split(/\s+/).filter(Boolean).map(w => PLURAL_MAP[w] || w);
  return words.filter(w => !STOP_WORDS.has(w));
}

export function isSofaName(name) {
  return /(^|[^a-z])sofas?([^a-z]|$)/.test(normBasic(name));
}

const hhmmToMin = hhmm => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function formatSaoPauloIso(ms) {
  const shifted = new Date(ms - 3 * 3600000);
  const ymd = shifted.toISOString().slice(0, 10);
  const hm = shifted.toISOString().slice(11, 16);
  return { ymd, hm, iso: ymd + "T" + hm + ":00-03:00" };
}

export function combineAddress(base, neighborhood, city) {
  const parts = [];
  const baseNorm = normBasic(base);
  if (base) parts.push(base);
  if (neighborhood && !baseNorm.includes(normBasic(neighborhood))) parts.push(neighborhood);
  if (city && !normBasic(parts.join(" ")).includes(normBasic(city))) parts.push(city);
  return parts.join(", ") || null;
}

export function matchCatalogItem(spokenName, catalog) {
  if (!Array.isArray(catalog) || !catalog.length) return null;
  const spokenNorm = normBasic(spokenName);
  const exact = catalog.find(cat => normBasic(cat.nome) === spokenNorm);
  if (exact) return exact;

  const qTokens = tokenizeItem(spokenName);
  if (!qTokens.length) return null;
  const qSet = new Set(qTokens);
  const qNums = qTokens.filter(t => /^\d+$/.test(t));
  const qVariants = qTokens.filter(t => VARIANT_WORDS.has(t));

  const scored = [];
  for (const cat of catalog) {
    const cTokens = tokenizeItem(cat.nome);
    if (!cTokens.length) continue;
    const cSet = new Set(cTokens);
    const cNums = cTokens.filter(t => /^\d+$/.test(t));
    const cVariants = cTokens.filter(t => VARIANT_WORDS.has(t));

    // Nunca cruzar tamanhos/lugares numéricos diferentes nem exigir adivinhação quando a medida faltou.
    if (qNums.length && cNums.length && !qNums.every(n => cSet.has(n))) continue;
    if (!qNums.length && cNums.length) continue;
    if (qVariants.length && cVariants.length && !qVariants.every(v => cSet.has(v))) continue;
    if (!qVariants.length && cVariants.length) continue;

    let matches = 0;
    for (const token of qSet) {
      if (cSet.has(token)) matches++;
    }
    if (!matches) continue;

    const precision = matches / cSet.size;
    const recall = matches / qSet.size;
    const score = (precision + recall) / 2;
    if (recall >= 0.7 && precision >= 0.5) {
      scored.push({ cat, score, diff: Math.abs(cSet.size - qSet.size) });
    }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || a.diff - b.diff);
  if (scored.length > 1 && Math.abs(scored[0].score - scored[1].score) < 0.01) {
    return null;
  }
  return scored[0].cat;
}

export function matchClients(spokenName, clients) {
  const active = (clients || []).filter(client => !client.arquivado_em);
  const qNorm = normBasic(spokenName);
  if (!qNorm) return { status: "missing", matches: [] };
  const exact = active.filter(client => normBasic(client.nome) === qNorm);
  if (exact.length === 1) return { status: "existing", matches: exact };
  if (exact.length > 1) return { status: "ambiguous", matches: exact.slice(0, 5) };

  const qTokens = qNorm.split(/\s+/).filter(Boolean);
  const matches = active.filter(client => {
    const cNorm = normBasic(client.nome);
    const cTokens = cNorm.split(/\s+/).filter(Boolean);
    return qTokens.every(qt => cTokens.includes(qt)) || (cTokens.length >= 2 && cTokens.every(ct => qTokens.includes(ct)));
  });
  if (matches.length === 1 && qTokens.length >= 2) return { status: "existing", matches };
  if (matches.length >= 1) return { status: "ambiguous", matches: matches.slice(0, 5) };
  return { status: "new", matches: [] };
}

function matchApartments(spokenName, apartments) {
  const active = (apartments || []).filter(apt => apt.ativo !== false);
  const qNorm = normBasic(spokenName);
  if (!qNorm) return [];
  const exact = active.filter(apt => normBasic(apt.nome) === qNorm || normBasic(apt.nome + " " + (apt.edificio || "")) === qNorm);
  if (exact.length) return exact.slice(0, 5);
  const qTokens = qNorm.split(/\s+/).filter(Boolean);
  return active.filter(apt => {
    const full = normBasic([apt.nome, apt.edificio].filter(Boolean).join(" "));
    return qTokens.every(token => full.includes(token));
  }).slice(0, 5);
}

export function findDraftConflicts(inicioEm, fimEm, events, blocks) {
  if (!inicioEm || !fimEm) return [];
  const start = Date.parse(inicioEm), end = Date.parse(fimEm);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const found = [];
  for (const event of events || []) {
    if (event.status === "cancelado" || event.excluido_em) continue;
    const s = Date.parse(event.inicio_em), e = Date.parse(event.fim_em);
    if (Number.isFinite(s) && Number.isFinite(e) && start < e && s < end) {
      const name = (event.tipo === "apartamento" && event.apartamentos?.nome) || event.clientes?.nome || event.apartamentos?.nome || "Cliente";
      found.push({
        kind: "event",
        inicio_em: event.inicio_em,
        fim_em: event.fim_em,
        label: timeFormat.format(s) + "–" + timeFormat.format(e) + " · " + name + " (" + (types[event.tipo] || "Atendimento") + ")"
      });
    }
  }
  for (const block of blocks || []) {
    const s = Date.parse(block.inicio_em), e = Date.parse(block.fim_em);
    if (Number.isFinite(s) && Number.isFinite(e) && start < e && s < end) {
      found.push({
        kind: "block",
        inicio_em: block.inicio_em,
        fim_em: block.fim_em,
        label: timeFormat.format(s) + "–" + timeFormat.format(e) + " · Horário bloqueado" + (block.motivo ? " (" + block.motivo + ")" : "")
      });
    }
  }
  return found.sort((a, b) => Date.parse(a.inicio_em) - Date.parse(b.inicio_em));
}

export function buildBookingDraft(intent, context = {}) {
  const b = intent?.booking || {};
  const clients = context.clients || [];
  const apartments = context.apartments || [];
  const catalog = context.catalog || [];
  const events = context.events || [];
  const blocks = context.blocks || [];
  const offer40 = context.offer40 !== false;

  const missingFields = [];
  const warnings = [];

  // 1. Tipo de atendimento
  const matchedApts = b.apartamento_nome ? matchApartments(b.apartamento_nome, apartments) : [];
  let tipo = b.tipo;
  if (!tipo) {
    if (b.apartamento_nome || matchedApts.length) tipo = "apartamento";
    else if (Array.isArray(b.itens) && b.itens.length) tipo = "estofados";
    else if (b.tipo_limpeza) tipo = "faxina";
    else tipo = "estofados";
  }

  // 2. Data e horário
  const data = b.data || null;
  let period = b.periodo || "custom";
  let hora_inicio = b.hora_inicio || null;
  let hora_fim = b.hora_fim || null;
  let duracao_minutos = b.duracao_minutos || null;
  let usedDefaultDuration = false;
  let inicio_em = null;
  let fim_em = null;

  if (!data) missingFields.push("Data");
  if (hora_inicio) {
    const startMin = hhmmToMin(hora_inicio);
    if (hora_fim && hhmmToMin(hora_fim) > startMin) {
      duracao_minutos = hhmmToMin(hora_fim) - startMin;
    } else {
      if (!duracao_minutos) {
        duracao_minutos = 120;
        usedDefaultDuration = true;
      }
    }
    const baseYmd = data || "2000-01-01";
    const startMs = Date.parse(baseYmd + "T" + hora_inicio + ":00-03:00");
    const endFmt = formatSaoPauloIso(startMs + duracao_minutos * 60000);
    hora_fim = endFmt.hm;
    const presetPeriod = Object.keys(BOOKING_PERIODS).find(id =>
      BOOKING_PERIODS[id].start === hora_inicio && BOOKING_PERIODS[id].end === hora_fim
    );
    period = presetPeriod || "custom";
    if (data) {
      inicio_em = data + "T" + hora_inicio + ":00-03:00";
      fim_em = endFmt.iso;
    }
  } else if (period && BOOKING_PERIODS[period]) {
    hora_inicio = BOOKING_PERIODS[period].start;
    hora_fim = BOOKING_PERIODS[period].end;
    duracao_minutos = hhmmToMin(hora_fim) - hhmmToMin(hora_inicio);
    if (data) {
      inicio_em = data + "T" + hora_inicio + ":00-03:00";
      fim_em = data + "T" + hora_fim + ":00-03:00";
    }
  } else {
    period = "custom";
    missingFields.push("Horário");
  }

  // 3. Cliente ou apartamento
  let cliente_id = null;
  let cliente_nome = b.cliente_nome || null;
  let cliente_telefone = b.cliente_telefone || "";
  let clientStatus = "missing";
  let clientCandidates = [];
  let newClient = null;
  let matchedClientRecord = null;

  let apartamento_id = null;
  let apartamento_nome = b.apartamento_nome || null;
  let apartmentCandidates = [];
  let matchedApartmentRecord = null;

  if (tipo === "apartamento") {
    if (matchedApts.length === 1) {
      matchedApartmentRecord = matchedApts[0];
      apartamento_id = matchedApartmentRecord.id;
      apartamento_nome = matchedApartmentRecord.nome + (matchedApartmentRecord.edificio ? " · " + matchedApartmentRecord.edificio : "");
    } else if (matchedApts.length > 1) {
      apartmentCandidates = matchedApts.map(a => ({
        id: a.id,
        nome: a.nome,
        edificio: a.edificio || null,
        endereco: [a.edificio, a.endereco].filter(Boolean).join(" · ") || null,
        airbnb: Boolean(a.airbnb)
      }));
    } else {
      missingFields.push("Apartamento");
    }
  } else {
    const clientMatch = matchClients(b.cliente_nome, clients);
    clientStatus = clientMatch.status;
    if (clientStatus === "existing") {
      matchedClientRecord = clientMatch.matches[0];
      cliente_id = matchedClientRecord.id;
      cliente_nome = matchedClientRecord.nome;
      cliente_telefone = matchedClientRecord.telefone || b.cliente_telefone || "";
    } else if (clientStatus === "ambiguous") {
      clientCandidates = clientMatch.matches.map(c => ({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone || "",
        endereco: combineAddress(c.endereco, c.bairro, c.cidade)
      }));
      clientCandidates.push({
        id: "__new__",
        nome: b.cliente_nome,
        telefone: b.cliente_telefone || "",
        endereco: null,
        isNew: true
      });
    } else if (clientStatus === "new") {
      newClient = {
        nome: b.cliente_nome,
        telefone: b.cliente_telefone || ""
      };
    } else {
      missingFields.push("Nome do cliente");
    }
  }

  // 4. Endereço
  let endereco = combineAddress(b.endereco, b.bairro, b.cidade);
  if (!endereco && matchedClientRecord) {
    endereco = combineAddress(matchedClientRecord.endereco, matchedClientRecord.bairro, matchedClientRecord.cidade);
  }
  if (!endereco && matchedApartmentRecord) {
    endereco = [matchedApartmentRecord.edificio, matchedApartmentRecord.endereco].filter(Boolean).join(" · ") || null;
  }

  // 5. Serviços e valores (sem nunca inventar preços)
  let items = [];
  let descricao_servico = "";
  let valor = null;
  let hasMissingPrices = false;

  if (tipo === "estofados") {
    items = (b.itens || []).map(item => {
      const cat = matchCatalogItem(item.nome, catalog);
      const nome = cat ? cat.nome : item.nome;
      const unit = item.valor_unitario != null ? item.valor_unitario : (cat && Number.isFinite(Number(cat.valor)) ? Number(cat.valor) : null);
      const valor_original = offer40 && isSofaName(nome) && Number.isFinite(unit) && unit > 0
        ? Math.round((unit / 0.6) * 100) / 100
        : null;
      const valor_total = Number.isFinite(unit) ? Math.round(unit * item.quantidade * 100) / 100 : null;
      return {
        catalogo_preco_id: cat ? cat.id : null,
        nome,
        quantidade: item.quantidade,
        valor_unitario: unit,
        valor_original,
        valor_total,
        matchedFromCatalog: Boolean(cat),
        observacoes: null
      };
    });
    hasMissingPrices = items.some(item => item.valor_unitario === null);
    if (!items.length) {
      missingFields.push("Serviços");
    } else {
      descricao_servico = items.map(item => (item.quantidade > 1 ? item.quantidade + "× " : "") + item.nome).join(" + ");
      if (!hasMissingPrices) {
        valor = Math.round(items.reduce((sum, item) => sum + item.valor_total, 0) * 100) / 100;
      } else if (b.valor_total != null) {
        valor = b.valor_total;
      }
    }
    if (hasMissingPrices) {
      warnings.push("Alguns itens não foram encontrados com preço na tabela. Informe o valor unitário antes de confirmar.");
    }
  } else if (tipo === "apartamento") {
    descricao_servico = b.tipo_limpeza || (matchedApartmentRecord?.airbnb ? "Troca de hóspede (Airbnb)" : "Limpeza de saída (check-out)");
    valor = b.valor_total != null ? b.valor_total : 0;
  } else {
    descricao_servico = b.tipo_limpeza || "Faxina residencial";
    valor = b.valor_total != null ? b.valor_total : 0;
  }

  if (usedDefaultDuration && inicio_em) {
    warnings.push("Duração padrão de 2 horas aplicada (não informada na fala).");
  }

  // 6. Conflitos
  const conflicts = findDraftConflicts(inicio_em, fim_em, events, blocks);

  const clientReady = tipo === "apartamento"
    ? Boolean(apartamento_id)
    : (Boolean(cliente_id) || clientStatus === "new");
  const canConfirm = missingFields.length === 0 && !hasMissingPrices && clientReady;

  const summaryParts = ["Confira os dados do agendamento antes de salvar:"];
  if (missingFields.length) {
    summaryParts.push("Faltou informar: " + missingFields.join(", ") + ".");
  }

  return {
    answer: summaryParts.join("\n"),
    bookingDraft: {
      tipo,
      status: b.status || "confirmado",
      data,
      period,
      hora_inicio,
      hora_fim,
      duracao_minutos,
      usedDefaultDuration,
      inicio_em,
      fim_em,
      cliente_id,
      cliente_nome,
      cliente_telefone,
      clientStatus,
      clientCandidates,
      newClient,
      apartamento_id,
      apartamento_nome,
      apartmentCandidates,
      endereco,
      cidade: b.cidade || null,
      bairro: b.bairro || null,
      descricao_servico,
      items,
      valor,
      observacoes: b.observacoes || null,
      offer40,
      hasMissingPrices,
      missingFields,
      warnings,
      conflicts,
      canConfirm
    }
  };
}
