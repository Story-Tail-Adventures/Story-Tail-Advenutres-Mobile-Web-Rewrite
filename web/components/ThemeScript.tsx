import {
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

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
 *
 * Exported as a string so a test can evaluate it in jsdom. It is the only thing that
 * proves a choice made in the top bar survives a reload, and it cannot be reached through
 * the component.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});

    // "system" AND any unrecognised value fall through to the OS, not to light. The
    // expression this replaced was \`stored ? stored === "dark" : <os>\`, which stopped
    // consulting the OS the moment anything at all was stored — so a stored "system", the
    // third value ThemePreference carries and the one a settings screen would write,
    // silently rendered light on a dark device.
    var dark = stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    document.documentElement.classList.toggle("scheme-dark", dark);

    // Carry the address-bar tint with an explicit override, and ONLY with one: layout.tsx
    // emits a meta per prefers-color-scheme, the browser matches those against the OS, and
    // with nothing stored that static pair is already right. See applyScheme in lib/theme.ts.
    if (stored === "light" || stored === "dark") {
      var color = ${JSON.stringify(THEME_COLOR_DARK)};
      if (!dark) color = ${JSON.stringify(THEME_COLOR_LIGHT)};

      var paint = function () {
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", color);
        return metas.length > 0;
      };

      // Order-proof: whether Next emits the metadata tags above or below this script is
      // not something we control, so if they are not parsed yet, finish the job once they
      // are. Worst case is a stale address-bar tint — never a flash of the wrong page
      // colour, because the class and the tokens are handled synchronously above.
      if (!paint()) document.addEventListener("DOMContentLoaded", paint);
    }
  } catch (e) {
    /* Storage blocked — fall through to the light scheme. */
  }
})();
`.trim();

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
