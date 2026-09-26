/**
 * Light/dark scheme.
 *
 * Per docs/Design-System.md §10.1: follow the OS by default, with a user override — the
 * toggle in the top bar's action cluster (§9.1). The switch itself is the `.scheme-dark`
 * class on <html>; the tokens that key off it live in web/styles/tokens.css.
 *
 * NO `"use client"` IN THIS FILE. components/ThemeScript.tsx is a Server Component that
 * imports THEME_STORAGE_KEY from here, and a directive would drag the root layout into the
 * client bundle. Every `document` / `window` touch therefore stays inside a function body,
 * so the module itself is safe to evaluate on the server.
 */

export const THEME_STORAGE_KEY = "sta-theme";

/**
 * `system` is not reachable from the UI. The top bar toggle is two-state by decision
 * (2026-09-25): one press writes an explicit "light" or "dark" and the OS is ignored from
 * then on. The third value stays in the type, and ThemeScript still resolves it correctly,
 * so a settings screen can introduce it later without touching the pre-paint path.
 */
export type ThemePreference = "light" | "dark" | "system";

/**
 * The two address-bar tints — `--brand-cream` and the dark scheme's `--md-bg`.
 *
 * They live here because three separate places need them in three different forms: this
 * module at click time, the pre-paint script as an inlined literal, and app/layout.tsx as
 * a `viewport` export. They were three hardcoded copies of the same two hexes; one source
 * means they cannot drift.
 */
export const THEME_COLOR_LIGHT = "#FBF6EE";
export const THEME_COLOR_DARK = "#050D1A";

/**
 * Put a scheme into force on the live document: the class the tokens key off, plus the
 * address-bar tint. Does not persist — `toggleScheme` does that.
 *
 * BOTH theme-color metas get the same value, deliberately. app/layout.tsx emits one per
 * `prefers-color-scheme`, and the browser matches those against the OS rather than against
 * our override, so after a manual choice the matching one is the wrong one. Writing both
 * means whichever the browser picks is right, with no reasoning about media matching or
 * document order.
 */
export function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle("scheme-dark", dark);

  const color = dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });
}

/**
 * Flip the scheme and remember it. Returns the scheme now in force.
 *
 * The current state is read off <html>, not out of React or out of storage, because that
 * class IS the source of truth: ThemeScript sets it before first paint from storage or,
 * failing that, from the OS. So it is already correct on the very first click with nothing
 * stored — which is what lets ThemeToggle hold no state at all and render identically on
 * the server and the client.
 *
 * A FAILED WRITE IS NOT A FAILED TOGGLE. Storage throws in a private window and wherever
 * site data is blocked; the scheme still flips for this page, it just does not survive the
 * next load. Same call DismissibleBanner makes.
 */
export function toggleScheme(): "light" | "dark" {
  const dark = !document.documentElement.classList.contains("scheme-dark");
  applyScheme(dark);

  const next = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* Storage blocked — the flip stands for this page but will not persist. */
  }
  return next;
}
