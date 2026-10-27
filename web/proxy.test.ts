/**
 * @vitest-environment node
 *
 * Node, not the project's default jsdom, to match lib/supabase/update-session.test.ts: this
 * pulls in next/server through the proxy's own import chain.
 */
import { describe, expect, it } from "vitest";

import { AUTH_ONLY_PREFIXES, PROTECTED_PREFIXES } from "@/lib/supabase/middleware";
import { config } from "./proxy";

/**
 * The matcher decides which requests reach `updateSession` at all, so a prefix missing from
 * it is a route group with no auth gate — and nothing about the page would look wrong. It is
 * the one thing in the proxy that cannot be caught by reading the routing table, because the
 * routing table never runs.
 *
 * These assertions derive the expected set from the prefix lists themselves, so adding a
 * protected route group to lib/supabase/middleware.ts and forgetting the matcher fails here
 * rather than in production.
 */
const SUFFIX = "/:path*";

/** The matcher entries with their `/:path*` tails removed, deduped. */
function basePaths(): Set<string> {
  return new Set(
    config.matcher.map((entry) =>
      entry.endsWith(SUFFIX) ? entry.slice(0, -SUFFIX.length) : entry,
    ),
  );
}

describe("proxy matcher — coverage", () => {
  it("covers every protected prefix", () => {
    const covered = basePaths();
    for (const prefix of PROTECTED_PREFIXES) {
      expect(covered.has(prefix), `${prefix} is gated but unmatched`).toBe(true);
    }
  });

  it("covers every auth-only prefix", () => {
    const covered = basePaths();
    for (const prefix of AUTH_ONLY_PREFIXES) {
      expect(covered.has(prefix), `${prefix} would not bounce a signed-in visitor`).toBe(true);
    }
  });

  // Screen 2.0.1: a signed-in traveler on the front door goes to their trips.
  it("covers the front door", () => {
    expect(basePaths().has("/")).toBe(true);
  });

  it("lists each prefix bare as well as with a subpath", () => {
    for (const prefix of [...PROTECTED_PREFIXES, ...AUTH_ONLY_PREFIXES]) {
      expect(config.matcher, `${prefix} bare`).toContain(prefix);
      expect(config.matcher, `${prefix} subpaths`).toContain(`${prefix}${SUFFIX}`);
    }
  });
});

describe("proxy matcher — restraint", () => {
  /**
   * The other half of the contract, and the reason this change exists: anything NOT in the
   * two prefix lists must stay off the matcher, or it costs a function invocation and loses
   * its CDN cache. "/" is the one deliberate extra.
   */
  it("matches nothing beyond the gated prefixes and the front door", () => {
    const expected = new Set(["/", ...PROTECTED_PREFIXES, ...AUTH_ONLY_PREFIXES]);
    expect([...basePaths()].sort()).toEqual([...expected].sort());
  });

  // The public surface, named explicitly: these are prerendered and must reach the CDN
  // without passing through a function. /explore/results is the one a crawler walked for
  // 55K requests in 12 hours (app/seo.ts).
  it.each([
    "/explore",
    "/explore/results",
    "/explore/bahamas",
    "/caribbean",
    "/cruises",
    "/honeymoons",
    "/how-it-works",
    "/about",
    "/legal/terms",
    "/message",
    "/quote",
    "/email/unsubscribe",
    "/auth/callback",
    "/api/account/chrome",
    "/robots.txt",
    "/sitemap.xml",
    "/wp-login.php",
  ])("leaves %s off the matcher", (path) => {
    expect(basePaths().has(path)).toBe(false);
  });

  /**
   * The collision worth pinning: /message is the public lead form (§3.8) and /messages is a
   * protected route group. An earlier draft of this matcher used prefix exclusions, where
   * excluding "message" would have silently taken the gate off "/messages".
   */
  it("keeps /messages gated while /message stays public", () => {
    const covered = basePaths();
    expect(covered.has("/messages")).toBe(true);
    expect(covered.has("/message")).toBe(false);
  });
});
