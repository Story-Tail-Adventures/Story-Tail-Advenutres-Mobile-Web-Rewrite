import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Some MUI components READ the props of an element they are handed: NativeSelect clones
 * `input`, FormControlLabel reads `control.props`. An element written in a Server Component
 * reaches them with no readable props, server rendering throws, and the page 500s QUIETLY:
 * the browser re-renders it client-side and it looks fine. /agent/trips/[id]/payments did
 * exactly that, and no other test could see it (vitest has no RSC boundary). So this is a
 * source scan: in any file without "use client", none of these may appear.
 */
const ROOT = join(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", "test"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const FORBIDDEN_IN_SERVER: [RegExp, string][] = [
  [/from "@mui\/material\/NativeSelect"/, "imports NativeSelect (use components/mui/OutlinedNativeSelect)"],
  [/from "@mui\/material\/FormControlLabel"/, "imports FormControlLabel"],
  [/\binput=\{</, "passes an element as `input`"],
  [/\bcontrol=\{</, "passes an element as `control`"],
];

describe("Server Components and MUI element props", () => {
  it("no server file hands MUI an element whose props it reads", () => {
    const bad: string[] = [];
    for (const path of sources(ROOT)) {
      const text = readFileSync(path, "utf8");
      if (/^\s*["']use client["']/.test(text)) continue;
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const [pattern, what] of FORBIDDEN_IN_SERVER) {
        if (pattern.test(code)) bad.push(`${relative(ROOT, path)} ${what}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
