(function (root) {
  "use strict";

  function svg(body, cls) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (cls ? ' class="' + cls + '"' : "") +
      ">" +
      body +
      "</svg>"
    );
  }

  const ICONS = {
    estofados: () => svg('<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M2 11a2 2 0 0 1 2 2v3h16v-3a2 2 0 0 1 2-2"/><path d="M6 16v3m12-3v3"/>'),
    faxina: () => svg('<path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z"/><path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9Z"/><path d="M19 14l.7 1.6L21.3 16l-1.6.7L19 18.3l-.7-1.6L16.7 16l1.6-.7Z"/>'),
    apartamento: () => svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/>'),
    bloqueio: () => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    confirmado: () => svg('<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>'),
    provisorio: () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    em_andamento: () => svg('<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/>'),
    concluido: () => svg('<path d="M20 6 9 17l-5-5"/>'),
    cancelado: () => svg('<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6m0-6 6 6"/>'),
    whatsapp: () => svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'),
    mapPin: () => svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    phone: () => svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    edit: () => svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/>'),
    lock: () => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    plus: () => svg('<path d="M12 5v14m-7-7h14"/>'),
    calendar: () => svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>'),
    clock: () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    alertTriangle: () => svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4m0 4h.01"/>'),
    refresh: () => svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
    sun: () => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/>'),
    sunset: () => svg('<path d="M12 10V3m0 0-3 3m3-3 3 3M3 18h18M5 14a7 7 0 0 1 14 0"/>'),
    arrowLeft: () => svg('<path d="m15 18-6-6 6-6"/>'),
    arrowRight: () => svg('<path d="m9 18 6-6-6-6"/>'),
    close: () => svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    users: () => svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    fileText: () => svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>'),
    megaphone: () => svg('<path d="M3 11v2a1 1 0 0 0 1 1h3l9 4V6l-9 4H4a1 1 0 0 0-1 1Z"/><path d="m7 14 1.5 5H11l-1.5-5"/>'),
    more: () => svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    sparkles: () => svg('<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7Z"/><path d="M5 17l.8 2L8 19.8l-2.2.8L5 23l-.8-2.4L2 19.8l2.2-.8Z"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6Z"/>'),
    mic: () => svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3m-4 0h8"/>'),
    send: () => svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
    stop: () => svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    trash: () => svg('<path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    bot: () => svg('<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6"/>'),
    moon: () => svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')
  };

  root.BezIcons = {
    get: function (name) {
      return ICONS[name] ? ICONS[name]() : "";
    },
    typeIcon: function (type) {
      if (type === "faxina") return ICONS.faxina();
      if (type === "apartamento") return ICONS.apartamento();
      if (type === "bloqueio") return ICONS.bloqueio();
      return ICONS.estofados();
    },
    statusIcon: function (status) {
      return ICONS[status] ? ICONS[status]() : ICONS.confirmado();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
