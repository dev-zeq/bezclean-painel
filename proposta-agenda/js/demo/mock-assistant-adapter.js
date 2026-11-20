(function (root, factory) {
  const api = factory(root.BezTime || require("../time-utils.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BezMockAssistant = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (T) {
  "use strict";

  const SUGGESTIONS = [
    { label: "Horários disponíveis", prompt: "Quais horários estão disponíveis?" },
    { label: "Atendimentos por cidade", prompt: "Mostrar atendimentos por cidade" },
    { label: "Agenda de amanhã", prompt: "Como está a agenda de amanhã?" },
    { label: "Rota em Meia Praia", prompt: "Tem atendimentos em Meia Praia?" }
  ];

  const VOICE_SAMPLES = [
    "Quais horários estão livres hoje?",
    "Tem algum atendimento em Itapema?",
    "Como está a agenda de amanhã?",
    "Quero agendar um sofá amanhã às 14h"
  ];

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function extractCity(address) {
    if (!address) return "Cidade não informada";
    const parts = address.split("—");
    if (parts.length > 1) return parts[parts.length - 1].trim();
    return "Itapema";
  }

  function buildEventAction(ev) {
    const start = new Date(ev.inicio_em);
    const end = new Date(ev.fim_em);
    const dayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
      .format(start)
      .replace(".", "");
    return {
      kind: "event",
      eventId: ev.id,
      label: dayLabel + " · " + T.hhmm(start) + "–" + T.hhmm(end) + " · " + T.eventTitle(ev),
      sub: (T.TYPES[T.typeOf(ev)].short) + " · " + (ev.endereco || "Sem endereço")
    };
  }

  function buildSlotAction(date, win) {
    const key = T.dateKey(date);
    const dayStr = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
    return {
      kind: "slot",
      dateKey: key,
      startTime: win.startText,
      durationMin: Math.min(120, win.durationMin),
      label: dayStr + " · " + win.startText + "–" + win.endText + " (" + win.durationLabel + ")",
      sub: "Toque para iniciar agendamento neste horário"
    };
  }

  function answerAvailableSlots(events, blocks, today) {
    const tomorrow = T.addDays(today, 1);
    const wToday = T.computeFreeWindows(events, blocks, today);
    const wTom = T.computeFreeWindows(events, blocks, tomorrow);
    const splitToday = T.daySplitForRender(events, blocks, today);

    const fmtWin = w => "• " + w.startText + " às " + w.endText + " (" + w.durationLabel + ")";
    const lines = [];

    lines.push("Hoje (" + T.formatDayTitle(today) + "):");
    if (splitToday.noonCarryOver.length) {
      const co = splitToday.noonCarryOver[0];
      lines.push("Obs.: " + co.title + " inicia às " + co.startedAt + " e ocupa até " + co.untilText + ".");
    }
    lines.push(wToday.length ? wToday.map(fmtWin).join("\n") : "• Sem janelas livres hoje.");

    lines.push("\nAmanhã (" + T.formatDayTitle(tomorrow) + "):");
    lines.push(wTom.length ? wTom.map(fmtWin).join("\n") : "• Sem janelas livres amanhã.");

    const actions = []
      .concat(wToday.slice(0, 2).map(w => buildSlotAction(today, w)))
      .concat(wTom.slice(0, 2).map(w => buildSlotAction(tomorrow, w)));

    return {
      text: lines.join("\n"),
      actions: actions
    };
  }

  function answerByLocation(normQuery, events, today) {
    const todayStart = T.dayStart(today);
    const active = (events || [])
      .filter(ev => T.isActiveEvent(ev) && new Date(ev.fim_em) >= todayStart)
      .sort((a, b) => new Date(a.inicio_em) - new Date(b.inicio_em));

    const knownPlaces = [
      { key: "meia praia", label: "Meia Praia" },
      { key: "centro", label: "Centro" },
      { key: "morretes", label: "Morretes" },
      { key: "itapema", label: "Itapema" },
      { key: "balneario", label: "Balneário Camboriú" }
    ];

    const matchedPlace = knownPlaces.find(p => normQuery.includes(p.key));

    if (matchedPlace) {
      const found = active.filter(ev => normalize(ev.endereco).includes(matchedPlace.key));
      if (!found.length) {
        return {
          text: "Não encontrei atendimentos ativos futuros em " + matchedPlace.label + " nos dados atuais.",
          actions: []
        };
      }
      return {
        text: "Encontrei " + found.length + " atendimento" + (found.length > 1 ? "s" : "") + " em " + matchedPlace.label + ". Toque abaixo para abrir os detalhes:",
        actions: found.slice(0, 4).map(buildEventAction)
      };
    }

    // Agrupamento por cidade (incluindo recentes da semana se não houver futuros em outra cidade)
    const allActive = (events || [])
      .filter(T.isActiveEvent)
      .sort((a, b) => new Date(a.inicio_em) - new Date(b.inicio_em));

    const byCity = {};
    allActive.forEach(ev => {
      const city = extractCity(ev.endereco);
      byCity[city] = byCity[city] || [];
      byCity[city].push(ev);
    });

    const cityLines = Object.keys(byCity).map(city => {
      const list = byCity[city];
      const preview = list.slice(0, 3).map(ev => {
        const d = new Date(ev.inicio_em);
        return (
          "  - " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") +
          " às " + T.hhmm(d) + " · " + T.eventTitle(ev)
        );
      }).join("\n");
      return "• " + city + " (" + list.length + " atendimento" + (list.length > 1 ? "s" : "") + ")\n" + preview;
    });

    return {
      text: "Resumo dos atendimentos por cidade:\n\n" + cityLines.join("\n\n"),
      actions: active.slice(0, 3).map(buildEventAction)
    };
  }

  function answerTomorrow(events, blocks, today) {
    const tomorrow = T.addDays(today, 1);
    const split = T.daySplitForRender(events, blocks, tomorrow);
    const activeEvents = split.allItems.filter(e => e.kind === "event" && e.active).map(e => e.item);
    const summary = T.computeSummary(activeEvents, today);
    const windows = T.computeFreeWindows(events, blocks, tomorrow);

    if (!activeEvents.length && !split.allItems.some(e => e.kind === "block")) {
      return {
        text: "Amanhã (" + T.formatDayTitle(tomorrow) + ") está totalmente livre! Nenhum atendimento marcado até o momento.",
        actions: windows.slice(0, 2).map(w => buildSlotAction(tomorrow, w))
      };
    }

    const lines = [
      "Agenda de amanhã (" + T.formatDayTitle(tomorrow) + "):",
      "• " + summary.count + " atendimento" + (summary.count > 1 ? "s" : "") + " · Previsão: " + T.formatMoney(summary.totalRevenue)
    ];

    activeEvents.forEach(ev => {
      lines.push("• " + T.hhmm(ev.inicio_em) + "–" + T.hhmm(ev.fim_em) + " · " + T.eventTitle(ev) + " (" + T.TYPES[T.typeOf(ev)].short + ")");
    });

    if (windows.length) {
      lines.push("\nHorários livres amanhã: " + windows.map(w => w.startText + "–" + w.endText).join(", ") + ".");
    }

    const actions = activeEvents.slice(0, 3).map(buildEventAction)
      .concat(windows.slice(0, 1).map(w => buildSlotAction(tomorrow, w)));

    return {
      text: lines.join("\n"),
      actions: actions
    };
  }

  function answerCreateFuture(events, blocks, today) {
    const tomorrow = T.addDays(today, 1);
    const freeToday = T.computeFreeWindows(events, blocks, today);
    const freeTom = T.computeFreeWindows(events, blocks, tomorrow);
    const bestSlot = freeToday[0]
      ? buildSlotAction(today, freeToday[0])
      : (freeTom[0] ? buildSlotAction(tomorrow, freeTom[0]) : null);

    const actions = [{
      kind: "openNew",
      label: "Abrir formulário de novo agendamento",
      sub: "Preenchimento manual rápido"
    }];
    if (bestSlot) actions.push(bestSlot);

    return {
      text:
        "Criar ou editar agendamentos diretamente por texto ou voz entra na próxima etapa do Assistente Bez.\n\n" +
        "Por enquanto, você pode consultar horários aqui e abrir o formulário de agendamento com um toque abaixo:",
      actions: actions
    };
  }

  /**
   * Gera resposta fictícia determinística a partir dos dados em memória da agenda.
   */
  function answer(question, context) {
    const ctx = context || {};
    const events = ctx.events || [];
    const blocks = ctx.blocks || [];
    const today = ctx.today ? new Date(ctx.today) : new Date(2026, 10, 20, 0, 0, 0);
    const norm = normalize(question);

    if (!norm) {
      return {
        text: "Digite ou grave uma pergunta sobre horários livres, atendimentos por cidade ou agenda de amanhã.",
        actions: []
      };
    }

    const wantsCreate = /(agendar|marcar|criar|cadastrar|novo agendamento|nova limpeza)/.test(norm) &&
      !/(como esta|quais|disponiv|livre|tem algum)/.test(norm);
    if (wantsCreate) {
      return answerCreateFuture(events, blocks, today);
    }

    if (/(cidade|bairro|itapema|balneario|meia praia|centro|morretes|onde|rota|endereco)/.test(norm)) {
      return answerByLocation(norm, events, today);
    }

    if (/(amanha|sabado|proximo dia)/.test(norm)) {
      return answerTomorrow(events, blocks, today);
    }

    if (/(horario|livre|disponivel|disponiveis|vago|vaga|hoje|encaix|agenda)/.test(norm)) {
      return answerAvailableSlots(events, blocks, today);
    }

    return {
      text:
        "Nesta demonstração, consigo responder perguntas sobre:\n" +
        "• Horários disponíveis hoje e amanhã\n" +
        "• Atendimentos por cidade ou bairro (ex.: Itapema, Meia Praia)\n" +
        "• Resumo da agenda de amanhã\n\n" +
        "Toque em uma das sugestões abaixo ou use o microfone para testar.",
      actions: []
    };
  }

  return {
    SUGGESTIONS: SUGGESTIONS,
    VOICE_SAMPLES: VOICE_SAMPLES,
    answer: answer
  };
});
