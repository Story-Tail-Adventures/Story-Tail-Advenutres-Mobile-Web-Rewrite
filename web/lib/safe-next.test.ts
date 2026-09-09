import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

/**
 * Open-redirect regression tests.
 *
 * The obvious guard — startsWith("/") && !startsWith("//") — passes "/\evil.com", which
 * the WHATWG URL parser resolves to http://evil.com/ because a backslash is a path
 * separator for special schemes. Next's server-action reducer then compares origins and
 * hard-navigates off-site, so the user lands on the attacker's page straight after a
 * successful sign-in.
 */
describe("safeNext never leaves the origin", () => {
  const attacks = [
    "/\\evil.com",
    "//evil.com",
    "/\\\\evil.com",
    "https://evil.com",
    "//evil.com/path",
    "\\/evil.com",
    "/\t/evil.com",
    "javascript:alert(1)",
    "",
  ];

  it.each(attacks)("neutralises %j", (input) => {
    const resolved = new URL(safeNext(input), "http://app.local");
    expect(resolved.origin).toBe("http://app.local");
  });
});

describe("safeNext preserves legitimate destinations", () => {
  const legit = [
    "/dashboard",
    "/trips/123?tab=itinerary",
    "/account#security",
    "/",
  ];

  it.each(legit)("keeps %j", (input) => {
    expect(safeNext(input)).toBe(input);
  });

  it("falls back to the dashboard for a non-string", () => {
    expect(safeNext(null)).toBe("/dashboard");
  });
});
