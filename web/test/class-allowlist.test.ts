import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every class name in web/ must be defined by a CSS file, and every class a CSS file
 * defines must be used.
 *
 * Tailwind was removed in the MUI v9 migration (step 2, PR 7). A leftover utility such as
 * `flex` or `sr-only` now matches no rule, and nothing errors: the element just loses its
 * layout. So this scans the class names the source can produce (className attributes,
 * `className:` object keys, and `*_CLASS` maps) against the selectors in app/globals.css
 * and web/styles/*.css. The reverse check keeps dead CSS from piling up again.
 */
const ROOT = join(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", "test"]);

/** Class names that are hooks for JS or tests, with no CSS of their own. */
const MARKERS: Record<string, string> = {
  "is-on": "the active filter chip on /explore/results; page.test.tsx reads it",
  "sticky-cta-row2": "StickyCta's own sx targets it (`& > .sticky-cta-row2`)",
};

function files(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, test);
    return test(name) ? [path] : [];
  });
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `.class` in a rule's selector (never in a declaration). */
function definedClasses(): Set<string> {
  const out = new Set<string>();
  const css = [join(ROOT, "app/globals.css"), ...files(join(ROOT, "styles"), (n) => n.endsWith(".css"))];
  for (const path of css) {
    for (const [, prelude] of stripComments(readFileSync(path, "utf8")).matchAll(/([^{};]+)\{/g)) {
      for (const [, name] of prelude.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.add(name);
    }
  }
  return out;
}

type Use = { name: string; prefix: boolean; where: string };

/** The string literals in an expression, split into class tokens. */
function tokens(expr: string, where: string): Use[] {
  const out: Use[] = [];
  for (const m of expr.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    // Not a class: a comparison operand (`scrim === "bottom"`) or a quoted object key.
    const before = expr.slice(0, m.index);
    const after = expr.slice(m.index + m[0].length);
    if (/[=!]==?\s*$/.test(before) || /^\s*[=!]==?/.test(after) || after.startsWith(":")) continue;
    if (m[3] !== undefined) {
      // A template literal: a token that runs into `${` is a prefix, not a whole name.
      for (const part of m[3].split(/\$\{[^}]*\}/)) {
        const words = part.split(/\s+/).filter(Boolean);
        words.forEach((name, i) => {
          const open = i === words.length - 1 && !/\s$/.test(part) && m[3].includes(part + "${");
          out.push({ name, prefix: open, where });
        });
      }
    } else {
      for (const name of (m[1] ?? m[2]).split(/\s+/).filter(Boolean)) out.push({ name, prefix: false, where });
    }
  }
  return out;
}

function usedClasses(): Use[] {
  const out: Use[] = [];
  for (const path of files(ROOT, (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n))) {
    const text = stripComments(readFileSync(path, "utf8")).replace(/^\s*\/\/.*$/gm, "");
    const at = (i: number) => `${relative(ROOT, path)}:${text.slice(0, i).split("\n").length}`;
    const patterns = [
      /className=("[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})/g,
      /className:\s*("[^"]*"|'[^']*'|`[^`]*`)/g,
      /const\s+\w*_CLASS\b[^=]*=\s*(\{[^}]*\}|"[^"]*")/g,
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) out.push(...tokens(m[1], at(m.index)));
    }
  }
  return out;
}

describe("class names", () => {
  const defined = definedClasses();
  const used = usedClasses();

  it("are all defined by a CSS file (or listed as a marker)", () => {
    const missing = used
      .filter(({ name, prefix }) =>
        prefix ? ![...defined].some((d) => d.startsWith(name)) : !defined.has(name) && !(name in MARKERS),
      )
      .map(({ name, where }) => `${where} .${name}`);
    expect(missing).toEqual([]);
  });

  it("defined in CSS are all used somewhere", () => {
    const dead = [...defined].filter(
      (d) => !used.some(({ name, prefix }) => (prefix ? d.startsWith(name) : d === name)),
    );
    // Set by script rather than by className: ThemeScript / lib/theme.ts toggle the scheme.
    expect(dead.filter((d) => !["scheme-dark", "scheme-light"].includes(d))).toEqual([]);
  });

  it("markers are not also defined (a defined class needs no entry)", () => {
    expect(Object.keys(MARKERS).filter((m) => defined.has(m))).toEqual([]);
  });
});
