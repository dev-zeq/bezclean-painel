(function () {
  const db = window.supabase.createClient("https://qunaqtxadifmwbmycqum.supabase.co", "sb_publishable_iMbIE9yLK6VGMLaEsYFbHA_S42mbd0W");
  const $ = id => document.getElementById(id);
  const core = window.PriceTableCore;
  const categories = { sofa: "Sofás", poltrona: "Poltronas", colchao: "Colchões", cadeiras: "Cadeiras", automotivo: "Automotivo", sofa_modelo: "Adicionais para sofá" };
  let services = [];
  let promo = null;

  function escape(value) {
    const element = document.createElement("i");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
  }

  function setStatus(message, tone) {
    const node = $("priceStatus");
    node.textContent = message || "";
    node.className = "price-status" + (tone ? " " + tone : "");
  }

  function friendlyError(error) {
    const message = String((error && error.message) || error || "Erro desconhecido");
    if ((error && error.code) === "42501" || /row.level security|permission denied/i.test(message)) return "Sem permissão para alterar esta tabela. Entre novamente e tente.";
    if ((error && error.code) === "42703" || /valor_(normal|desconto|especial).*schema cache|column .* does not exist/i.test(message)) return "A migração da Etapa 02 ainda não está disponível neste ambiente. Nenhuma alteração foi feita.";
    if (/network|failed to fetch|load failed/i.test(message)) return "Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente.";
    return "Não foi possível salvar. Detalhe: " + message;
  }

  function categoryLabel(value) {
    return categories[value] || (value || "Outros");
  }

  function rowsForCategory(category, data) {
    return data.map(service => {
      const validation = core.validateService(service);
      const warning = validation.warnings.length ? '<p class="price-warning">' + escape(validation.warnings[0]) + "</p>" : "";
      const inactive = !service.ativo ? " inactive" : "";
      const actionText = service.ativo ? "Desativar" : "Ativar";
      const actionClass = service.ativo ? "" : " is-inactive";
      return '<article class="price-row' + inactive + '" data-id="' + service.id + '">' +
        '<label>Serviço<input data-field="nome" maxlength="160" value="' + escape(service.nome) + '"></label>' +
        '<label>Normal<input data-field="valor_normal" inputmode="decimal" value="' + escape(core.formatMoney(service.valor_normal)) + '"></label>' +
        '<label>Desconto <small>(opcional)</small><input data-field="valor_desconto" inputmode="decimal" placeholder="Não configurado" value="' + escape(core.formatOptionalMoney(service.valor_desconto)) + '"></label>' +
        '<label>Especial <small>(opcional)</small><input data-field="valor_especial" inputmode="decimal" placeholder="Não configurado" value="' + escape(core.formatOptionalMoney(service.valor_especial)) + '"></label>' +
        '<div class="price-row-actions"><button type="button" class="toggle' + actionClass + '" data-toggle="' + service.id + '">' + actionText + '</button><button type="button" class="save" data-save="' + service.id + '">Salvar</button></div>' +
        warning + '<p class="price-row-message" aria-live="polite"></p></article>';
    }).join("");
  }

  function render() {
    const search = $("priceSearch").value.trim().toLocaleLowerCase("pt-BR");
    const selectedCategory = $("categoryFilter").value;
    const visibility = $("activeFilter").value;
    const filtered = services.filter(service => {
      const byName = !search || service.nome.toLocaleLowerCase("pt-BR").includes(search);
      const byCategory = !selectedCategory || service.categoria === selectedCategory;
      const byActive = visibility === "todos" || (visibility === "ativos" ? service.ativo : !service.ativo);
      return byName && byCategory && byActive;
    });
    const groups = new Map();
    filtered.forEach(service => {
      const category = service.categoria || "outros";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(service);
    });
    const ordered = [...groups.keys()].sort((left, right) => categoryLabel(left).localeCompare(categoryLabel(right), "pt-BR"));
    $("priceGroups").innerHTML = ordered.length ? ordered.map(category => '<section class="price-category"><header class="price-category-head"><h2>' + escape(categoryLabel(category)) + '</h2><span>' + groups.get(category).length + (groups.get(category).length === 1 ? " serviço" : " serviços") + '</span></header><div class="price-grid-head"><span>Serviço</span><span>Normal</span><span>Desconto</span><span>Especial</span><span>Ativo</span><span>Ação</span></div>' + rowsForCategory(category, groups.get(category)) + "</section>").join("") : '<p class="price-empty">Nenhum serviço corresponde aos filtros.</p>';
    bindRows();
  }

  function readRow(row, existing) {
    const copy = Object.assign({}, existing);
    row.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      copy[field] = field === "nome" ? input.value : (field === "valor_normal" ? core.parseMoney(input.value) : core.parseOptionalMoney(input.value));
    });
    return copy;
  }

  function rowMessage(row, message, tone) {
    const node = row.querySelector(".price-row-message");
    node.textContent = message || "";
    node.className = "price-row-message" + (tone ? " " + tone : "");
  }

  function bindRows() {
    document.querySelectorAll("[data-save]").forEach(button => button.onclick = async () => {
      const id = button.dataset.save;
      const existing = services.find(service => service.id === id);
      const row = button.closest(".price-row");
      const draft = readRow(row, existing);
      const validation = core.validateService(draft);
      if (Object.keys(validation.errors).length) {
        rowMessage(row, Object.values(validation.errors)[0]);
        return;
      }
      button.disabled = true;
      rowMessage(row, "Salvando…");
      const payload = core.updatePayload(draft);
      const result = await db.from("catalogo_precos").update(payload).eq("id", id).select("id,nome,categoria,tipo,destaque,ativo,valor_normal,valor_desconto,valor_especial").single();
      button.disabled = false;
      if (result.error) {
        rowMessage(row, friendlyError(result.error));
        return;
      }
      Object.assign(existing, result.data);
      render();
      const updated = document.querySelector('.price-row[data-id="' + id + '"]');
      if (updated) rowMessage(updated, validation.warnings.length ? "Salvo. " + validation.warnings[0] : "Alterações salvas.", "success");
    });
    document.querySelectorAll("[data-toggle]").forEach(button => button.onclick = async () => {
      const id = button.dataset.toggle;
      const existing = services.find(service => service.id === id);
      const next = !existing.ativo;
      if (!window.confirm((next ? "Ativar" : "Desativar") + ' o serviço "' + existing.nome + '"? Orçamentos históricos não serão alterados.')) return;
      button.disabled = true;
      const result = await db.from("catalogo_precos").update({ ativo: next }).eq("id", id).select("id,nome,categoria,tipo,destaque,ativo,valor_normal,valor_desconto,valor_especial").single();
      if (result.error) {
        button.disabled = false;
        rowMessage(button.closest(".price-row"), friendlyError(result.error));
        return;
      }
      Object.assign(existing, result.data);
      setStatus(next ? "Serviço ativado com sucesso." : "Serviço desativado com sucesso. Orçamentos antigos permanecem iguais.");
      render();
      const updated = document.querySelector('.price-row[data-id="' + id + '"]');
      if (updated) rowMessage(updated, next ? "Serviço ativado." : "Serviço desativado. Orçamentos antigos permanecem iguais.", "success");
    });
  }

  function populateCategories() {
    const values = [...new Set(services.map(service => service.categoria || "outros"))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "pt-BR"));
    $("categoryFilter").innerHTML = '<option value="">Todas as categorias</option>' + values.map(value => '<option value="' + escape(value) + '">' + escape(categoryLabel(value)) + "</option>").join("");
  }


  function today() {
    return new Date().toLocaleDateString("en-CA");
  }

  function promoSelectedCategories() {
    return [...document.querySelectorAll("[data-promo-cat]:checked")].map(input => input.dataset.promoCat);
  }

  function renderPromo() {
    const selected = promo && promo.categorias ? promo.categorias : [];
    const values = [...new Set(services.map(service => service.categoria || "outros"))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "pt-BR"));
    $("promoActive").checked = Boolean(promo && promo.ativa);
    $("promoPercent").value = promo && Number(promo.percentual) > 0 ? String(Number(promo.percentual)).replace(".", ",") : "";
    $("promoUntil").value = (promo && promo.ate) || "";
    $("promoAll").checked = !selected.length;
    $("promoCategories").innerHTML = values.map(value => '<label><input type="checkbox" data-promo-cat="' + escape(value) + '"' + (selected.includes(value) ? " checked" : "") + "> " + escape(categoryLabel(value)) + "</label>").join("");
    document.querySelectorAll("[data-promo-cat]").forEach(input => input.onchange = () => { $("promoAll").checked = !promoSelectedCategories().length; });
    $("promoAll").onchange = () => { if ($("promoAll").checked) document.querySelectorAll("[data-promo-cat]").forEach(input => { input.checked = false; }); else $("promoAll").checked = !promoSelectedCategories().length; };
    const live = core.promoActive(promo, today());
    $("promoSummary").textContent = live ? "No ar: " + Number(promo.percentual) + "% de desconto em " + (selected.length ? selected.map(categoryLabel).join(", ") : "todos os serviços") + (promo.ate ? " até " + promo.ate.split("-").reverse().join("/") : "") + "." : "";
  }

  async function savePromo() {
    const message = $("promoMessage");
    const text = $("promoPercent").value.trim();
    const percent = text === "" ? 0 : core.parseMoney(text);
    const active = $("promoActive").checked;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100 || (active && percent <= 0)) {
      message.textContent = "Informe uma porcentagem de 1 a 100.";
      return;
    }
    const categories = $("promoAll").checked ? [] : promoSelectedCategories();
    if (!$("promoAll").checked && !categories.length) {
      message.textContent = "Escolha onde a promoção vale.";
      return;
    }
    $("promoSave").disabled = true;
    message.textContent = "Salvando…";
    const session = await db.auth.getSession();
    const payload = { ativa: active, percentual: percent, categorias: categories, ate: $("promoUntil").value || null, updated_at: new Date().toISOString() };
    if (promo && promo.id) payload.id = promo.id;
    else payload.owner_id = session.data.session.user.id;
    const result = await db.from("promocao_precos").upsert(payload, { onConflict: "owner_id" }).select("id,ativa,percentual,categorias,ate").single();
    $("promoSave").disabled = false;
    if (result.error) {
      message.textContent = "Não foi possível salvar a promoção. Detalhe: " + (result.error.message || result.error);
      return;
    }
    promo = result.data;
    renderPromo();
    message.textContent = active ? "Promoção salva e ativa." : "Promoção salva (desligada).";
  }

  async function load() {
    setStatus("Carregando tabela de preços…");
    const result = await db.from("catalogo_precos").select("id,nome,categoria,tipo,destaque,ativo,valor_normal,valor_desconto,valor_especial").order("categoria").order("nome");
    if (result.error) {
      setStatus(friendlyError(result.error), "error");
      $("priceGroups").innerHTML = "";
      $("migrationNotice").hidden = false;
      return;
    }
    services = result.data || [];
    const promoResult = await db.from("promocao_precos").select("id,ativa,percentual,categorias,ate").maybeSingle();
    promo = promoResult.error ? null : promoResult.data;
    populateCategories();
    renderPromo();
    render();
    setStatus(services.length ? services.length + " serviços carregados." : "Nenhum serviço encontrado.");
  }

  async function boot() {
    const session = await db.auth.getSession();
    if (!session.data.session) {
      location.href = "./?v=20261111b";
      return;
    }
    ["priceSearch", "categoryFilter", "activeFilter"].forEach(id => $(id).addEventListener(id === "priceSearch" ? "input" : "change", render));
    $("promoSave").onclick = savePromo;
    await load();
  }

  boot();
})();
