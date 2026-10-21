// Classic script loaded with src (CSP: no inline). Sets data-theme before first paint (ADR 68).
(function () {
  var pref = null;
  try { pref = localStorage.getItem("ludiary.theme"); } catch (e) { /* storage unavailable */ }
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
