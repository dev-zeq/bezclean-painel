(function (root) {
  "use strict";

  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  function formatSeconds(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return mm + ":" + ss;
  }

  /**
   * @component BezAssistant
   * @props {
   *   isOpen: boolean,
   *   messages: Array<{
   *     id: string,
   *     role: "user" | "assistant",
   *     text: string,
   *     viaVoice?: boolean,
   *     actions?: Array<{ kind: "event" | "slot" | "openNew", label: string, sub?: string, eventId?: string, dateKey?: string, startTime?: string, durationMin?: number }>
   *   }>,
   *   suggestions: Array<{ label: string, prompt: string }>,
   *   voiceSamples: Array<string>,
   *   selectedVoiceDraft: string,
   *   isThinking: boolean,
   *   voiceRecording: boolean,
   *   voiceSeconds: number,
   *   futureNote: string
   * }
   * @actions {
   *   onToggleOpen(nextOpen: boolean),
   *   onSendMessage(text: string, meta?: { viaVoice?: boolean }),
   *   onSelectSuggestion(prompt: string),
   *   onStartVoice(),
   *   onCancelVoice(),
   *   onSelectVoiceSample(text: string),
   *   onFinishVoice(text: string),
   *   onClearHistory(),
   *   onSelectEvent(eventId: string),
   *   onSelectSlot(dateKey: string, startTime: string, durationMin: number),
   *   onOpenNewAppointment()
   * }
   */
  UI.BezAssistant = {
    render: function (containerEl, props, actions) {
      const S = UI.shared;
      const p = props || {};
      const a = actions || {};
      const isOpen = Boolean(p.isOpen);
      const messages = Array.isArray(p.messages) ? p.messages : [];
      const suggestions = Array.isArray(p.suggestions) ? p.suggestions : [];
      const voiceSamples = Array.isArray(p.voiceSamples) ? p.voiceSamples : [];

      const fabHtml =
        '<button type="button" class="bez-fab' + (isOpen ? " is-open" : "") + '" ' +
          'id="bezAssistantFab" aria-expanded="' + String(isOpen) + '" aria-controls="bezAssistantPanel" ' +
          'aria-label="' + (isOpen ? "Fechar Assistente Bez" : "Abrir Assistente Bez") + '">' +
          '<span class="bez-fab-avatar">' + (isOpen ? I.get("close") : I.get("sparkles")) + "</span>" +
          '<span class="bez-fab-text">' +
            "<strong>Assistente Bez</strong>" +
            "<small>" + (isOpen ? "Fechar conversa" : "Texto ou voz") + "</small>" +
          "</span>" +
        "</button>";

      if (!isOpen) {
        containerEl.innerHTML = fabHtml;
        containerEl.querySelector("#bezAssistantFab").onclick = () => a.onToggleOpen && a.onToggleOpen(true);
        return;
      }

      const msgsHtml = messages.map(msg => {
        const isUser = msg.role === "user";
        const voiceBadge = isUser && msg.viaVoice
          ? '<div class="bez-voice-tag">' + I.get("mic") + "<span>Pergunta por voz</span></div>"
          : "";
        const msgActions = Array.isArray(msg.actions) && msg.actions.length
          ? '<div class="bez-msg-actions">' +
              msg.actions.map((act, idx) => {
                const isSlot = act.kind === "slot";
                const cta = act.kind === "event" ? "Abrir →" : (isSlot ? "+ Agendar" : "Abrir →");
                return (
                  '<button type="button" class="bez-action-card' + (isSlot ? " is-slot" : "") + '" data-bez-msg-act="' + S.esc(msg.id + ":" + idx) + '">' +
                    "<div><strong>" + S.esc(act.label) + "</strong>" + (act.sub ? "<small>" + S.esc(act.sub) + "</small>" : "") + "</div>" +
                    '<span class="bez-action-cta">' + cta + "</span>" +
                  "</button>"
                );
              }).join("") +
            "</div>"
          : "";

        return (
          '<div class="bez-msg ' + (isUser ? "is-user" : "is-assistant") + '">' +
            '<div class="bez-bubble">' + voiceBadge + S.esc(msg.text) + "</div>" +
            msgActions +
          "</div>"
        );
      }).join("");

      const thinkingHtml = p.isThinking
        ? '<div class="bez-msg is-assistant">' +
            '<div class="bez-typing"><span class="bez-dots"><i></i><i></i><i></i></span><span>Consultando agenda…</span></div>' +
          "</div>"
        : "";

      const sugHtml = suggestions.map((s, idx) => (
        '<button type="button" class="bez-sug-chip" data-bez-sug="' + idx + '">' + S.esc(s.label) + "</button>"
      )).join("");

      const activeDraft = p.selectedVoiceDraft || voiceSamples[0] || "Quais horários estão livres hoje?";

      const composerHtml = p.voiceRecording
        ? '<div class="bez-voice-box">' +
            '<div class="bez-voice-top">' +
              '<div class="bez-voice-status">' +
                '<span class="bez-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
                "<span>Ouvindo sua pergunta…</span>" +
              "</div>" +
              '<strong class="tnum" style="font-size:0.82rem;color:var(--bz-blue)">' + formatSeconds(p.voiceSeconds) + "</strong>" +
            "</div>" +
            '<div style="font-size:0.74rem;color:var(--bz-ink-2);font-weight:600">Simule o áudio escolhendo ou editando uma fala de exemplo:</div>' +
            '<div class="bez-voice-samples">' +
              voiceSamples.map((sample, idx) => (
                '<button type="button" class="bez-voice-sample-btn" data-bez-vsample="' + idx + '">' + S.esc(sample) + "</button>"
              )).join("") +
            "</div>" +
            '<input id="bezVoiceDraftInput" class="bez-input" type="text" value="' + S.esc(activeDraft) + '" aria-label="Transcrição simulada do áudio">' +
            '<div class="bez-voice-controls">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-bez-voice-cancel>Cancelar</button>' +
              '<button type="button" class="btn btn-primary btn-sm" data-bez-voice-send>' + I.get("send") + "<span>Enviar voz</span></button>" +
            "</div>" +
          "</div>"
        : '<form id="bezTextForm" class="bez-input-row">' +
            '<input id="bezTextInput" class="bez-input" type="text" placeholder="Pergunte sobre horários, cidades ou amanhã…" autocomplete="off" aria-label="Perguntar ao Assistente Bez">' +
            '<button type="button" class="bez-mic-btn" data-bez-mic aria-label="Fazer pergunta por voz" title="Perguntar por voz (simulado)">' + I.get("mic") + "</button>" +
            '<button type="submit" class="bez-send-btn" aria-label="Enviar mensagem" title="Enviar">' + I.get("send") + "</button>" +
          "</form>";

      containerEl.innerHTML =
        '<div class="bez-backdrop" data-bez-backdrop></div>' +
        '<section id="bezAssistantPanel" class="bez-panel" role="dialog" aria-label="Assistente Bez">' +
          '<div class="bez-sheet-handle" aria-hidden="true"></div>' +
          '<header class="bez-head">' +
            '<div class="bez-head-left">' +
              '<div class="bez-head-avatar">' + I.get("sparkles") + "</div>" +
              '<div class="bez-head-title">' +
                '<strong>Assistente Bez <span class="bez-head-badge">Demo</span></strong>' +
                "<span>Consultas rápidas por texto ou voz</span>" +
              "</div>" +
            "</div>" +
            '<div class="bez-head-actions">' +
              '<button type="button" class="bez-icon-btn" data-bez-clear aria-label="Limpar conversa" title="Limpar conversa">' + I.get("trash") + "</button>" +
              '<button type="button" class="bez-icon-btn" data-bez-close aria-label="Fechar Assistente Bez" title="Fechar">' + I.get("close") + "</button>" +
            "</div>" +
          "</header>" +
          '<div class="bez-scope-note">' +
            '<span class="bez-scope-dot" aria-hidden="true"></span>' +
            "<span>" + S.esc(p.futureNote || "Consulta em dados fictícios. Criar agendamentos por voz entrará em etapa futura.") + "</span>" +
          "</div>" +
          '<div id="bezMessagesBox" class="bez-messages" aria-live="polite">' +
            msgsHtml +
            thinkingHtml +
          "</div>" +
          '<div class="bez-suggestions" aria-label="Sugestões rápidas">' + sugHtml + "</div>" +
          '<div class="bez-composer">' + composerHtml + "</div>" +
        "</section>" +
        fabHtml;

      const msgBox = containerEl.querySelector("#bezMessagesBox");
      if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

      containerEl.querySelector("#bezAssistantFab").onclick = () => a.onToggleOpen && a.onToggleOpen(false);
      containerEl.querySelector("[data-bez-close]").onclick = () => a.onToggleOpen && a.onToggleOpen(false);
      containerEl.querySelector("[data-bez-backdrop]").onclick = () => a.onToggleOpen && a.onToggleOpen(false);
      containerEl.querySelector("[data-bez-clear]").onclick = () => a.onClearHistory && a.onClearHistory();

      containerEl.querySelectorAll("[data-bez-sug]").forEach(btn => {
        btn.onclick = () => {
          const item = suggestions[Number(btn.dataset.bezSug)];
          if (item && a.onSelectSuggestion) a.onSelectSuggestion(item.prompt);
        };
      });

      containerEl.querySelectorAll("[data-bez-msg-act]").forEach(btn => {
        btn.onclick = () => {
          const [msgId, idxStr] = btn.dataset.bezMsgAct.split(":");
          const msg = messages.find(m => m.id === msgId);
          const act = msg && msg.actions && msg.actions[Number(idxStr)];
          if (!act) return;
          if (act.kind === "event" && a.onSelectEvent) a.onSelectEvent(act.eventId);
          else if (act.kind === "slot" && a.onSelectSlot) a.onSelectSlot(act.dateKey, act.startTime, act.durationMin);
          else if (act.kind === "openNew" && a.onOpenNewAppointment) a.onOpenNewAppointment();
        };
      });

      const form = containerEl.querySelector("#bezTextForm");
      if (form) {
        const input = containerEl.querySelector("#bezTextInput");
        form.onsubmit = e => {
          e.preventDefault();
          const val = (input.value || "").trim();
          if (!val) return;
          input.value = "";
          a.onSendMessage && a.onSendMessage(val, { viaVoice: false });
        };
        const micBtn = containerEl.querySelector("[data-bez-mic]");
        if (micBtn) micBtn.onclick = () => a.onStartVoice && a.onStartVoice();
      }

      const vInput = containerEl.querySelector("#bezVoiceDraftInput");
      if (vInput) {
        containerEl.querySelectorAll("[data-bez-vsample]").forEach(btn => {
          btn.onclick = () => {
            const sample = voiceSamples[Number(btn.dataset.bezVsample)];
            if (!sample) return;
            vInput.value = sample;
            a.onSelectVoiceSample && a.onSelectVoiceSample(sample);
          };
        });
        containerEl.querySelector("[data-bez-voice-cancel]").onclick = () => a.onCancelVoice && a.onCancelVoice();
        containerEl.querySelector("[data-bez-voice-send]").onclick = () => {
          const txt = (vInput.value || "").trim();
          if (txt && a.onFinishVoice) a.onFinishVoice(txt);
        };
      }
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
