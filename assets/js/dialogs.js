+(() => {
  const proto = window.HTMLDialogElement?.prototype;
  if (proto && !proto.__bezcleanPatched) {
    proto.__bezcleanPatched = true;
    let scrollY = 0;
    const lock = () => {
      if (document.body.classList.contains("modal-open")) return;
      scrollY = window.scrollY;
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add("modal-open");
    };
    const unlock = () => {
      if (document.querySelector("dialog[open]") || !document.body.classList.contains("modal-open")) return;
      document.body.classList.remove("modal-open");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
    const showModal = proto.showModal;
    const close = proto.close;
    proto.showModal = function (...args) { lock(); return showModal.apply(this, args); };
    proto.close = function (...args) { const result = close.apply(this, args); queueMicrotask(unlock); return result; };
    document.addEventListener("close", unlock, true);
  }

  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function enableClientSearch(select) {
    if (select.dataset.clientSearchReady) return;
    select.dataset.clientSearchReady = "true";
    select.classList.add("client-picker-native");

    const picker = document.createElement("div");
    picker.className = "client-picker";
    picker.innerHTML = '<input class="client-picker-input" type="search" inputmode="search" autocomplete="off" placeholder="Digite nome ou WhatsApp" aria-label="Buscar cliente"><div class="client-picker-results hidden" role="listbox"></div>';
    select.insertAdjacentElement("afterend", picker);

    const input = picker.querySelector("input");
    const results = picker.querySelector(".client-picker-results");
    const optionText = option => option.textContent.trim();
    const selectedText = () => optionText(select.options[select.selectedIndex]);

    const sync = () => {
      const selected = select.value ? selectedText() : "";
      input.dataset.selectedValue = select.value;
      if (document.activeElement !== input) input.value = selected;
      input.disabled = select.disabled;
      if (select.disabled) results.classList.add("hidden");
    };

    const render = () => {
      const term = normalize(input.value);
      const options = [...select.options].filter(option => option.value && normalize(optionText(option)).includes(term));
      results.innerHTML = "";
      if (options.length) {
        options.forEach(option => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("role", "option");
          button.dataset.value = option.value;
          button.textContent = optionText(option);
          button.addEventListener("click", () => {
            select.value = button.dataset.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            sync();
            results.classList.add("hidden");
            input.blur();
          });
          results.append(button);
        });
      } else {
        const message = document.createElement("p");
        message.textContent = "Nenhum cliente encontrado.";
        results.append(message);
      }
      results.classList.toggle("hidden", !input.matches(":focus"));
    };

    input.addEventListener("focus", () => { input.value = ""; render(); });
    input.addEventListener("input", render);
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") { results.classList.add("hidden"); input.blur(); }
    });
    select.addEventListener("change", sync);
    select.form?.addEventListener("reset", () => setTimeout(sync));
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    document.addEventListener("pointerdown", event => { if (!picker.contains(event.target)) results.classList.add("hidden"); });
    sync();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#clientSelect, #client").forEach(enableClientSearch);
  });
})();
