(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function phoneDigits(phone) {
    const raw = String(phone || "").replace(/\D/g, "");
    if (!raw) return "";
    return raw.startsWith("55") ? raw : "55" + raw;
  }

  function whatsappUrl(phone, text) {
    const digits = phoneDigits(phone);
    if (!digits) return "";
    const msg = text ? "?text=" + encodeURIComponent(text) : "";
    return "https://wa.me/" + digits + msg;
  }

  function mapsUrl(address) {
    if (!address) return "";
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  }

  function telUrl(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits ? "tel:" + digits : "";
  }

  function typeBadge(event) {
    const type = T.typeOf(event);
    const meta = T.TYPES[type];
    const airbnb = T.isAirbnb(event)
      ? '<span class="badge-chip badge-airbnb">Airbnb</span>'
      : "";
    return (
      '<span class="badge-chip badge-type type-' + type + '">' +
      I.typeIcon(type) +
      "<span>" + esc(meta.short) + "</span>" +
      "</span>" +
      airbnb
    );
  }

  function statusBadge(status) {
    const st = T.STATUS[status] || { id: status || "confirmado", label: status || "Confirmado" };
    return (
      '<span class="badge-chip status-badge st-' + esc(st.id) + '">' +
      I.statusIcon(st.id) +
      "<span>" + esc(st.label) + "</span>" +
      "</span>"
    );
  }

  function miniOccupancyBar(events, blocks, date) {
    const split = T.daySplitForRender(events, blocks, date);
    const segs = split.allItems
      .filter(entry => entry.active)
      .map(entry => {
        const pos = T.trackPosition(entry.startMin, entry.endMin);
        if (pos.widthPct <= 0) return "";
        const cls = entry.kind === "block"
          ? "mini-day-seg is-block"
          : "mini-day-seg type-" + T.typeOf(entry.item);
        return (
          '<span class="' + cls + '" style="left:' + pos.leftPct + '%;width:' + pos.widthPct + '%"></span>'
        );
      })
      .join("");
    return (
      '<div class="mini-day-bar" aria-hidden="true" title="Ocupação de 08h às 18h (linha marca meio-dia)">' +
      '<span class="mini-day-bar-noon"></span>' +
      segs +
      "</div>"
    );
  }

  UI.shared = {
    esc: esc,
    phoneDigits: phoneDigits,
    whatsappUrl: whatsappUrl,
    mapsUrl: mapsUrl,
    telUrl: telUrl,
    typeBadge: typeBadge,
    statusBadge: statusBadge,
    miniOccupancyBar: miniOccupancyBar
  };

  /**
   * @component StateViews
   * @props { mode, dateLabel, errorMessage }
   * @actions { onNewAppointment(), onBlockTime(), onRetry() }
   */
  UI.StateViews = {
    renderEmpty: function (el, props, actions) {
      const p = props || {};
      const a = actions || {};
      const titles = {
        day: "Nenhum atendimento para este dia",
        week: "Semana totalmente livre",
        month: "Nenhum agendamento neste mês"
      };
      const title = titles[p.mode] || "Agenda livre";
      const sub = p.dateLabel
        ? "Não há serviços nem bloqueios registrados em " + p.dateLabel + "."
        : "Não há serviços nem bloqueios registrados neste período.";

      el.innerHTML =
        '<div class="state-box state-empty">' +
          '<div class="state-inner">' +
            '<div class="state-illustration">' + I.get("calendar") + "</div>" +
            "<h3>" + esc(title) + "</h3>" +
            "<p>" + esc(sub) + "</p>" +
            '<div class="state-actions">' +
              '<button type="button" class="btn btn-primary" data-state-action="new">' +
                I.get("plus") + "<span>Novo agendamento</span>" +
              "</button>" +
              '<button type="button" class="btn btn-secondary" data-state-action="block">' +
                I.get("lock") + "<span>Bloquear horário</span>" +
              "</button>" +
            "</div>" +
          "</div>" +
        "</div>";

      el.querySelector('[data-state-action="new"]').onclick = () => a.onNewAppointment && a.onNewAppointment();
      el.querySelector('[data-state-action="block"]').onclick = () => a.onBlockTime && a.onBlockTime();
    },

    renderLoading: function (el) {
      el.innerHTML =
        '<div class="loading-wrap" aria-busy="true" aria-label="Carregando agenda">' +
          '<div class="skel skel-bar"></div>' +
          '<div class="skel-grid">' +
            '<div class="skel skel-card"></div>' +
            '<div class="skel skel-card"></div>' +
            '<div class="skel skel-card"></div>' +
            '<div class="skel skel-card"></div>' +
          "</div>" +
        "</div>";
    },

    renderError: function (el, props, actions) {
      const p = props || {};
      const a = actions || {};
      const msg = p.errorMessage || "Não foi possível carregar os atendimentos agora. Verifique a internet e tente novamente.";

      el.innerHTML =
        '<div class="state-box state-error" role="alert">' +
          '<div class="state-inner">' +
            '<div class="state-illustration is-error">' + I.get("alertTriangle") + "</div>" +
            "<h3>Ops! Falha ao carregar a agenda</h3>" +
            "<p>" + esc(msg) + "</p>" +
            '<div class="state-actions">' +
              '<button type="button" class="btn btn-primary" data-state-action="retry">' +
                I.get("refresh") + "<span>Tentar novamente</span>" +
              "</button>" +
            "</div>" +
          "</div>" +
        "</div>";

      el.querySelector('[data-state-action="retry"]').onclick = () => a.onRetry && a.onRetry();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
