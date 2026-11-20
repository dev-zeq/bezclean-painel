(function (root) {
  "use strict";

  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component ConflictUI
   * @props (Banner) { conflicts: Array<Conflict>, suggestion: { startText, endText } | null }
   * @actions (Banner) { onApplySuggestion(startText, endText) }
   *
   * @props (Modal) { conflicts: Array<Conflict>, proposedLabel: string, suggestion: { startText, endText } | null }
   * @actions (Modal) { onAdjust(), onForceSave(), onApplySuggestion(startText, endText) }
   */
  UI.ConflictUI = {
    renderInlineBanner: function (containerEl, props, actions) {
      const S = UI.shared;
      const list = (props && props.conflicts) || [];
      if (!list.length) {
        containerEl.innerHTML = "";
        containerEl.classList.add("hidden");
        return;
      }

      const sug = props && props.suggestion;
      containerEl.classList.remove("hidden");
      containerEl.innerHTML =
        '<div class="conflict-banner" role="alert">' +
          '<div class="conflict-banner-head">' +
            I.get("alertTriangle") +
            "<div>" +
              "<strong>Conflito de horário com a equipe</strong>" +
              "<p>Bruna e Ezequiel atendem juntos. Este horário sobrepõe compromisso ou bloqueio existente:</p>" +
            "</div>" +
          "</div>" +
          '<ul class="conflict-list">' +
            list.map(c => (
              '<li><span class="tnum">' + S.esc(c.label) + "</span> · " + c.overlapMinutes + " min em comum</li>"
            )).join("") +
          "</ul>" +
          (sug
            ? '<div class="conflict-suggestion">' +
                '<span style="font-size:0.8rem;font-weight:700">Próximo horário livre compatível:</span>' +
                '<button type="button" class="btn btn-secondary btn-sm" data-apply-sug>' +
                  "Mover para " + S.esc(sug.startText) + "–" + S.esc(sug.endText) +
                "</button>" +
              "</div>"
            : '<div style="font-size:0.78rem;font-weight:700">Sem outra janela contínua livre neste dia para a mesma duração.</div>') +
        "</div>";

      const sugBtn = containerEl.querySelector("[data-apply-sug]");
      if (sugBtn && sug && actions && actions.onApplySuggestion) {
        sugBtn.onclick = () => actions.onApplySuggestion(sug.startText, sug.endText);
      }
    },

    openConfirmModal: function (dialogEl, props, actions) {
      const S = UI.shared;
      const p = props || {};
      const a = actions || {};
      const list = p.conflicts || [];
      const sug = p.suggestion;

      dialogEl.innerHTML =
        '<div class="dialog-head">' +
          "<div>" +
            '<p class="eyebrow" style="color:var(--bz-danger)">SOBREPOSIÇÃO DETECTADA</p>' +
            "<h2>Conflito de horário</h2>" +
          "</div>" +
          '<button type="button" class="dialog-close" data-cf-adjust aria-label="Voltar">' + I.get("close") + "</button>" +
        "</div>" +
        '<div class="dialog-body">' +
          '<div class="conflict-banner">' +
            '<div class="conflict-banner-head">' +
              I.get("alertTriangle") +
              "<div>" +
                "<strong>Horário escolhido: " + S.esc(p.proposedLabel || "") + "</strong>" +
                "<p>A equipe (Bruna e Ezequiel) já possui compromisso ou bloqueio neste intervalo:</p>" +
              "</div>" +
            "</div>" +
            '<ul class="conflict-list">' +
              list.map(c => (
                '<li><span class="tnum">' + S.esc(c.label) + "</span> · " + c.overlapMinutes + " min sobrepostos</li>"
              )).join("") +
            "</ul>" +
          "</div>" +
          (sug
            ? '<div class="preview-box">' +
                '<div class="preview-box-head">' +
                  "<strong>Sugestão livre no mesmo dia</strong>" +
                  '<button type="button" class="btn btn-secondary btn-sm" data-cf-sug>' +
                    "Ajustar para " + S.esc(sug.startText) + "–" + S.esc(sug.endText) +
                  "</button>" +
                "</div>" +
              "</div>"
            : "") +
        "</div>" +
        '<div class="dialog-footer">' +
          '<button type="button" class="btn btn-danger" data-cf-force>Agendar mesmo assim</button>' +
          '<button type="button" class="btn btn-primary" data-cf-adjust>Voltar e ajustar horário</button>' +
        "</div>";

      const close = () => {
        if (dialogEl.open) dialogEl.close();
      };

      dialogEl.querySelectorAll("[data-cf-adjust]").forEach(btn => {
        btn.onclick = () => {
          close();
          a.onAdjust && a.onAdjust();
        };
      });

      const sugBtn = dialogEl.querySelector("[data-cf-sug]");
      if (sugBtn && sug) {
        sugBtn.onclick = () => {
          close();
          a.onApplySuggestion && a.onApplySuggestion(sug.startText, sug.endText);
        };
      }

      dialogEl.querySelector("[data-cf-force]").onclick = () => {
        close();
        a.onForceSave && a.onForceSave();
      };

      if (!dialogEl.open) dialogEl.showModal();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
