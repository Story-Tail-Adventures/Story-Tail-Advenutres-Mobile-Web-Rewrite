// Sets the `.scheme-dark` class on <html> BEFORE first paint.
//
// The port of web/components/ThemeScript.tsx, as a file rather than an inline script: the
// Content Security Policy is script-src 'self', so nothing inline runs. Every layout loads it
// as a plain, render-blocking <script src> in <head> (no defer, no async, no module), which is
// what makes it run before <body> is parsed. Anything later flashes the light scheme on a
// dark-mode device.
//
// Logic and comments as in ThemeScript.tsx. The storage key and the two address-bar tints
// are the values in web/lib/theme.ts (THEME_STORAGE_KEY, THEME_COLOR_LIGHT/DARK); theme.js
// carries the same three.
(function () {
  try {
    var stored = localStorage.getItem("sta-theme");

    // "system" AND any unrecognised value fall through to the OS, not to light.
    var dark = stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    document.documentElement.classList.toggle("scheme-dark", dark);

    // Carry the address-bar tint with an explicit override, and ONLY with one: the layout
    // emits a meta per prefers-color-scheme, the browser matches those against the OS, and
    // with nothing stored that static pair is already right.
    if (stored === "light" || stored === "dark") {
      var color = "#050D1A";
      if (!dark) color = "#FBF6EE";

      var paint = function () {
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", color);
        return metas.length > 0;
      };

      // The metas come before this script in every layout, but stay order-proof anyway.
      if (!paint()) document.addEventListener("DOMContentLoaded", paint);
    }
  } catch (e) {
    /* Storage blocked — fall through to the light scheme. */
  }
})();
