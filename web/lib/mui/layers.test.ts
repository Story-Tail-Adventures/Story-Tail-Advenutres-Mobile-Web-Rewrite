import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cascade layer order is set by the first time the browser sees each layer name. MUI's
 * emotion rules live in `@layer mui` (enableCssLayer in components/mui/MuiRegistry.tsx), and
 * where `mui` sits relative to Tailwind's preflight and the legacy component CSS decides
 * whether a page looks right. So the order statement has to be the first rule in
 * globals.css, ahead of `@import "tailwindcss"` (which declares its own four layers).
 */
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
  // Comments mention other layer lists (the post-Tailwind order); only rules count.
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("app/globals.css cascade layers", () => {
  it("declares the layer order as its first rule", () => {
    const firstRule = css.trim().split(";")[0].trim();
    expect(firstRule).toBe("@layer theme, base, mui, components, utilities");
  });

  it("puts mui above Tailwind's base and below the legacy CSS and utilities", () => {
    const order = ["theme", "base", "mui", "components", "utilities"];
    const declared = /@layer\s+([\w\s,]+);/.exec(css)![1].split(",").map((s) => s.trim());
    expect(declared).toEqual(order);
  });
});
