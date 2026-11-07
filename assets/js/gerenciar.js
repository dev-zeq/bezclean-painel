(function () {
  // Confirmação em diálogo próprio (funciona no PWA) e menu de ações com ícones.
  let dialog;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "manageConfirm";
    dialog.innerHTML = '<form method="dialog" class="modal manage-confirm"><h2 id="manageConfirmTitle"></h2><p id="manageConfirmText"></p><div class="actions"><button type="button" class="secondary" data-manage="cancel">Cancelar</button><button type="button" id="manageConfirmOk" class="primary" data-manage="ok">Confirmar</button></div></form>';
    document.body.appendChild(dialog);
    return dialog;
  }

  // Manage.confirm({title, message, confirmLabel, danger}) -> Promise<boolean>
  function confirmAction(options) {
    const d = ensureDialog();
    d.querySelector("#manageConfirmTitle").textContent = options.title || "Confirmar";
    d.querySelector("#manageConfirmText").textContent = options.message || "";
    const ok = d.querySelector("#manageConfirmOk");
    ok.textContent = options.confirmLabel || "Confirmar";
    ok.classList.toggle("danger", Boolean(options.danger));
    return new Promise(function (resolve) {
      let settled = false;
      const finish = function (value) {
        if (settled) return;
        settled = true;
        d.removeEventListener("click", onClick);
        d.removeEventListener("cancel", onCancel);
        if (d.open) d.close();
        resolve(value);
      };
      const onClick = function (event) {
        const action = event.target && event.target.dataset && event.target.dataset.manage;
        if (action === "ok") finish(true);
        if (action === "cancel") finish(false);
      };
      const onCancel = function (event) { event.preventDefault(); finish(false); };
      d.addEventListener("click", onClick);
      d.addEventListener("cancel", onCancel);
      d.showModal();
    });
  }

  const escapeHtml = function (value) {
    const node = document.createElement("i");
    node.textContent = value == null ? "" : value;
    return node.innerHTML;
  };

  // Manage.menu([{id, icon, label, danger, hidden}]) -> HTML de um menu "Mais ações".
  function menu(items) {
    const visible = items.filter(function (item) { return !item.hidden; });
    if (!visible.length) return "";
    return '<details class="action-menu"><summary>⋯ Mais ações</summary><div class="action-list">' + visible.map(function (item) {
      return '<button type="button" class="' + (item.danger ? "danger-text" : "") + '" data-action="' + escapeHtml(item.id) + '"><span aria-hidden="true">' + item.icon + "</span> " + escapeHtml(item.label) + "</button>";
    }).join("") + "</div></details>";
  }

  // Liga os botões do menu dentro de `container`: handlers[id]() é chamado e o menu fecha.
  function bindMenu(container, handlers) {
    container.querySelectorAll("[data-action]").forEach(function (button) {
      button.onclick = function () {
        const details = button.closest("details");
        if (details) details.open = false;
        const handler = handlers[button.dataset.action];
        if (handler) handler();
      };
    });
  }

  window.Manage = { confirm: confirmAction, menu: menu, bindMenu: bindMenu };
})();
