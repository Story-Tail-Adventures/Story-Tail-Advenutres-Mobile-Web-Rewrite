import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { themeOptions } from "@/lib/mui/theme";

/**
 * The app theme with motion switched off, for jsdom tests.
 *
 * MUI's transitions (Dialog, Menu, Accordion, Collapse) wait on timers and transitionend
 * events that jsdom never fires; `reducedMotion: "always"` makes every one of them
 * instant. Everything else is the real theme, so a component under test sees the same
 * palette paths and breakpoints it sees in the app.
 *
 * No CSS layers here (no AppRouterCacheProvider): jsdom does not apply cascade layers in a
 * way worth asserting on, and tests should query by role and name, not by computed style.
 */
export const testTheme = createTheme({
  ...themeOptions,
  motion: { reducedMotion: "always" },
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      theme={testTheme}
      storageManager={null}
      storageWindow={null}
      colorSchemeNode={null}
      defaultMode="light"
    >
      {children}
    </ThemeProvider>
  );
}

/**
 * `render` wrapped in the test theme. MUI renders Dialog / Menu / Popover content in a
 * portal on document.body, outside `container`, so query those with `screen`.
 */
export function renderWithTheme(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Providers, ...options });
}
