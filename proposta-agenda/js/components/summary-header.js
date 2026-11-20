(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component SummaryHeader
   * @props {
   *   mode: "day" | "week" | "month",
   *   events: Array<Appointment>,
   *   now: Date,
   *   loading: boolean,
   *   error: boolean
   * }
   * @actions {
   *   onSelectEvent(eventId),
   *   onQuickWhatsApp(event),
   *   onQuickMap(event)
   * }
   */
  UI.SummaryHeader = {
    render: function (el, props, actions) {
      const S = UI.shared;
      const p = props || {};
      const a = actions || {};
      const periodWord = { day: "do dia", week: "da semana", month: "do mês" }[p.mode || "day"];

      if (p.loading) {
        el.innerHTML =
          '<article class="kpi-card is-count"><span class="kpi-label">Atendimentos ' + periodWord + '</span><div class="skel kpi-skel"></div><div class="kpi-meta">Carregando resumo…</div></article>' +
          '<article class="kpi-card is-revenue"><span class="kpi-label">Previsão ' + periodWord + '</span><div class="skel kpi-skel"></div><div class="kpi-meta">Calculando valores…</div></article>' +
          '<article class="next-card is-empty"><div class="next-kicker">Próximo atendimento</div><div class="skel kpi-skel"></div></article>';
        return;
      }

      if (p.error) {
        el.innerHTML =
          '<article class="kpi-card is-count"><span class="kpi-label">Atendimentos ' + periodWord + '</span><strong class="kpi-value">—</strong><div class="kpi-meta">Indisponível no momento</div></article>' +
          '<article class="kpi-card is-revenue"><span class="kpi-label">Previsão ' + periodWord + '</span><strong class="kpi-value">—</strong><div class="kpi-meta">Indisponível no momento</div></article>' +
          '<article class="next-card is-empty"><div class="next-kicker">Próximo atendimento</div><div class="next-main"><div class="next-title-btn"><strong>Não carregado</strong><span>Use Tentar novamente abaixo</span></div></div></article>';
        return;
      }

      const summary = T.computeSummary(p.events || [], p.now);
      const breakdown = [];
      if (summary.confirmedCount) breakdown.push(summary.confirmedCount + " confirmado" + (summary.confirmedCount > 1 ? "s" : ""));
      if (summary.provisionalCount) breakdown.push(summary.provisionalCount + " a confirmar");
      if (summary.completedCount) breakdown.push(summary.completedCount + " concluído" + (summary.completedCount > 1 ? "s" : ""));

      const countMeta = breakdown.length ? breakdown.join(" · ") : "Sem atendimentos ativos";
      const revMeta = summary.count
        ? "Contagem única · exclui cancelados"
        : "Nenhum valor previsto";

      let nextHtml = "";
      const next = summary.nextEvent;
      if (next) {
        const start = new Date(next.inicio_em);
        const end = new Date(next.fim_em);
        const isSameDay = T.dateKey(start) === T.dateKey(p.now || new Date());
        const whenText = isSameDay
          ? T.hhmm(start) + "–" + T.hhmm(end)
          : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(start).replace(".", "") + " · " + T.hhmm(start);
        const phone = (next.clientes && next.clientes.telefone) || (next.apartamentos && next.apartamentos.contato_telefone) || "";
        const addr = next.endereco || "";

        nextHtml =
          '<article class="next-card">' +
            '<div class="next-card-top">' +
              '<span class="next-kicker">' + I.get("clock") + "<span>Próximo atendimento</span></span>" +
              '<span class="next-time-pill tnum">' + S.esc(whenText) + "</span>" +
            "</div>" +
            '<div class="next-main">' +
              '<button type="button" class="next-title-btn" data-next-open="' + S.esc(next.id) + '">' +
                "<strong>" + S.esc(T.eventTitle(next)) + "</strong>" +
                "<span>" + S.esc(T.TYPES[T.typeOf(next)].short) + " · " + S.esc(next.descricao_servico || "") + "</span>" +
              "</button>" +
              '<div class="next-actions">' +
                (phone
                  ? '<button type="button" class="next-quick-btn" data-next-wa="' + S.esc(next.id) + '" aria-label="Abrir WhatsApp do próximo cliente">' +
                      I.get("whatsapp") + "<span>WhatsApp</span>" +
                    "</button>"
                  : "") +
                (addr
                  ? '<button type="button" class="next-quick-btn" data-next-map="' + S.esc(next.id) + '" aria-label="Abrir endereço do próximo atendimento no mapa">' +
                      I.get("mapPin") + "<span>Mapa</span>" +
                    "</button>"
                  : "") +
              "</div>" +
            "</div>" +
          "</article>";
      } else {
        nextHtml =
          '<article class="next-card is-empty">' +
            '<div class="next-card-top">' +
              '<span class="next-kicker">' + I.get("confirmado") + "<span>Próximo atendimento</span></span>" +
            "</div>" +
            '<div class="next-main">' +
              '<div class="next-title-btn">' +
                "<strong>Equipe livre</strong>" +
                "<span>Nenhum próximo atendimento pendente neste período</span>" +
              "</div>" +
            "</div>" +
          "</article>";
      }

      el.innerHTML =
        '<article class="kpi-card is-count">' +
          '<span class="kpi-label">Atendimentos ' + periodWord + "</span>" +
          '<strong class="kpi-value tnum">' + summary.count + "</strong>" +
          '<div class="kpi-meta">' + S.esc(countMeta) + "</div>" +
        "</article>" +
        '<article class="kpi-card is-revenue">' +
          '<span class="kpi-label">Previsão ' + periodWord + "</span>" +
          '<strong class="kpi-value tnum">' + S.esc(T.formatMoney(summary.totalRevenue)) + "</strong>" +
          '<div class="kpi-meta">' + S.esc(revMeta) + "</div>" +
        "</article>" +
        nextHtml;

      const openBtn = el.querySelector("[data-next-open]");
      if (openBtn) openBtn.onclick = () => a.onSelectEvent && a.onSelectEvent(openBtn.dataset.nextOpen);

      const waBtn = el.querySelector("[data-next-wa]");
      if (waBtn && next) waBtn.onclick = () => a.onQuickWhatsApp && a.onQuickWhatsApp(next);

      const mapBtn = el.querySelector("[data-next-map]");
      if (mapBtn && next) mapBtn.onclick = () => a.onQuickMap && a.onQuickMap(next);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
