// Cartões de ação do Assistente Bez (lógica pura, testada em Node).
// O servidor valida os dados e monta o cartão; quem grava é o navegador,
// com a sessão da equipe, e só depois do toque em "Confirmar".
// Dados incompletos ou ambíguos viram { erro } para o modelo perguntar.

import { combineAddress, findDraftConflicts, isSofaName, matchCatalogItem, matchClients } from "./core.mjs";

const fuso = "America/Sao_Paulo";
const horaFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dataFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: fuso, dateStyle: "short" });
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const centavos = v => Math.round((Number(v) || 0) * 100) / 100;
const br = iso => iso.split("-").reverse().join("/");
const texto = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const uuid = v => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);

export class AcaoInvalida extends Error {}
const falha = msg => { throw new AcaoInvalida(msg); };

function dataValida(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
}

function hora(s) {
  const m = typeof s === "string" && s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return m[1].padStart(2, "0") + ":" + m[2];
}

const hojeSP = agoraMs => dataFmt.format(new Date(agoraMs));

/** Início e fim em horário de São Paulo; fim por hora_fim ou duração. */
function intervalo({ data, hora_inicio, hora_fim, duracao_minutos }, agoraMs, padraoMin = null) {
  if (!dataValida(data)) falha("Informe a data (AAAA-MM-DD).");
  if (data < hojeSP(agoraMs)) falha("A data " + br(data) + " já passou.");
  const ini = hora(hora_inicio);
  if (!ini) falha("Informe o horário de início (HH:MM).");
  const inicio = Date.parse(data + "T" + ini + ":00-03:00");
  let fim;
  const hf = hora(hora_fim);
  if (hf) fim = Date.parse(data + "T" + hf + ":00-03:00");
  else if (Number.isInteger(duracao_minutos) && duracao_minutos >= 30 && duracao_minutos <= 600) fim = inicio + duracao_minutos * 60000;
  else if (padraoMin) fim = inicio + padraoMin * 60000;
  else falha("Informe o horário de término ou a duração.");
  if (fim <= inicio) falha("O término precisa ser depois do início.");
  return { inicio_em: new Date(inicio).toISOString(), fim_em: new Date(fim).toISOString(), inicio, fim };
}

const faixa = (i, f) => br(dataFmt.format(new Date(i))) + " · " + horaFmt.format(new Date(i)) + "–" + horaFmt.format(new Date(f));

/* ---------- Bloquear horário ---------- */

export function montarBloqueio(args, { eventos = [], bloqueios = [] } = {}, agoraMs = Date.now()) {
  let periodo;
  if (args.dia_inteiro === true) {
    if (!dataValida(args.data)) falha("Informe a data (AAAA-MM-DD).");
    if (args.data < hojeSP(agoraMs)) falha("A data " + br(args.data) + " já passou.");
    const ini = Date.parse(args.data + "T00:00:00-03:00");
    periodo = { inicio_em: new Date(ini).toISOString(), fim_em: new Date(ini + 86400000).toISOString(), inicio: ini, fim: ini + 86400000 };
  } else {
    periodo = intervalo(args, agoraMs);
  }
  const motivo = texto(args.motivo, 120);
  const conflitos = findDraftConflicts(periodo.inicio_em, periodo.fim_em, eventos, bloqueios);
  return {
    tipo: "bloqueio",
    titulo: "Bloquear horário",
    linhas: [
      ["Quando", args.dia_inteiro === true ? br(args.data) + " · dia inteiro" : faixa(periodo.inicio, periodo.fim)],
      ["Motivo", motivo || "Não informado"]
    ],
    avisos: conflitos.length ? ["Já existe neste horário: " + conflitos.map(c => c.label).join("; ") + ". O bloqueio não cancela nada."] : [],
    confirmar: "Bloquear",
    payload: { inicio_em: periodo.inicio_em, fim_em: periodo.fim_em, motivo }
  };
}

/* ---------- Concluir atendimento (+ pedido de avaliação) ---------- */

export function telefoneValido(value) {
  let n = String(value || "").trim().replace(/^00/, "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return /^55[1-9]\d{9,10}$/.test(n);
}

export function montarConcluir(evento, pedirAvaliacao, agoraMs = Date.now()) {
  if (!evento || evento.excluido_em) falha("Atendimento não encontrado. Use o id que veio de ver_agenda.");
  if (evento.status === "concluido") falha("Este atendimento já está concluído.");
  if (evento.status === "cancelado") falha("Este atendimento está cancelado.");
  const nome = evento.tipo === "apartamento" ? evento.apartamentos?.nome : evento.clientes?.nome;
  const avisos = [];
  if (Date.parse(evento.inicio_em) > agoraMs) avisos.push("Este atendimento ainda não começou.");
  let avaliar = pedirAvaliacao === true;
  if (avaliar && (!evento.cliente_id || evento.tipo === "apartamento" || evento.clientes?.arquivado_em)) {
    avaliar = false;
    avisos.push("Pedido de avaliação só vale para clientes ativos (não apartamentos).");
  } else if (avaliar && !telefoneValido(evento.clientes?.telefone)) {
    avaliar = false;
    avisos.push("Sem WhatsApp válido no cadastro: o pedido de avaliação não será enviado.");
  }
  return {
    tipo: "concluir",
    titulo: "Concluir atendimento",
    linhas: [
      ["Atendimento", faixa(Date.parse(evento.inicio_em), Date.parse(evento.fim_em)) + " · " + (nome || "Cliente")],
      ["Serviço", evento.descricao_servico || "Não informado"],
      ["Valor", evento.valor == null ? "Não informado" : moeda.format(evento.valor)],
      ["Avaliação", avaliar ? "Enviar pedido de avaliação no WhatsApp (" + evento.clientes.telefone + ")" : "Não enviar"]
    ],
    avisos,
    confirmar: avaliar ? "Concluir e pedir avaliação" : "Concluir",
    payload: {
      agendamento_id: evento.id,
      status_atual: evento.status,
      pedir_avaliacao: avaliar,
      cliente_id: avaliar ? evento.cliente_id : null
    }
  };
}

/* ---------- Marcar pagamento (faxinas e apartamentos) ---------- */

const SITUACOES = { pago: "Pago", parcial: "Pago em parte", pendente: "Pendente" };

export function montarPagamento(evento, situacao) {
  if (!evento || evento.excluido_em) falha("Atendimento não encontrado. Use o id de a_receber ou ver_agenda.");
  if (!SITUACOES[situacao]) falha("Situação inválida: use pago, parcial ou pendente.");
  if (evento.tipo === "estofados") falha("Em estofados, concluir já significa pago. Não precisa marcar pagamento.");
  if (evento.status === "cancelado") falha("Este atendimento está cancelado.");
  const atual = evento.status_pagamento || "pendente";
  if (atual === situacao) falha("O pagamento já está como " + SITUACOES[situacao].toLowerCase() + ".");
  const nome = evento.tipo === "apartamento" ? evento.apartamentos?.nome : evento.clientes?.nome;
  return {
    tipo: "pagamento",
    titulo: "Pagamento",
    linhas: [
      ["Atendimento", faixa(Date.parse(evento.inicio_em), Date.parse(evento.fim_em)) + " · " + (nome || "Cliente")],
      ["Serviço", evento.descricao_servico || "Não informado"],
      ["Valor", evento.valor == null ? "Não informado" : moeda.format(evento.valor)],
      ["Pagamento", SITUACOES[atual] + " → " + SITUACOES[situacao]]
    ],
    avisos: evento.status !== "concluido" ? ["O atendimento ainda não está concluído."] : [],
    confirmar: "Marcar como " + SITUACOES[situacao].toLowerCase(),
    payload: { agendamento_id: evento.id, anterior: atual, status_pagamento: situacao }
  };
}

/* ---------- Criar orçamento ---------- */

export function precificarItens(itens, catalogo, oferta40) {
  if (!Array.isArray(itens) || !itens.length) falha("Diga quais itens vão no orçamento.");
  const semPreco = [];
  const lista = itens.slice(0, 20).map(i => {
    const nomeDito = texto(i?.nome, 120);
    if (!nomeDito) falha("Item sem nome.");
    const qtd = Number.isInteger(i.quantidade) && i.quantidade >= 1 ? Math.min(i.quantidade, 50) : 1;
    const cat = matchCatalogItem(nomeDito, catalogo);
    const tabela = cat ? Number(cat.valor_normal ?? cat.valor) : NaN;
    const dito = Number(i.valor_unitario);
    const unit = Number.isFinite(dito) && dito >= 0 ? centavos(dito) : Number.isFinite(tabela) ? centavos(tabela) : null;
    const nome = cat ? cat.nome : nomeDito;
    if (unit === null) { semPreco.push(nomeDito); return null; }
    const oferta = oferta40 && isSofaName(nome) && unit > 0;
    return {
      catalogo_preco_id: cat ? cat.id : null,
      nome,
      quantidade: qtd,
      modalidade_preco: oferta ? "desconto" : "normal",
      valor_original: oferta ? centavos(unit / 0.6) : null,
      valor_unitario: unit,
      valor_total: centavos(unit * qtd),
      observacoes: null
    };
  });
  if (semPreco.length) falha("Sem preço na tabela: " + semPreco.join(", ") + ". Pergunte o valor (ou o nome exato do item, ex.: Sofá 3 módulos).");
  return lista;
}

function resolverCliente(args, clientes, exigeTelefone) {
  const nome = texto(args.cliente_nome, 120);
  if (!nome) falha("Informe o nome do cliente.");
  const achado = matchClients(nome, clientes);
  if (achado.status === "existing") return { cliente: achado.matches[0] };
  if (achado.status === "ambiguous") {
    falha("Mais de um cliente parecido: " + achado.matches.map(c => c.nome).join(", ") + ". Pergunte qual é (ou se é um cliente novo).");
  }
  const telefone = texto(args.cliente_telefone, 40);
  if (exigeTelefone && !telefone) falha("Cliente novo (" + nome + "): informe o WhatsApp para cadastrar.");
  return { novo: { nome, telefone } };
}

export function montarOrcamento(args, { clientes = [], catalogo = [], oferta40 = true } = {}, agoraMs = Date.now()) {
  const { cliente, novo } = resolverCliente(args, clientes, true);
  const itens = precificarItens(args.itens, catalogo, oferta40);
  const total = centavos(itens.reduce((s, i) => s + i.valor_total, 0));
  const endereco = texto(args.endereco, 240) || (cliente ? combineAddress(cliente.endereco, cliente.bairro, cliente.cidade) : null);
  let validade = null;
  if (Number.isInteger(args.validade_dias) && args.validade_dias >= 1 && args.validade_dias <= 90) {
    validade = dataFmt.format(new Date(agoraMs + args.validade_dias * 86400000));
  }
  const observacoes = texto(args.observacoes, 400);
  return {
    tipo: "orcamento",
    titulo: "Novo orçamento",
    linhas: [
      ["Cliente", cliente ? cliente.nome : novo.nome + " (novo cadastro · " + novo.telefone + ")"],
      ["Itens", itens.map(i => (i.quantidade > 1 ? i.quantidade + "× " : "") + i.nome + " — " + moeda.format(i.valor_total) +
        (i.valor_original ? " (de " + moeda.format(centavos(i.valor_original * i.quantidade)) + ")" : "")).join("\n")],
      ["Total", moeda.format(total)],
      ["Endereço", endereco || "Não informado"],
      ...(validade ? [["Validade", br(validade)]] : []),
      ...(observacoes ? [["Observações", observacoes]] : [])
    ],
    avisos: [],
    confirmar: "Criar orçamento",
    payload: {
      cliente_id: cliente ? cliente.id : null,
      novo_cliente: novo ? { ...novo, endereco } : null,
      orcamento: { status: "rascunho", validade_em: validade, endereco, observacoes, valor_total: total },
      itens
    }
  };
}

/* ---------- Agendar um orçamento ---------- */

export function montarAgendarOrcamento(orcamento, args, { eventos = [], bloqueios = [] } = {}, agoraMs = Date.now()) {
  if (!orcamento || orcamento.excluido_em) falha("Orçamento não encontrado. Use o orcamento_id de orcamentos_pendentes.");
  if (orcamento.agendamento_id) falha("Este orçamento já foi agendado.");
  if (orcamento.status === "recusado") falha("Este orçamento está recusado.");
  const itens = (orcamento.orcamento_itens || []).map(i => ({
    catalogo_preco_id: i.catalogo_preco_id || null,
    nome: i.nome,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
    valor_total: i.valor_total,
    valor_original: i.valor_original ?? null,
    observacoes: i.observacoes || null
  }));
  if (!itens.length) falha("O orçamento não tem itens.");
  const p = intervalo(args, agoraMs, 120);
  const usouPadrao = !hora(args.hora_fim) && !Number.isInteger(args.duracao_minutos);
  const conflitos = findDraftConflicts(p.inicio_em, p.fim_em, eventos, bloqueios);
  const cli = orcamento.clientes || {};
  const endereco = texto(args.endereco, 240) || orcamento.endereco || combineAddress(cli.endereco, cli.bairro, cli.cidade);
  if (!endereco) falha("Sem endereço no orçamento nem no cadastro de " + (cli.nome || "cliente") + ". Pergunte o endereço do atendimento.");
  const descricao = itens.map(i => (i.quantidade > 1 ? i.quantidade + "× " : "") + i.nome).join(" + ");
  const avisos = [];
  if (usouPadrao) avisos.push("Duração padrão de 2 horas (não informada).");
  if (conflitos.length) avisos.push("Conflito: " + conflitos.map(c => c.label).join("; ") + ".");
  return {
    tipo: "agendar_orcamento",
    titulo: "Agendar orçamento",
    linhas: [
      ["Cliente", orcamento.clientes?.nome || "Cliente"],
      ["Quando", faixa(p.inicio, p.fim)],
      ["Serviços", descricao],
      ["Valor", moeda.format(orcamento.valor_total || 0)],
      ["Endereço", endereco || "Não informado"]
    ],
    avisos,
    confirmar: conflitos.length ? "Agendar mesmo assim" : "Agendar",
    payload: {
      orcamento_id: orcamento.id,
      campanha: Boolean(orcamento.campanha_cliente_id),
      cliente_id: orcamento.cliente_id,
      inicio_em: p.inicio_em,
      fim_em: p.fim_em,
      endereco,
      descricao_servico: descricao,
      valor: centavos(orcamento.valor_total),
      observacoes: orcamento.observacoes || null,
      itens
    }
  };
}

export { uuid as idValido };
