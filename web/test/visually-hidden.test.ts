import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * One visually-hidden recipe, in lib/mui/sx.ts. Hand-written copies kept getting it wrong in
 * a way no render test sees: in sx, `width: 1` is a FRACTION (100%), not 1px, so a "hidden"
 * checkbox became as wide as its container and pushed /agent/trips 229px past a phone's edge.
 * Thirteen copies had it. This fails on any new local copy, right or wrong.
 */
const ROOT = join(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", "test"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("visually hidden", () => {
  it("is a 1px box, not a 100% one", () => {
    expect(VISUALLY_HIDDEN.width).toBe("1px");
    expect(VISUALLY_HIDDEN.height).toBe("1px");
  });

  it("is defined once, in lib/mui/sx.ts", () => {
    const copies = sources(ROOT)
      .filter((path) => /clip:\s*["']rect\(0/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));
    expect(copies).toEqual(["lib/mui/sx.ts"]);
  });
});
