import { describe, expect, it } from "vitest";
import { theme } from "./theme";
import { BRAND, SCHEME, STATUS, BREAKPOINTS, type SchemeName } from "./tokens";

/**
 * The theme's contract with the rest of the app. Two things here are load-bearing and
 * invisible until they break:
 *
 * 1. WHERE the color variables are emitted. ThemeScript owns the scheme by toggling
 *    `.scheme-dark` on <html>; MUI's variables only follow it if light lands on `:root`
 *    and dark on `.scheme-dark`. A selector change in an MUI upgrade would silently give
 *    every page the light palette in dark mode.
 * 2. WHICH palette path carries which token. Screens are written against palette paths
 *    ("surface.2", "primary.container"), so a path that points at the wrong token is a
 *    wrong color on every screen that uses it.
 */

type Sheet = Record<string, Record<string, string>>;
const sheets = () => (theme.generateStyleSheets() as Sheet[]).filter((s) => typeof s === "object");

describe("color-scheme selectors", () => {
  it("emits light on :root (no class needed) and dark on .scheme-dark, in that order", () => {
    const selectors = sheets().map((s) => Object.keys(s)[0]);
    expect(selectors).toEqual([":root", ":root, .scheme-light", ".scheme-dark"]);
  });

  it("does not emit `color-scheme` (globals.css sets it from the same class)", () => {
    for (const s of sheets()) {
      const decls = Object.values(s)[0];
      expect(decls).not.toHaveProperty("colorScheme");
    }
  });

  it("has a dark override for every light color variable", () => {
    // Superset, not equality: MUI adds a few dark-only variables of its own
    // (--mui-palette-AppBar-darkBg, -text-icon) whenever palette.mode is "dark".
    const [, light, dark] = sheets().map((s) => Object.values(s)[0]);
    const colorKeys = (o: Record<string, string>) =>
      Object.keys(o).filter((k) => k.startsWith("--mui-palette-"));
    expect(colorKeys(dark)).toEqual(expect.arrayContaining(colorKeys(light)));
  });
});

describe.each<SchemeName>(["light", "dark"])("%s palette maps to the tokens", (scheme) => {
  const p = theme.colorSchemes[scheme]!.palette;
  const t = SCHEME[scheme];

  it.each([
    ["primary.main", () => p.primary.main, t.primary],
    ["primary.contrastText", () => p.primary.contrastText, t.onPrimary],
    ["primary.container", () => p.primary.container, t.primaryContainer],
    ["primary.onContainer", () => p.primary.onContainer, t.onPrimaryContainer],
    ["secondary.main", () => p.secondary.main, t.secondary],
    ["secondary.container", () => p.secondary.container, t.secondaryContainer],
    ["tertiary.main", () => p.tertiary.main, t.tertiary],
    ["tertiary.contrastText", () => p.tertiary.contrastText, t.onTertiary],
    ["tertiary.container", () => p.tertiary.container, t.tertiaryContainer],
    ["error.main", () => p.error.main, t.error],
    ["error.container", () => p.error.container, t.errorContainer],
    ["success.main", () => p.success.main, t.success],
    ["warning.main", () => p.warning.main, t.warning],
    ["background.default", () => p.background.default, t.bg],
    ["background.paper", () => p.background.paper, t.surface1],
    ["text.primary", () => p.text.primary, t.onSurface],
    ["text.secondary", () => p.text.secondary, t.onSurfaceVariant],
    ["divider", () => p.divider, t.outlineVariant],
    ["outline.main", () => p.outline.main, t.outline],
    ["outline.variant", () => p.outline.variant, t.outlineVariant],
    ["surface.main", () => p.surface.main, t.surface],
    ["surface.1", () => p.surface[1], t.surface1],
    ["surface.2", () => p.surface[2], t.surface2],
    ["surface.3", () => p.surface[3], t.surface3],
    ["surface.4", () => p.surface[4], t.surface4],
    ["surface.5", () => p.surface[5], t.surface5],
    ["surface.dim", () => p.surface.dim, t.surfaceDim],
    ["surface.bright", () => p.surface.bright, t.surfaceBright],
    ["scrim", () => p.scrim, t.scrim],
    ["brand.main", () => p.brand.main, BRAND.orange],
  ] as const)("%s", (_path, get, expected) => {
    expect(get()?.toUpperCase()).toBe(expected.toUpperCase());
  });

  it("status chip colors", () => {
    expect(p.status).toEqual(STATUS[scheme]);
  });

  it("generates channel variables for the custom colors, so alpha() works on them", () => {
    const vars = Object.values(sheets()[scheme === "light" ? 1 : 2])[0];
    for (const name of ["tertiary", "brand", "primary"]) {
      expect(vars).toHaveProperty(`--mui-palette-${name}-mainChannel`);
    }
  });
});

describe("breakpoints and type", () => {
  it("uses the breakpoints web/ used under Tailwind", () => {
    expect(theme.breakpoints.values).toEqual(BREAKPOINTS);
  });

  it("keeps button text in sentence case (the one typographic override)", () => {
    expect(theme.typography.button.textTransform).toBe("none");
  });

  it("reads the next/font variables, so MUI text uses the bundled fonts", () => {
    expect(theme.typography.fontFamily).toMatch(/^var\(--font-poppins\)/);
    expect(theme.typography.script.fontFamily).toMatch(/^var\(--font-caveat\)/);
    expect(theme.typography.mono).toMatch(/^var\(--font-jetbrains-mono\)/);
  });
});
