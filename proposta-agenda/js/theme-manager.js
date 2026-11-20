(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BezTheme = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "bezclean-agenda-theme";
  const THEME_COLORS = {
    light: "#0B3867",
    dark: "#060709"
  };

  let currentTheme = "light";
  const listeners = new Set();

  function normalizeTheme(value) {
    return value === "dark" ? "dark" : "light";
  }

  function defaultStorage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch (error) {
      return null;
    }
  }

  function readSavedTheme(storage) {
    const store = arguments.length > 0 ? storage : defaultStorage();
    if (!store || typeof store.getItem !== "function") return null;
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw === "dark" || raw === "light") return raw;
      return null;
    } catch (error) {
      return null;
    }
  }

  function writeSavedTheme(theme, storage) {
    const store = arguments.length > 1 ? storage : defaultStorage();
    if (!store || typeof store.setItem !== "function") return false;
    try {
      store.setItem(STORAGE_KEY, normalizeTheme(theme));
      return true;
    } catch (error) {
      return false;
    }
  }

  function applyTheme(theme, doc) {
    const normalized = normalizeTheme(theme);
    const targetDoc = doc || (typeof document !== "undefined" ? document : null);
    if (targetDoc && targetDoc.documentElement) {
      targetDoc.documentElement.setAttribute("data-theme", normalized);
      const meta = targetDoc.querySelector && targetDoc.querySelector('meta[name="theme-color"]');
      if (meta && typeof meta.setAttribute === "function") {
        meta.setAttribute("content", THEME_COLORS[normalized]);
      }
    }
    return normalized;
  }

  function notify(theme) {
    listeners.forEach(fn => {
      try { fn(theme); } catch (error) {}
    });
  }

  function init(options) {
    const opts = options || {};
    const saved = readSavedTheme(opts.storage !== undefined ? opts.storage : defaultStorage());
    const initial = normalizeTheme(saved || opts.fallback || "light");
    currentTheme = applyTheme(initial, opts.document);
    return currentTheme;
  }

  function getTheme() {
    return currentTheme;
  }

  function setTheme(theme, options) {
    const opts = options || {};
    const normalized = normalizeTheme(theme);
    currentTheme = applyTheme(normalized, opts.document);
    writeSavedTheme(currentTheme, opts.storage !== undefined ? opts.storage : defaultStorage());
    notify(currentTheme);
    return currentTheme;
  }

  function toggleTheme(options) {
    return setTheme(currentTheme === "dark" ? "light" : "dark", options);
  }

  function onChange(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    THEME_COLORS: THEME_COLORS,
    normalizeTheme: normalizeTheme,
    readSavedTheme: readSavedTheme,
    writeSavedTheme: writeSavedTheme,
    applyTheme: applyTheme,
    init: init,
    getTheme: getTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    onChange: onChange
  };
});
