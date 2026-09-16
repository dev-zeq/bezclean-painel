const APP_VERSION = "20260916e";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).then(registration => registration.update()).catch(() => {});
  });
}
