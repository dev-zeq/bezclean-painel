(function (root) {
  "use strict";

  const T = root.BezTime;
  const I = root.BezIcons;
  const UI = (root.BezAgendaUI = root.BezAgendaUI || {});

  /**
   * @component AppointmentForm
   * @props {
   *   mode: "create" | "edit",
   *   appointment: Appointment | null,
   *   prefillDateKey: string | null,
   *   prefillSlot: { dateKey, startTime, durationMin } | null,
   *   simulateConflictDraft: boolean,
   *   clients: Array<Client>,
   *   apartments: Array<Apartment>,
   *   servicesCatalog: Array<ServiceItem>,
   *   cleaningOptions: { faxina: string[], apartamento: string[] },
   *   existingEvents: Array<Appointment>,
   *   existingBlocks: Array<Block>
   * }
   * @actions {
   *   onSubmit(payload, { forceOverlap }),
   *   onOpenConflictModal(conflictProps, onForceSave, onApplySuggestion),
   *   onClose()
   * }
   */
  UI.AppointmentForm = {
    open: function (dialogEl, props, actions) {
      const S = UI.shared;
      const p = props || {};
      const a = actions || {};
      const isEdit = p.mode === "edit" && p.appointment;
      const ev = p.appointment;

      // Estado inicial do formulário.
      // Regra estrita: no modo criação, NÃO inventar preço, horário ou dados de cliente.
      const state = {
        id: isEdit ? ev.id : null,
        tipo: isEdit ? T.typeOf(ev) : "estofados",
        clientMode: "existing",
        clientId: isEdit ? (ev.cliente_id || (ev.clientes && ev.clientes.id) || "") : "",
        newClientName: "",
        newClientPhone: "",
        apartmentId: isEdit ? (ev.apartamento_id || (ev.apartamentos && ev.apartamentos.id) || "") : "",
        dateKey: isEdit
          ? T.dateKey(new Date(ev.inicio_em))
          : ((p.prefillSlot && p.prefillSlot.dateKey) || p.prefillDateKey || ""),
        startTime: isEdit
          ? T.hhmm(new Date(ev.inicio_em))
          : (p.prefillSlot && p.prefillSlot.startTime ? p.prefillSlot.startTime : ""),
        timeInputMode: "duration", // "duration" | "end"
        durationMin: isEdit
          ? Math.max(30, Math.round((new Date(ev.fim_em) - new Date(ev.inicio_em)) / 60000))
          : (p.prefillSlot && p.prefillSlot.durationMin ? p.prefillSlot.durationMin : ""),
        endTime: isEdit ? T.hhmm(new Date(ev.fim_em)) : "",
        selectedItems: isEdit && Array.isArray(ev.agendamento_itens)
          ? ev.agendamento_itens.map((it, idx) => ({
              id: it.id || "item-" + idx,
              nome: it.nome,
              quantidade: Math.max(1, Number(it.quantidade) || 1),
              valor: it.valor_unitario != null ? Number(it.valor_unitario) : (Number(it.valor_total) || 0)
            }))
          : [],
        cleaningDesc: isEdit && T.typeOf(ev) !== "estofados" ? (ev.descricao_servico || "") : "",
        valor: isEdit && ev.valor != null ? String(ev.valor) : "",
        endereco: isEdit ? (ev.endereco || "") : "",
        status: isEdit ? (ev.status || "confirmado") : "confirmado",
        observacoes: isEdit ? (ev.observacoes || "") : "",
        serviceQuery: ""
      };

      // Se o usuário acionou explicitamente "Simular conflito" na barra de demonstração
      if (!isEdit && p.simulateConflictDraft) {
        state.dateKey = p.prefillDateKey || "2026-11-20";
        state.startTime = "11:00";
        state.durationMin = 90;
        state.endTime = "12:30";
        state.clientId = (p.clients && p.clients[3] && p.clients[3].id) || "";
        const selCli = (p.clients || []).find(c => c.id === state.clientId);
        state.endereco = selCli ? selCli.endereco : "";
        const demoSrv = p.servicesCatalog && p.servicesCatalog[0];
        if (demoSrv) {
          state.selectedItems = [{ id: demoSrv.id, nome: demoSrv.nome, quantidade: 1, valor: demoSrv.valor }];
          state.valor = String(demoSrv.valor);
        }
      }

      if (state.startTime && state.durationMin && !state.endTime) {
        state.endTime = T.minutesToHhmm(T.toMinutes(state.startTime) + Number(state.durationMin));
      }

      function computeTimeRange() {
        if (!state.dateKey || !state.startTime) return null;
        const sMin = T.toMinutes(state.startTime);
        let eMin = null;
        if (state.timeInputMode === "end") {
          if (!state.endTime) return null;
          eMin = T.toMinutes(state.endTime);
        } else {
          const dur = Number(state.durationMin);
          if (!(dur >= 30)) return null;
          eMin = sMin + dur;
        }
        if (!(eMin > sMin)) return null;
        const startDate = T.combineDateTime(state.dateKey, T.minutesToHhmm(sMin));
        const endDate = T.combineDateTime(state.dateKey, T.minutesToHhmm(eMin));
        return {
          start: startDate,
          end: endDate,
          startMin: sMin,
          endMin: eMin,
          durationMin: eMin - sMin,
          startText: T.minutesToHhmm(sMin),
          endText: T.minutesToHhmm(eMin)
        };
      }

      function evaluateSteps() {
        const hasClient = state.tipo === "apartamento"
          ? Boolean(state.apartmentId)
          : (state.clientMode === "existing"
              ? Boolean(state.clientId)
              : Boolean(state.newClientName.trim() && state.newClientPhone.trim()));
        const range = computeTimeRange();
        const hasServices = state.tipo === "estofados"
          ? state.selectedItems.length > 0
          : Boolean(state.cleaningDesc.trim());
        const hasAddress = Boolean(state.endereco.trim());

        const pending = [];
        if (!hasClient) pending.push({ step: 2, label: state.tipo === "apartamento" ? "Apartamento" : "Cliente" });
        if (!state.dateKey) pending.push({ step: 3, label: "Data" });
        if (!state.startTime) pending.push({ step: 3, label: "Horário de início" });
        if (!range && state.startTime) pending.push({ step: 3, label: state.timeInputMode === "end" ? "Horário de término" : "Duração" });
        if (!hasServices) pending.push({ step: 4, label: state.tipo === "estofados" ? "Serviços" : "Tipo de limpeza" });
        if (!hasAddress) pending.push({ step: 5, label: "Endereço" });

        return {
          hasClient: hasClient,
          hasTime: Boolean(range),
          hasServices: hasServices,
          hasAddress: hasAddress,
          range: range,
          pending: pending
        };
      }

      function renderLivePreview() {
        const box = dialogEl.querySelector("[data-af-preview]");
        const bannerEl = dialogEl.querySelector("[data-af-conflict]");
        const pendingEl = dialogEl.querySelector("[data-af-pending]");
        if (!box || !bannerEl || !pendingEl) return;

        const evalState = evaluateSteps();
        const range = evalState.range;

        // Atualiza badges das etapas
        const badgeMap = { 2: evalState.hasClient, 3: evalState.hasTime, 4: evalState.hasServices, 5: evalState.hasAddress };
        Object.keys(badgeMap).forEach(step => {
          const stEl = dialogEl.querySelector('[data-step-badge="' + step + '"]');
          if (!stEl) return;
          stEl.className = "step-state " + (badgeMap[step] ? "is-ok" : "is-pending");
          stEl.textContent = badgeMap[step] ? "OK" : "Pendente";
        });

        // Barra de pendências
        if (evalState.pending.length === 0) {
          pendingEl.className = "pending-summary is-ready";
          pendingEl.innerHTML = "<strong>Tudo preenchido!</strong><span>Confira a prévia do horário e salve o agendamento.</span>";
        } else {
          pendingEl.className = "pending-summary";
          pendingEl.innerHTML =
            "<strong>Falta preencher:</strong>" +
            evalState.pending.map(item => (
              '<button type="button" class="pending-pill" data-jump-step="' + item.step + '">' + S.esc(item.label) + "</button>"
            )).join("");
          pendingEl.querySelectorAll("[data-jump-step]").forEach(btn => {
            btn.onclick = () => {
              const target = dialogEl.querySelector('[data-step="' + btn.dataset.jumpStep + '"]');
              if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
            };
          });
        }

        // Prévia de ocupação do dia selecionado
        if (!state.dateKey) {
          box.innerHTML =
            '<div class="preview-box-head"><strong>Prévia do horário ocupado</strong><span>Escolha uma data para ver a disponibilidade</span></div>';
          bannerEl.classList.add("hidden");
          bannerEl.innerHTML = "";
          return;
        }

        const day = T.parseLocalDate(state.dateKey);
        const split = T.daySplitForRender(p.existingEvents, p.existingBlocks, day);
        const existingSegs = split.allItems
          .filter(entry => entry.active && entry.id !== state.id)
          .map(entry => {
            const pos = T.trackPosition(entry.startMin, entry.endMin);
            return '<span class="preview-existing" style="left:' + pos.leftPct + '%;width:' + pos.widthPct + '%" title="' + S.esc(T.hhmm(entry.start) + "–" + T.hhmm(entry.end)) + '"></span>';
          })
          .join("");

        let conflicts = [];
        let proposedHtml = "";
        let overlapHtml = "";
        let headRight = "Escolha início e duração/término";

        if (range) {
          conflicts = T.detectConflicts(p.existingEvents, p.existingBlocks, range.start, range.end, state.id);
          const pos = T.trackPosition(range.startMin, range.endMin);
          proposedHtml =
            '<span class="preview-proposed' + (conflicts.length ? " has-conflict" : "") + '" style="left:' + pos.leftPct + '%;width:' + pos.widthPct + '%"></span>';

          overlapHtml = conflicts.map(c => {
            const oStart = Math.max(range.startMin, T.toMinutes(c.start));
            const oEnd = Math.min(range.endMin, T.toMinutes(c.end));
            const oPos = T.trackPosition(oStart, oEnd);
            return '<span class="preview-overlap pattern-conflict" style="left:' + oPos.leftPct + '%;width:' + oPos.widthPct + '%"></span>';
          }).join("");

          const crossTag = T.crossesNoon(range.start, range.end) ? " · atravessa 12h" : "";
          headRight = range.startText + "–" + range.endText + " (" + T.formatDuration(range.durationMin) + ")" + crossTag;
        }

        box.innerHTML =
          '<div class="preview-box-head">' +
            "<strong>Prévia em " + S.esc(T.formatDayTitle(day)) + "</strong>" +
            '<span class="tnum" style="color:' + (conflicts.length ? "var(--bz-danger)" : "var(--bz-blue)") + ';font-weight:800">' + S.esc(headRight) + "</span>" +
          "</div>" +
          '<div class="preview-track">' +
            '<span class="timeline-noon-line" aria-hidden="true"></span>' +
            existingSegs +
            proposedHtml +
            overlapHtml +
          "</div>" +
          '<div class="timeline-axis tnum"><span>08h</span><span>10h</span><span class="axis-noon">12h</span><span>14h</span><span>16h</span><span>18h</span></div>';

        const sug = range && conflicts.length
          ? T.suggestNextFreeSlot(p.existingEvents, p.existingBlocks, day, range.durationMin)
          : null;

        UI.ConflictUI.renderInlineBanner(bannerEl, { conflicts: conflicts, suggestion: sug }, {
          onApplySuggestion: (startTxt, endTxt) => {
            state.startTime = startTxt;
            state.endTime = endTxt;
            state.durationMin = T.toMinutes(endTxt) - T.toMinutes(startTxt);
            syncTimeInputs();
            renderLivePreview();
          }
        });
      }

      function syncTimeInputs() {
        const sIn = dialogEl.querySelector("#afStartTime");
        const dIn = dialogEl.querySelector("#afDuration");
        const eIn = dialogEl.querySelector("#afEndTime");
        if (sIn) sIn.value = state.startTime;
        if (dIn) dIn.value = state.durationMin;
        if (eIn) eIn.value = state.endTime;
      }

      function renderCatalogAndItems() {
        const selBox = dialogEl.querySelector("[data-af-selected-items]");
        const catBox = dialogEl.querySelector("[data-af-catalog]");
        if (!selBox || !catBox) return;

        selBox.innerHTML = state.selectedItems.length
          ? state.selectedItems.map((it, idx) => (
              '<div class="selected-item-row">' +
                "<span>" + S.esc(it.nome) + "</span>" +
                '<input type="number" min="1" value="' + it.quantidade + '" data-item-qty="' + idx + '" aria-label="Quantidade de ' + S.esc(it.nome) + '">' +
                '<strong class="tnum">' + S.esc(T.formatMoney(it.valor * it.quantidade)) + "</strong>" +
                '<button type="button" class="btn btn-ghost btn-sm" data-item-del="' + idx + '" aria-label="Remover ' + S.esc(it.nome) + '">×</button>' +
              "</div>"
            )).join("")
          : '<span style="font-size:0.8rem;color:var(--bz-muted)">Nenhum serviço selecionado ainda.</span>';

        const q = state.serviceQuery.trim().toLowerCase();
        const filtered = (p.servicesCatalog || []).filter(s => !q || s.nome.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q));
        catBox.innerHTML = filtered.map(srv => {
          const added = state.selectedItems.some(it => it.id === srv.id || it.nome === srv.nome);
          return (
            '<button type="button" class="catalog-item' + (added ? " is-selected" : "") + '" data-add-srv="' + S.esc(srv.id) + '">' +
              "<span>" + S.esc(srv.nome) + ' <small style="color:var(--bz-muted)">(' + S.esc(srv.categoria) + ")</small></span>" +
              '<strong class="tnum">' + S.esc(T.formatMoney(srv.valor)) + (added ? " ✓" : " +") + "</strong>" +
            "</button>"
          );
        }).join("");

        selBox.querySelectorAll("[data-item-qty]").forEach(inp => {
          inp.onchange = () => {
            const idx = Number(inp.dataset.itemQty);
            state.selectedItems[idx].quantidade = Math.max(1, Math.floor(Number(inp.value)) || 1);
            updateTotalFromItems();
            renderCatalogAndItems();
          };
        });

        selBox.querySelectorAll("[data-item-del]").forEach(btn => {
          btn.onclick = () => {
            state.selectedItems.splice(Number(btn.dataset.itemDel), 1);
            updateTotalFromItems();
            renderCatalogAndItems();
            renderLivePreview();
          };
        });

        catBox.querySelectorAll("[data-add-srv]").forEach(btn => {
          btn.onclick = () => {
            const srv = (p.servicesCatalog || []).find(s => s.id === btn.dataset.addSrv);
            if (!srv) return;
            const existing = state.selectedItems.find(it => it.id === srv.id || it.nome === srv.nome);
            if (existing) {
              existing.quantidade += 1;
            } else {
              state.selectedItems.push({ id: srv.id, nome: srv.nome, quantidade: 1, valor: srv.valor });
            }
            updateTotalFromItems();
            renderCatalogAndItems();
            renderLivePreview();
          };
        });
      }

      function updateTotalFromItems() {
        const valInput = dialogEl.querySelector("#afValor");
        if (state.tipo !== "estofados" || !valInput) return;
        const total = state.selectedItems.reduce((sum, it) => sum + (it.valor * it.quantidade), 0);
        state.valor = total > 0 ? String(total) : "";
        valInput.value = state.valor;
      }

      function renderBody() {
        const simBanner = p.simulateConflictDraft
          ? '<div class="badge-chip badge-airbnb" style="width:fit-content">Simulação de conflito (dados de teste apenas para demonstração)</div>'
          : "";

        const clientOptions = (p.clients || []).map(c => (
          '<option value="' + S.esc(c.id) + '"' + (state.clientId === c.id ? " selected" : "") + ">" + S.esc(c.nome + " · " + c.telefone) + "</option>"
        )).join("");

        const aptOptions = (p.apartments || []).map(apt => (
          '<option value="' + S.esc(apt.id) + '"' + (state.apartmentId === apt.id ? " selected" : "") + ">" + S.esc(apt.nome + (apt.airbnb ? " · Airbnb" : "")) + "</option>"
        )).join("");

        const cleaningList = (p.cleaningOptions && p.cleaningOptions[state.tipo]) || [];
        const cleaningDatalist = cleaningList.map(opt => '<option value="' + S.esc(opt) + '">').join("");

        dialogEl.innerHTML =
          '<form id="afForm" style="display:flex;flex-direction:column;height:100%;min-height:0">' +
            '<div class="dialog-head">' +
              "<div>" +
                '<p class="eyebrow">' + (isEdit ? "EDITAR AGENDAMENTO" : "NOVO AGENDAMENTO") + "</p>" +
                "<h2>" + (isEdit ? "Atualizar atendimento" : "Agendar atendimento") + "</h2>" +
              "</div>" +
              '<button type="button" class="dialog-close" data-af-close aria-label="Fechar formulário">' + I.get("close") + "</button>" +
            "</div>" +
            '<div class="dialog-body">' +
              simBanner +
              '<div class="pending-summary" data-af-pending></div>' +

              // Seção 1: Tipo
              '<section class="form-step" data-step="1">' +
                '<div class="step-head">' +
                  '<div class="step-title"><span class="step-num">1</span><strong>Tipo de atendimento</strong></div>' +
                  '<span class="step-state is-ok">OK</span>' +
                "</div>" +
                '<div class="type-selector" role="group" aria-label="Tipo de atendimento">' +
                  '<button type="button" class="type-option type-estofados" data-af-type="estofados" aria-pressed="' + (state.tipo === "estofados") + '">' + I.typeIcon("estofados") + "<span>Estofados</span></button>" +
                  '<button type="button" class="type-option type-faxina" data-af-type="faxina" aria-pressed="' + (state.tipo === "faxina") + '">' + I.typeIcon("faxina") + "<span>Faxina avulsa</span></button>" +
                  '<button type="button" class="type-option type-apartamento" data-af-type="apartamento" aria-pressed="' + (state.tipo === "apartamento") + '">' + I.typeIcon("apartamento") + "<span>Apartamento</span></button>" +
                "</div>" +
              "</section>" +

              // Seção 2: Cliente ou Apartamento
              '<section class="form-step" data-step="2">' +
                '<div class="step-head">' +
                  '<div class="step-title"><span class="step-num">2</span><strong>' + (state.tipo === "apartamento" ? "Apartamento" : "Cliente") + "</strong></div>" +
                  '<span class="step-state is-pending" data-step-badge="2">Pendente</span>' +
                "</div>" +
                (state.tipo === "apartamento"
                  ? '<label class="field">Selecionar apartamento<select id="afApartment"><option value="">Selecione um apartamento</option>' + aptOptions + "</select></label>"
                  : '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
                      '<span style="font-size:0.8rem;color:var(--bz-muted)">Busque na lista ou cadastre na hora</span>' +
                      '<button type="button" class="btn btn-secondary btn-sm" data-af-client-toggle>' + (state.clientMode === "existing" ? "+ Novo cliente" : "Usar cliente existente") + "</button>" +
                    "</div>" +
                    (state.clientMode === "existing"
                      ? '<label class="field">Cliente existente<select id="afClient"><option value="">Selecione um cliente</option>' + clientOptions + "</select></label>"
                      : '<div class="field-grid">' +
                          '<label class="field">Nome completo<input id="afNewName" placeholder="Ex.: Ana Paula Souza" value="' + S.esc(state.newClientName) + '"></label>' +
                          '<label class="field">WhatsApp<input id="afNewPhone" placeholder="(47) 99999-9999" value="' + S.esc(state.newClientPhone) + '"></label>' +
                        "</div>")) +
              "</section>" +

              // Seção 3: Data, Horário e Prévia
              '<section class="form-step" data-step="3">' +
                '<div class="step-head">' +
                  '<div class="step-title"><span class="step-num">3</span><strong>Data e horário</strong></div>' +
                  '<span class="step-state is-pending" data-step-badge="3">Pendente</span>' +
                "</div>" +
                '<div class="field-grid">' +
                  '<label class="field">Data<input id="afDate" type="date" value="' + S.esc(state.dateKey) + '"></label>' +
                  '<label class="field">Horário de início<input id="afStartTime" type="time" value="' + S.esc(state.startTime) + '"></label>' +
                "</div>" +
                '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
                  '<span style="font-size:0.8rem;font-weight:700;color:var(--bz-ink-2)">Definir término por:</span>' +
                  '<div class="segmented-mini" role="group">' +
                    '<button type="button" data-af-tmode="duration" aria-pressed="' + (state.timeInputMode === "duration") + '">Duração</button>' +
                    '<button type="button" data-af-tmode="end" aria-pressed="' + (state.timeInputMode === "end") + '">Horário de término</button>' +
                  "</div>" +
                "</div>" +
                (state.timeInputMode === "duration"
                  ? '<div class="field-grid">' +
                      '<label class="field">Duração (minutos)<input id="afDuration" type="number" min="30" step="30" placeholder="Ex.: 120" value="' + S.esc(state.durationMin) + '"></label>' +
                      '<div class="field"><span>Atalhos de duração</span><div style="display:flex;flex-wrap:wrap;gap:6px">' +
                        [60, 90, 120, 180, 240].map(m => '<button type="button" class="btn btn-secondary btn-sm" data-af-dur-preset="' + m + '">' + T.formatDuration(m) + "</button>").join("") +
                      "</div></div>" +
                    "</div>"
                  : '<label class="field">Horário de término<input id="afEndTime" type="time" value="' + S.esc(state.endTime) + '"></label>') +
                '<div class="preview-box" data-af-preview></div>' +
                '<div class="hidden" data-af-conflict></div>' +
              "</section>" +

              // Seção 4: Serviços e valor
              '<section class="form-step" data-step="4">' +
                '<div class="step-head">' +
                  '<div class="step-title"><span class="step-num">4</span><strong>Serviços e valor</strong></div>' +
                  '<span class="step-state is-pending" data-step-badge="4">Pendente</span>' +
                "</div>" +
                (state.tipo === "estofados"
                  ? '<div class="selected-items-list" data-af-selected-items></div>' +
                    '<label class="field">Buscar no catálogo de estofados<input id="afServiceSearch" type="search" placeholder="Ex.: sofá, colchão, cadeira…" value="' + S.esc(state.serviceQuery) + '"></label>' +
                    '<div class="catalog-list" data-af-catalog></div>'
                  : '<label class="field">Descrição da limpeza<input id="afCleaningDesc" list="afCleaningOptions" placeholder="Ex.: Limpeza de saída (check-out)" value="' + S.esc(state.cleaningDesc) + '"><datalist id="afCleaningOptions">' + cleaningDatalist + "</datalist></label>") +
                '<label class="field">Valor total (R$)<input id="afValor" type="number" min="0" step="0.01" placeholder="Informe ou deixe em branco" value="' + S.esc(state.valor) + '"></label>' +
              "</section>" +

              // Seção 5: Endereço, status e observações
              '<section class="form-step" data-step="5">' +
                '<div class="step-head">' +
                  '<div class="step-title"><span class="step-num">5</span><strong>Endereço, status e observações</strong></div>' +
                  '<span class="step-state is-pending" data-step-badge="5">Pendente</span>' +
                "</div>" +
                '<label class="field">Endereço do atendimento<input id="afAddress" placeholder="Rua, número, complemento, bairro e cidade" value="' + S.esc(state.endereco) + '"></label>' +
                '<label class="field">Situação<select id="afStatus">' +
                  '<option value="confirmado"' + (state.status === "confirmado" ? " selected" : "") + ">Confirmado</option>" +
                  '<option value="provisorio"' + (state.status === "provisorio" ? " selected" : "") + ">A confirmar (provisório)</option>" +
                  (isEdit && !["confirmado", "provisorio"].includes(state.status)
                    ? '<option value="' + S.esc(state.status) + '" selected>' + S.esc((T.STATUS[state.status] && T.STATUS[state.status].label) || state.status) + "</option>"
                    : "") +
                "</select></label>" +
                '<label class="field">Observações para a equipe<textarea id="afNotes" placeholder="Acesso, portaria, pets, manchas específicas…">' + S.esc(state.observacoes) + "</textarea></label>" +
              "</section>" +

              '<p class="form-error-msg hidden" data-af-error></p>' +
            "</div>" +
            '<div class="dialog-footer">' +
              '<button type="button" class="btn btn-secondary" data-af-close>Cancelar</button>' +
              '<button type="submit" class="btn btn-primary">' + (isEdit ? "Salvar alterações" : "Salvar agendamento") + "</button>" +
            "</div>" +
          "</form>";

        bindEvents();
        if (state.tipo === "estofados") renderCatalogAndItems();
        renderLivePreview();
      }

      function bindEvents() {
        const close = () => {
          if (dialogEl.open) dialogEl.close();
          a.onClose && a.onClose();
        };

        dialogEl.querySelectorAll("[data-af-close]").forEach(btn => { btn.onclick = close; });

        dialogEl.querySelectorAll("[data-af-type]").forEach(btn => {
          btn.onclick = () => {
            state.tipo = btn.dataset.afType;
            renderBody();
          };
        });

        const cliToggle = dialogEl.querySelector("[data-af-client-toggle]");
        if (cliToggle) {
          cliToggle.onclick = () => {
            state.clientMode = state.clientMode === "existing" ? "new" : "existing";
            renderBody();
          };
        }

        const cliSel = dialogEl.querySelector("#afClient");
        if (cliSel) {
          cliSel.onchange = () => {
            state.clientId = cliSel.value;
            const found = (p.clients || []).find(c => c.id === state.clientId);
            if (found && found.endereco) {
              state.endereco = found.endereco;
              const addrInp = dialogEl.querySelector("#afAddress");
              if (addrInp) addrInp.value = state.endereco;
            }
            renderLivePreview();
          };
        }

        const aptSel = dialogEl.querySelector("#afApartment");
        if (aptSel) {
          aptSel.onchange = () => {
            state.apartmentId = aptSel.value;
            const found = (p.apartments || []).find(ap => ap.id === state.apartmentId);
            if (found) {
              state.endereco = [found.edificio, found.endereco].filter(Boolean).join(" · ");
              const addrInp = dialogEl.querySelector("#afAddress");
              if (addrInp) addrInp.value = state.endereco;
              if (!state.cleaningDesc) {
                state.cleaningDesc = found.airbnb ? "Troca de hóspede (Airbnb)" : "Limpeza completa de apartamento";
                const cInp = dialogEl.querySelector("#afCleaningDesc");
                if (cInp) cInp.value = state.cleaningDesc;
              }
            }
            renderLivePreview();
          };
        }

        const nName = dialogEl.querySelector("#afNewName");
        if (nName) nName.oninput = () => { state.newClientName = nName.value; renderLivePreview(); };
        const nPhone = dialogEl.querySelector("#afNewPhone");
        if (nPhone) nPhone.oninput = () => { state.newClientPhone = nPhone.value; renderLivePreview(); };

        dialogEl.querySelector("#afDate").onchange = e => { state.dateKey = e.target.value; renderLivePreview(); };
        dialogEl.querySelector("#afStartTime").onchange = e => {
          state.startTime = e.target.value;
          if (state.startTime && state.durationMin) {
            state.endTime = T.minutesToHhmm(T.toMinutes(state.startTime) + Number(state.durationMin));
          }
          renderLivePreview();
        };

        dialogEl.querySelectorAll("[data-af-tmode]").forEach(btn => {
          btn.onclick = () => {
            state.timeInputMode = btn.dataset.afTmode;
            if (state.timeInputMode === "end" && state.startTime && state.durationMin) {
              state.endTime = T.minutesToHhmm(T.toMinutes(state.startTime) + Number(state.durationMin));
            }
            renderBody();
          };
        });

        const durInp = dialogEl.querySelector("#afDuration");
        if (durInp) durInp.oninput = () => {
          state.durationMin = durInp.value;
          renderLivePreview();
        };

        dialogEl.querySelectorAll("[data-af-dur-preset]").forEach(btn => {
          btn.onclick = () => {
            state.durationMin = Number(btn.dataset.afDurPreset);
            if (durInp) durInp.value = state.durationMin;
            renderLivePreview();
          };
        });

        const endInp = dialogEl.querySelector("#afEndTime");
        if (endInp) endInp.onchange = () => {
          state.endTime = endInp.value;
          if (state.startTime && state.endTime) {
            state.durationMin = T.toMinutes(state.endTime) - T.toMinutes(state.startTime);
          }
          renderLivePreview();
        };

        const srvSearch = dialogEl.querySelector("#afServiceSearch");
        if (srvSearch) srvSearch.oninput = () => { state.serviceQuery = srvSearch.value; renderCatalogAndItems(); };

        const cleanInp = dialogEl.querySelector("#afCleaningDesc");
        if (cleanInp) cleanInp.oninput = () => { state.cleaningDesc = cleanInp.value; renderLivePreview(); };

        dialogEl.querySelector("#afValor").oninput = e => { state.valor = e.target.value; };
        dialogEl.querySelector("#afAddress").oninput = e => { state.endereco = e.target.value; renderLivePreview(); };
        dialogEl.querySelector("#afStatus").onchange = e => { state.status = e.target.value; };
        dialogEl.querySelector("#afNotes").oninput = e => { state.observacoes = e.target.value; };

        dialogEl.querySelector("#afForm").onsubmit = e => {
          e.preventDefault();
          const errEl = dialogEl.querySelector("[data-af-error]");
          const evalState = evaluateSteps();
          if (evalState.pending.length > 0 || !evalState.range) {
            errEl.classList.remove("hidden");
            errEl.textContent = "Complete os campos pendentes: " + evalState.pending.map(x => x.label).join(", ") + ".";
            const firstStep = evalState.pending[0] ? evalState.pending[0].step : 3;
            const target = dialogEl.querySelector('[data-step="' + firstStep + '"]');
            if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          errEl.classList.add("hidden");

          const range = evalState.range;
          const clientObj = state.tipo !== "apartamento"
            ? (state.clientMode === "existing"
                ? (p.clients || []).find(c => c.id === state.clientId)
                : { id: "cli-" + Date.now(), nome: state.newClientName.trim(), telefone: state.newClientPhone.trim(), endereco: state.endereco.trim() })
            : null;
          const aptObj = state.tipo === "apartamento"
            ? (p.apartments || []).find(ap => ap.id === state.apartmentId)
            : null;

          const desc = state.tipo === "estofados"
            ? state.selectedItems.map(it => (it.quantidade > 1 ? it.quantidade + "× " : "") + it.nome).join(" + ")
            : state.cleaningDesc.trim();

          const payload = {
            id: state.id,
            tipo: state.tipo,
            status: state.status,
            inicio_em: range.start.toISOString(),
            fim_em: range.end.toISOString(),
            cliente_id: clientObj ? clientObj.id : null,
            clientes: clientObj,
            apartamento_id: aptObj ? aptObj.id : null,
            apartamentos: aptObj,
            endereco: state.endereco.trim(),
            descricao_servico: desc,
            agendamento_itens: state.tipo === "estofados"
              ? state.selectedItems.map(it => ({
                  nome: it.nome,
                  quantidade: it.quantidade,
                  valor_unitario: it.valor,
                  valor_total: it.valor * it.quantidade
                }))
              : [],
            valor: Number(state.valor) || 0,
            observacoes: state.observacoes.trim()
          };

          const conflicts = T.detectConflicts(p.existingEvents, p.existingBlocks, range.start, range.end, state.id);
          if (conflicts.length && a.onOpenConflictModal) {
            const sug = T.suggestNextFreeSlot(p.existingEvents, p.existingBlocks, T.parseLocalDate(state.dateKey), range.durationMin);
            a.onOpenConflictModal(
              {
                conflicts: conflicts,
                proposedLabel: range.startText + "–" + range.endText + " (" + T.formatDayTitle(range.start) + ")",
                suggestion: sug
              },
              () => {
                if (dialogEl.open) dialogEl.close();
                a.onSubmit && a.onSubmit(payload, { forceOverlap: true });
              },
              (sugStart, sugEnd) => {
                state.startTime = sugStart;
                state.endTime = sugEnd;
                state.durationMin = T.toMinutes(sugEnd) - T.toMinutes(sugStart);
                syncTimeInputs();
                renderLivePreview();
              }
            );
            return;
          }

          if (dialogEl.open) dialogEl.close();
          a.onSubmit && a.onSubmit(payload, { forceOverlap: false });
        };
      }

      renderBody();
      if (!dialogEl.open) dialogEl.showModal();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
