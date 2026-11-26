// The light/dark toggle (Design-System §10.1): one press, two states.
//
// The port of web/components/ui/ThemeToggle.tsx and toggleScheme() in web/lib/theme.ts. The
// layouts render BOTH buttons, `.sta-light-only` (a moon: switch to dark) and
// `.sta-dark-only` (a sun: switch to light), each with its own aria-label, and CSS shows one
// (components.css). This module only wires the click: it reads the current scheme off
// <html>, which prepaint-theme.js already set, flips it, and remembers the choice.
//
// Loaded as <script type="module">, so it runs after parsing and never blocks paint. With JS
// off the buttons do nothing, as in the Next app.

const STORAGE_KEY = "sta-theme";
const COLOR_LIGHT = "#FBF6EE";
const COLOR_DARK = "#050D1A";

// The class the tokens key off, plus the address-bar tint. Both theme-color metas get the
// same value, so whichever the browser matches against the OS is right.
function applyScheme(dark) {
  document.documentElement.classList.toggle("scheme-dark", dark);
  const color = dark ? COLOR_DARK : COLOR_LIGHT;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });
}

// One instant repaint instead of a page-wide fade: transitions are off for the flip. The
// override is a class (ui.css .sta-no-transitions) rather than an injected <style>, which the
// CSP would block.
function withoutTransitions(change) {
  const root = document.documentElement;
  root.classList.add("sta-no-transitions");
  try {
    change();
  } finally {
    window.getComputedStyle(document.body).getPropertyValue("color");
    window.setTimeout(() => root.classList.remove("sta-no-transitions"), 1);
  }
}

function toggleScheme() {
  const dark = !document.documentElement.classList.contains("scheme-dark");
  withoutTransitions(() => applyScheme(dark));
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    /* Storage blocked — the flip stands for this page but will not persist. */
  }
}

document.addEventListener("click", (event) => {
  const button = event.target instanceof Element && event.target.closest("[data-theme-toggle]");
  if (button) toggleScheme();
});
