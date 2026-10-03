import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, SCHEME, STATUS, STATUS_KINDS, hexToChannel, type SchemeName } from "./tokens";

/**
 * lib/mui/tokens.ts is a hand copy of the CSS tokens, so it can drift. This parses the CSS
 * and fails on any difference, in both directions: a token missing from either side, or a
 * value that disagrees.
 *
 * Three CSS sources, which must all agree:
 *   design/web-tokens/tokens.css   the canonical copy (docs/Design-System.md §12.4)
 *   web/styles/tokens.css          the web mirror the legacy CSS still reads
 *   web/styles/components.css      the .chip-status colors (§4.3)
 */
const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

const SOURCES = {
  "design/web-tokens/tokens.css": read("../../../design/web-tokens/tokens.css"),
  "web/styles/tokens.css": read("../../styles/tokens.css"),
};
const COMPONENTS_CSS = read("../../styles/components.css");

/** The declarations inside the first top-level `<selector> { … }` block. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.search(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const out = new Map<string, string>();
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

/** `--md-on-primary-container` → `onPrimaryContainer`, `--md-surface-1` → `surface1`. */
const camel = (name: string, prefix: string) =>
  name.slice(prefix.length).replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Hex case and rgba spacing are cosmetic; compare what the browser would. */
const norm = (v: string) => v.replace(/\s+/g, "").toUpperCase();

function mdRoles(decls: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of decls) {
    // Web follows MUI's default elevation, so the shadow tokens are not in the theme.
    if (k.startsWith("--md-") && !k.startsWith("--md-shadow-")) out[camel(k, "--md-")] = norm(v);
  }
  return out;
}

const normAll = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, norm(v)]));

describe.each(Object.entries(SOURCES))("lib/mui/tokens.ts matches %s", (_name, css) => {
  it.each<[SchemeName, string]>([
    ["light", ":root"],
    ["dark", ".scheme-dark"],
  ])("%s scheme (%s): same --md-* roles, same values", (scheme, selector) => {
    expect(normAll({ ...SCHEME[scheme] })).toEqual(mdRoles(block(css, selector)));
  });

  it("brand source colors (:root --brand-*)", () => {
    const brand: Record<string, string> = {};
    for (const [k, v] of block(css, ":root")) {
      if (k.startsWith("--brand-")) brand[camel(k, "--brand-")] = norm(v);
    }
    expect(normAll({ ...BRAND })).toEqual(brand);
  });
});

describe("lib/mui/tokens.ts STATUS matches .chip-status in web/styles/components.css", () => {
  it.each<[SchemeName, string]>([
    ["light", ""],
    ["dark", ".scheme-dark "],
  ])("%s scheme", (scheme, prefix) => {
    const css: Record<string, { bg: string; fg: string }> = {};
    const re = new RegExp(
      `^\\s*${prefix.replace(".", "\\.")}\\.chip-status\\.(\\w+)\\s*\\{\\s*background:\\s*([^;]+);\\s*color:\\s*([^;]+);`,
      "gm",
    );
    for (const m of COMPONENTS_CSS.matchAll(re)) css[m[1]] = { bg: norm(m[2]), fg: norm(m[3]) };
    expect(Object.keys(css).sort()).toEqual([...STATUS_KINDS].sort());
    for (const kind of STATUS_KINDS) {
      expect({ kind, bg: norm(STATUS[scheme][kind].bg), fg: norm(STATUS[scheme][kind].fg) }).toEqual({
        kind,
        ...css[kind],
      });
    }
  });
});

describe("hexToChannel", () => {
  it("turns #RRGGBB into the space-separated channels MUI's alpha() reads", () => {
    expect(hexToChannel("#7A1A1F")).toBe("122 26 31");
    expect(hexToChannel("#ffffff")).toBe("255 255 255");
  });
  it("refuses anything that is not #RRGGBB", () => {
    expect(() => hexToChannel("rgba(0,0,0,0.4)")).toThrow();
  });
});
