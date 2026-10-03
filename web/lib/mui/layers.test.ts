import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cascade layer order is set by the first time the browser sees each layer name. MUI's
 * emotion rules live in `@layer mui` (enableCssLayer in components/mui/MuiRegistry.tsx), and
 * where `mui` sits relative to the element reset (styles/reset.css) and the remaining
 * component CSS decides whether a page looks right. So the order statement has to be the
 * first rule in globals.css, ahead of every @import (an imported file that names a layer
 * first would otherwise fix its position).
 */
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
  // Comments may mention other layer lists; only rules count.
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("app/globals.css cascade layers", () => {
  it("declares the layer order as its first rule", () => {
    const firstRule = css.trim().split(";")[0].trim();
    expect(firstRule).toBe("@layer base, mui, components");
  });

  it("puts mui above the reset and below the component CSS", () => {
    const order = ["base", "mui", "components"];
    const declared = /@layer\s+([\w\s,]+);/.exec(css)![1].split(",").map((s) => s.trim());
    expect(declared).toEqual(order);
  });

  it("loads no Tailwind", () => {
    expect(css).not.toMatch(/@import\s+["']tailwindcss|@theme\b|@custom-variant|@utility|@apply/);
  });
});
