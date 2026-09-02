/**
 * Story-Tail Adventures — light/dark scheme.
 *
 * Per docs/Design-System.md §10.1: follow the OS by default, with a user override
 * in Settings -> Appearance. The override lives in localStorage; "system" means
 * no stored value, so the OS keeps driving.
 *
 * The switch itself is the `.scheme-dark` class on <html> — see web/styles/tokens.css.
 */

export const THEME_STORAGE_KEY = "sta-theme";

export type ThemePreference = "light" | "dark" | "system";

/** The scheme actually in effect right now, after resolving "system". */
export type ResolvedScheme = "light" | "dark";

export function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    // Private browsing / blocked site data. Fall back to the OS.
    return "system";
  }
}

export function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveScheme(pref: ThemePreference): ResolvedScheme {
  if (pref === "system") return prefersDark() ? "dark" : "light";
  return pref;
}

export function applyScheme(scheme: ResolvedScheme): void {
  document.documentElement.classList.toggle("scheme-dark", scheme === "dark");
}

/** Persist a preference and apply it immediately. */
export function setPreference(pref: ThemePreference): void {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage unavailable — the class still applies for this session.
  }
  applyScheme(resolveScheme(pref));
}
