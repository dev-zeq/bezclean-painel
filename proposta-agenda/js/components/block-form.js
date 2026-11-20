(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component BlockForm
   * @props {
   *   defaultDateKey: string,
   *   existingEvents: Array<Appointment>,
   *   existingBlocks: Array<Block>
   * }
   * @actions {
   *   onSave({ inicio_em, fim_em, motivo }),
   *   onClose()
   * }
   */
  UI.BlockForm = {
    open: function (dialogEl, props, actions) {
      const S = UI.shared;
      const p = props || {};
      const a = actions || {};
      const dateKey = p.defaultDateKey || "";

      dialogEl.innerHTML =
        '<form id="bfForm" style="display:flex;flex-direction:column;height:100%;min-height:0">' +
          '<div class="dialog-head">' +
            "<div>" +
              '<p class="eyebrow">INDISPONIBILIDADE DA EQUIPE</p>' +
              "<h2>Bloquear horário</h2>" +
            "</div>" +
            '<button type="button" class="dialog-close" data-bf-close aria-label="Fechar bloqueio">' + I.get("close") + "</button>" +
          "</div>" +
          '<div class="dialog-body">' +
            '<p style="margin:0;font-size:0.86rem;color:var(--bz-muted)">Use para compromissos pessoais, manutenção de equipamentos ou pausas em que Bruna e Ezequiel não podem atender.</p>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-bf-preset="08:00|12:00">Manhã (08h–12h)</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" data-bf-preset="12:00|18:00">Tarde (12h–18h)</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" data-bf-preset="08:00|18:00">Dia todo</button>' +
            "</div>" +
            '<div class="field-grid">' +
              '<label class="field field-full">Data<input id="bfDate" type="date" value="' + S.esc(dateKey) + '" required></label>' +
              '<label class="field">Início<input id="bfStart" type="time" required></label>' +
              '<label class="field">Término<input id="bfEnd" type="time" required></label>' +
              '<label class="field field-full">Motivo (opcional)<input id="bfReason" placeholder="Ex.: Revisão do carro, médico, folga…"></label>' +
            "</div>" +
            '<div class="hidden" data-bf-warning></div>' +
            '<p class="form-error-msg hidden" data-bf-error></p>' +
          "</div>" +
          '<div class="dialog-footer">' +
            '<button type="button" class="btn btn-secondary" data-bf-close>Cancelar</button>' +
            '<button type="submit" class="btn btn-primary">' + I.get("lock") + "<span>Salvar bloqueio</span></button>" +
          "</div>" +
        "</form>";

      const dIn = dialogEl.querySelector("#bfDate");
      const sIn = dialogEl.querySelector("#bfStart");
      const eIn = dialogEl.querySelector("#bfEnd");
      const rIn = dialogEl.querySelector("#bfReason");
      const warnEl = dialogEl.querySelector("[data-bf-warning]");
      const errEl = dialogEl.querySelector("[data-bf-error]");

      function checkOverlap() {
        if (!dIn.value || !sIn.value || !eIn.value) {
          warnEl.classList.add("hidden");
          return;
        }
        const start = T.combineDateTime(dIn.value, sIn.value);
        const end = T.combineDateTime(dIn.value, eIn.value);
        if (!(end > start)) {
          warnEl.classList.add("hidden");
          return;
        }
        const clashes = T.detectConflicts(p.existingEvents, p.existingBlocks, start, end, null);
        if (!clashes.length) {
          warnEl.classList.add("hidden");
          return;
        }
        warnEl.classList.remove("hidden");
        warnEl.innerHTML =
          '<div class="conflict-banner">' +
            '<div class="conflict-banner-head">' + I.get("alertTriangle") +
              "<div><strong>Atenção: há atendimento neste horário</strong><p>Você já tem compromisso marcado no período:</p></div>" +
            "</div>" +
            '<ul class="conflict-list">' + clashes.map(c => "<li>" + S.esc(c.label) + "</li>").join("") + "</ul>" +
          "</div>";
      }

      dialogEl.querySelectorAll("[data-bf-close]").forEach(btn => {
        btn.onclick = () => {
          if (dialogEl.open) dialogEl.close();
          a.onClose && a.onClose();
        };
      });

      dialogEl.querySelectorAll("[data-bf-preset]").forEach(btn => {
        btn.onclick = () => {
          const [st, en] = btn.dataset.bfPreset.split("|");
          sIn.value = st;
          eIn.value = en;
          checkOverlap();
        };
      });

      [dIn, sIn, eIn].forEach(inp => { inp.onchange = checkOverlap; });

      dialogEl.querySelector("#bfForm").onsubmit = e => {
        e.preventDefault();
        if (!dIn.value || !sIn.value || !eIn.value) {
          errEl.classList.remove("hidden");
          errEl.textContent = "Informe data, horário de início e término.";
          return;
        }
        const start = T.combineDateTime(dIn.value, sIn.value);
        const end = T.combineDateTime(dIn.value, eIn.value);
        if (!(end > start)) {
          errEl.classList.remove("hidden");
          errEl.textContent = "O horário de término precisa ser depois do início.";
          return;
        }
        errEl.classList.add("hidden");
        if (dialogEl.open) dialogEl.close();
        a.onSave && a.onSave({
          inicio_em: start.toISOString(),
          fim_em: end.toISOString(),
          motivo: rIn.value.trim() || "Indisponível"
        });
      };

      if (!dialogEl.open) dialogEl.showModal();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
