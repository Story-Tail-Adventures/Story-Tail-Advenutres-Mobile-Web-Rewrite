import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Grid tracks in sx are `minmax(0, 1fr)`, never a bare `1fr`.
 *
 * Tailwind's `grid-cols-N` was `repeat(N, minmax(0, 1fr))`. The MUI conversion first wrote
 * plain `1fr`, which is `minmax(auto, 1fr)`: a track that cannot shrink below its content.
 * On /agent/trips/[id]/payments the schedule table then pushed the page 298px past a phone's
 * edge (its scroll container never got the chance). This fails on any bare `fr` track in a
 * `gridTemplateColumns` / `gridTemplateRows` value (any quote style).
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

describe("grid tracks", () => {
  it("never use a bare fr track", () => {
    const bad: string[] = [];
    for (const path of sources(ROOT)) {
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(
        /gridTemplate(?:Columns|Rows):\s*(\{[^}]*\}|"[^"]*"|'[^']*'|`[^`]*`)/g,
      )) {
        // Drop the minmax(...) groups, then any `fr` left is bare.
        if (/\d*\.?\d+fr\b/.test(m[1].replace(/minmax\([^)]*\)/g, ""))) {
          const line = text.slice(0, m.index).split("\n").length;
          bad.push(`${relative(ROOT, path)}:${line} ${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
