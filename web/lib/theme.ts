/**
 * Light/dark scheme.
 *
 * Per docs/Design-System.md §10.1: follow the OS by default, with a user override in
 * Settings -> Appearance. The switch itself is the `.scheme-dark` class on <html> — see
 * web/styles/tokens.css.
 *
 * Only the storage key is used today, by the pre-paint script in
 * components/ThemeScript.tsx. The read/write helpers land with the Settings screen that
 * needs them rather than sitting here unused.
 */

export const THEME_STORAGE_KEY = "sta-theme";

export type ThemePreference = "light" | "dark" | "system";
