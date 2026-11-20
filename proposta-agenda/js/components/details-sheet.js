(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component DetailsSheet
   * @props { appointment: Appointment | null }
   * @actions {
   *   onEdit(appointment),
   *   onUpdateStatus(appointmentId, status),
   *   onWhatsApp(appointment),
   *   onOpenMap(appointment),
   *   onCall(appointment),
   *   onClose()
   * }
   */
  UI.DetailsSheet = {
    open: function (dialogEl, props, actions) {
      const S = UI.shared;
      const ev = props && props.appointment;
      if (!ev) return;

      const type = T.typeOf(ev);
      const start = new Date(ev.inicio_em);
      const end = new Date(ev.fim_em);
      const durMin = Math.max(0, Math.round((end - start) / 60000));
      const crossesNoon = T.crossesNoon(start, end);

      const clientName = T.eventTitle(ev);
      const contactName = ev.apartamentos && ev.apartamentos.contato_nome
        ? ev.apartamentos.contato_nome
        : (ev.clientes && ev.clientes.nome) || "";
      const phone = (ev.clientes && ev.clientes.telefone) || (ev.apartamentos && ev.apartamentos.contato_telefone) || "";
      const address = ev.endereco || (ev.clientes && ev.clientes.endereco) || (ev.apartamentos && ev.apartamentos.endereco) || "";
      const items = Array.isArray(ev.agendamento_itens) ? ev.agendamento_itens : [];

      const dateText = T.formatDayTitle(start);
      const timeText = T.hhmm(start) + " – " + T.hhmm(end) + " (" + T.formatDuration(durMin) + ")";

      const noonInfo = crossesNoon
        ? '<div class="badge-chip badge-noon-bridge" style="margin-top:4px">' +
            "Atravessa o meio-dia · ocupa até " + S.esc(T.hhmm(end)) + " na tarde" +
          "</div>"
        : "";

      const servicesHtml = items.length
        ? '<ul class="details-services-list">' +
            items.map(it => (
              "<li>" +
                "<span>" + (it.quantidade > 1 ? it.quantidade + "× " : "") + S.esc(it.nome) + "</span>" +
                '<strong class="tnum">' + S.esc(T.formatMoney(it.valor_total)) + "</strong>" +
              "</li>"
            )).join("") +
          "</ul>"
        : "<p class=\"appt-service\" style=\"margin:0\">" + S.esc(ev.descricao_servico || "Serviço não especificado") + "</p>";

      const canConfirm = ev.status === "provisorio";
      const canComplete = ev.status !== "concluido" && ev.status !== "cancelado";
      const canCancel = ev.status !== "cancelado";

      dialogEl.innerHTML =
        '<div class="dialog-head">' +
          "<div>" +
            '<p class="eyebrow">DETALHES DO ATENDIMENTO</p>' +
            "<h2>" + S.esc(clientName) + "</h2>" +
            '<div class="details-tags" style="margin-top:8px">' +
              S.typeBadge(ev) +
              S.statusBadge(ev.status) +
            "</div>" +
          "</div>" +
          '<button type="button" class="dialog-close" data-det-close aria-label="Fechar detalhes">' + I.get("close") + "</button>" +
        "</div>" +
        '<div class="dialog-body">' +
          '<div class="details-quick-actions">' +
            '<button type="button" class="btn btn-whatsapp btn-sm" data-det-wa ' + (phone ? "" : "disabled") + ">" +
              I.get("whatsapp") + "<span>WhatsApp</span>" +
            "</button>" +
            '<button type="button" class="btn btn-secondary btn-sm" data-det-map ' + (address ? "" : "disabled") + ">" +
              I.get("mapPin") + "<span>Abrir mapa</span>" +
            "</button>" +
            '<button type="button" class="btn btn-secondary btn-sm" data-det-call ' + (phone ? "" : "disabled") + ">" +
              I.get("phone") + "<span>Ligar</span>" +
            "</button>" +
          "</div>" +

          '<div class="details-info-card">' +
            '<div class="details-row">' +
              '<div class="details-row-icon">' + I.get("clock") + "</div>" +
              '<div class="details-row-text">' +
                '<strong class="tnum">' + S.esc(timeText) + "</strong>" +
                "<span>" + S.esc(dateText) + "</span>" +
                noonInfo +
              "</div>" +
            "</div>" +
            '<div class="details-row">' +
              '<div class="details-row-icon">' + I.get("mapPin") + "</div>" +
              '<div class="details-row-text">' +
                "<strong>Endereço</strong>" +
                "<span>" + S.esc(address || "Não informado") + "</span>" +
              "</div>" +
            "</div>" +
            '<div class="details-row">' +
              '<div class="details-row-icon">' + I.get("users") + "</div>" +
              '<div class="details-row-text">' +
                "<strong>" + (type === "apartamento" ? "Contato / Responsável" : "Cliente") + "</strong>" +
                "<span>" + S.esc([contactName, phone].filter(Boolean).join(" · ") || "Sem telefone cadastrado") + "</span>" +
              "</div>" +
            "</div>" +
          "</div>" +

          '<div class="details-info-card">' +
            '<strong style="font-size:0.86rem;color:var(--bz-navy)">Serviços e valor</strong>' +
            servicesHtml +
            '<div class="details-total-bar">' +
              "<span>Valor previsto</span>" +
              '<span class="tnum">' + S.esc(Number(ev.valor) ? T.formatMoney(ev.valor) : "A definir") + "</span>" +
            "</div>" +
          "</div>" +

          (ev.observacoes
            ? '<div class="details-notes-box"><strong>Observações da equipe</strong>' + S.esc(ev.observacoes) + "</div>"
            : '<div class="details-info-card"><span style="font-size:0.83rem;color:var(--bz-muted)">Nenhuma observação adicionada.</span></div>') +
        "</div>" +
        '<div class="dialog-footer">' +
          '<div class="details-status-actions">' +
            (canConfirm ? '<button type="button" class="btn btn-secondary btn-sm" data-det-status="confirmado">' + I.get("confirmado") + "<span>Confirmar</span></button>" : "") +
            (canComplete ? '<button type="button" class="btn btn-secondary btn-sm" data-det-status="concluido">' + I.get("concluido") + "<span>Concluir</span></button>" : "") +
            (canCancel ? '<button type="button" class="btn btn-danger btn-sm" data-det-status="cancelado">' + I.get("cancelado") + "<span>Cancelar</span></button>" : "") +
            '<button type="button" class="btn btn-primary btn-sm" data-det-edit>' + I.get("edit") + "<span>Editar atendimento</span></button>" +
          "</div>" +
        "</div>";

      const close = () => {
        if (dialogEl.open) dialogEl.close();
        actions.onClose && actions.onClose();
      };

      dialogEl.querySelector("[data-det-close]").onclick = close;
      dialogEl.querySelector("[data-det-edit]").onclick = () => {
        if (dialogEl.open) dialogEl.close();
        actions.onEdit && actions.onEdit(ev);
      };

      const waBtn = dialogEl.querySelector("[data-det-wa]");
      if (waBtn && phone) waBtn.onclick = () => actions.onWhatsApp && actions.onWhatsApp(ev);

      const mapBtn = dialogEl.querySelector("[data-det-map]");
      if (mapBtn && address) mapBtn.onclick = () => actions.onOpenMap && actions.onOpenMap(ev);

      const callBtn = dialogEl.querySelector("[data-det-call]");
      if (callBtn && phone) callBtn.onclick = () => actions.onCall && actions.onCall(ev);

      dialogEl.querySelectorAll("[data-det-status]").forEach(btn => {
        btn.onclick = () => {
          if (dialogEl.open) dialogEl.close();
          actions.onUpdateStatus && actions.onUpdateStatus(ev.id, btn.dataset.detStatus);
        };
      });

      if (!dialogEl.open) dialogEl.showModal();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
