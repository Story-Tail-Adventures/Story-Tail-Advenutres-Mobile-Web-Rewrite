/**
 * @vitest-environment node
 *
 * Reads the app directory, so it needs fs and no DOM.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { SIGNED_IN_SHELLS } from "./signed-in-shells";
import { authRedirectFor } from "@/lib/supabase/middleware";

const APP = join(import.meta.dirname, "../../app");

/** Every URL path with a page.tsx, with route groups stripped the way Next strips them. */
function routeUrls(): string[] {
  const urls: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === "page.tsx") {
        urls.push(url || "/");
        continue;
      }
      if (!statSync(full).isDirectory()) continue;
      // `(group)` and `@slot` contribute no URL segment. `[param]` does — it stays in the
      // path as a dynamic segment, and prefix matching treats it like any other.
      const segment = /^[(@]/.test(entry) ? "" : `/${entry}`;
      walk(full, url + segment);
    }
  };
  walk(APP, "");
  return urls;
}

function coveredByAShell(url: string): boolean {
  return SIGNED_IN_SHELLS.some((shell) => url === shell || url.startsWith(`${shell}/`));
}

/**
 * signOutAction clears the CLIENT Router Cache for these paths, which is what stops a
 * signed-in shell surviving a sign-out for one more navigation. A route that needs a session
 * but is missing from the list keeps its cached payload — so this cross-checks the list
 * against the routes that actually exist, in both directions.
 */
describe("SIGNED_IN_SHELLS", () => {
  it("names only paths the proxy actually gates behind a session", () => {
    for (const shell of SIGNED_IN_SHELLS) {
      expect(authRedirectFor(shell, false), `${shell} should require a session`).toBe("/login");
    }
  });

  it("covers every route that requires a session", () => {
    const uncovered = routeUrls().filter(
      (url) => authRedirectFor(url, false) === "/login" && !coveredByAShell(url),
    );

    // If this fails, a protected route has been built since the list was written. Add its
    // URL root to SIGNED_IN_SHELLS in lib/auth/actions.ts — /account (§2.5.1) and /agent
    // (§3.x) are the two expected to arrive.
    expect(uncovered).toEqual([]);
  });

  it("names no path that is reachable without signing in", () => {
    for (const shell of SIGNED_IN_SHELLS) {
      expect(authRedirectFor(shell, true, "satisfied")).not.toBe("/login");
    }
  });

  // The bug this replaced: "/" is the root layout, so revalidating it threw away every
  // prerendered marketing page too.
  it("does not name the site root", () => {
    expect(SIGNED_IN_SHELLS as readonly string[]).not.toContain("/");
  });
});
