import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Sets the `.scheme-dark` class on <html> BEFORE first paint.
 *
 * This has to be a render-blocking inline script in <head>, not next/script and not
 * a useEffect — anything that runs after hydration produces a flash of the light
 * scheme on a dark-mode device. Keeping it inline also lets the root layout stay a
 * Server Component.
 *
 * <html> needs suppressHydrationWarning because this mutates className before React
 * reconciles.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var dark = stored
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("scheme-dark", dark);
  } catch (e) {
    /* Storage blocked — fall through to the light scheme. */
  }
})();
`.trim();

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
