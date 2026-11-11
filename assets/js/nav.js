// Menu único do painel. Cada página tem apenas <header class="top"></header> seguido deste script;
// o cabeçalho (computador) e a barra inferior (celular) são montados aqui, iguais em todas as páginas.
(() => {
  const header = document.currentScript?.previousElementSibling;
  if (!header || header.tagName !== "HEADER") return;

  const version = new URL(document.currentScript.src).searchParams.get("v");
  const withVersion = path => version ? `${path}?v=${version}` : path;
  const file = location.pathname.split("/").pop() || "index.html";

  const icon = body => `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style="display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">${body}</svg>`;
  const icons = {
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4m10-4v4M8 14h3m-3 3h3m4-3h2"/>',
    clientes: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m4 9v-2a6 6 0 0 0-4-5.7"/>',
    orcamentos: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h4M9 12h6m-6 4h6"/>',
    campanhas: '<path d="M3 10v4h4l10 5V5L7 10H3Zm4 4 2 7h3l-2-6M21 9v6"/>',
    mais: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
  };

  // pages: arquivos em que o item aparece como "página atual".
  const desktop = [
    {label: "Agenda", href: "./", pages: ["index.html"]},
    {label: "Clientes", href: "clientes.html", pages: ["clientes.html"]},
    {label: "Orçamentos", href: "orcamentos.html", pages: ["orcamentos.html"]},
    {label: "Campanhas", href: "campanhas.html", pages: ["campanhas.html"]},
    {label: "Mensagens", href: "mensagens.html", pages: ["mensagens.html"]},
    {label: "Configurações", href: "configuracoes.html", pages: ["configuracoes.html", "tabela-precos.html"]}
  ];
  const mobile = [
    {...desktop[0], icon: icons.agenda},
    {...desktop[1], icon: icons.clientes},
    {...desktop[2], icon: icons.orcamentos},
    {...desktop[3], icon: icons.campanhas},
    {label: "Mais", href: "configuracoes.html", pages: ["configuracoes.html", "tabela-precos.html", "mensagens.html"], icon: icons.mais}
  ];
  const current = item => item.pages.includes(file) ? ' aria-current="page"' : "";

  header.className = "top";
  header.innerHTML =
    `<div class="brand"><img src="https://bezclean.com.br/imagens/LOGO.png" alt="Bez Clean"><div><b>Bez Clean</b><small>Painel operacional</small></div></div>` +
    `<nav class="main-nav" aria-label="Navegação principal">${desktop.map(item => `<a href="${withVersion(item.href)}"${current(item)}>${item.label}</a>`).join("")}</nav>` +
    `<button id="signOutBtn" class="nav-signout" type="button">Sair</button>`;

  const tabs = document.createElement("nav");
  tabs.className = "mobile-tabs";
  tabs.setAttribute("aria-label", "Páginas do painel");
  tabs.innerHTML = mobile.map(item => `<a href="${withVersion(item.href)}" class="mobile-tab${current(item) ? " is-active" : ""}"${current(item)}>${item.icon ? icon(item.icon) : ""}<span>${item.label}</span></a>`).join("");
  header.after(tabs);

  header.querySelector("#signOutBtn").addEventListener("click", async () => {
    try { await db.auth.signOut(); } catch (error) {
      // Página sem cliente Supabase carregado: encerra a sessão guardada neste aparelho.
      Object.keys(localStorage).filter(key => /^sb-.*-auth-token$/.test(key)).forEach(key => localStorage.removeItem(key));
    }
    if (file !== "index.html") location.href = "./";
  });
})();
