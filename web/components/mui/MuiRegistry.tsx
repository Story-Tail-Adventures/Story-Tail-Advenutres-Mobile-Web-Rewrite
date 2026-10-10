"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "@/lib/mui/theme";

/**
 * Emotion SSR cache + the Story-Tail theme, for the whole app (app/layout.tsx).
 *
 * WHO OWNS THE SCHEME: components/ThemeScript.tsx, not MUI. It sets `.scheme-dark` on
 * <html> before first paint, and lib/theme.ts flips it at runtime. The theme uses CSS
 * variables with `colorSchemeSelector: ".scheme-%s"`, so MUI's dark values live under
 * `.scheme-dark` and simply follow that class. The four props below stop MUI from also
 * trying to manage it:
 *
 *   storageManager={null}   never read or write localStorage (its default keys are
 *                           `mode` / `color-scheme-*`, which would fight `sta-theme`)
 *   storageWindow={null}    no cross-tab `storage` listener
 *   colorSchemeNode={null}  never touch the class on <html>. Without this, MUI's layout
 *                           effect replaces `scheme-*` with its own guess from the OS
 *   defaultMode="light"     its internal state stays put; the CSS does the switching
 *
 * Because of this the server HTML is identical in light and dark, which
 * components/ui/ThemeToggle.test.tsx depends on. Never add InitColorSchemeScript,
 * useColorScheme or theme.palette.mode branches; eslint bans the first two.
 *
 * `enableCssLayer` wraps every emotion rule in `@layer mui`, which app/globals.css orders
 * between Tailwind's base and the legacy component CSS. Unlayered, emotion would beat
 * every layered rule in the app.
 */
export function MuiRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider
        theme={theme}
        storageManager={null}
        storageWindow={null}
        colorSchemeNode={null}
        defaultMode="light"
      >
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
