import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cascade layer order is set by the first time the browser sees each layer name. MUI's
 * emotion rules live in `@layer mui` (enableCssLayer in components/mui/MuiRegistry.tsx), and
 * where `mui` sits relative to the element reset (styles/reset.css) and the remaining
 * component CSS decides whether a page looks right.
 *
 * THE ORDER LIVES IN styles/layers.css, IMPORTED FIRST. It used to be the first rule of
 * globals.css, ahead of its @imports, and this test checked exactly that, while the bundle
 * put every imported file ahead of globals.css's own rules: `mui` ended up last and both
 * theme-toggle icons showed (2026-10-12). A source-order test cannot see the bundle, so
 * .github/scripts/check_css_layer_order.py checks the built CSS in CI as well.
 */
const ROOT = join(__dirname, "../..");
// Comments may mention layer lists; only rules count.
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const globals = read("app/globals.css");
const STATEMENT = /@layer\s+[\w-]+(?:\s*,\s*[\w-]+)*\s*;/g;

describe("app/globals.css cascade layers", () => {
  it("imports styles/layers.css as its very first rule", () => {
    const firstRule = globals.trim().split(";")[0].trim();
    expect(firstRule).toBe('@import "../styles/layers.css"');
  });

  it("layers.css is the order and nothing else: base, then mui, then components", () => {
    expect(read("styles/layers.css").trim()).toBe("@layer base, mui, components;");
  });

  it("no other stylesheet declares an order, so there is one place to read it", () => {
    const others = [
      "app/globals.css",
      ...readdirSync(join(ROOT, "styles"))
        .filter((n) => n.endsWith(".css") && n !== "layers.css")
        .map((n) => `styles/${n}`),
    ];
    for (const path of others) {
      expect(read(path).match(STATEMENT), path).toBeNull();
    }
  });

  it("loads no Tailwind", () => {
    expect(globals).not.toMatch(/@import\s+["']tailwindcss|@theme\b|@custom-variant|@utility|@apply/);
  });
});
