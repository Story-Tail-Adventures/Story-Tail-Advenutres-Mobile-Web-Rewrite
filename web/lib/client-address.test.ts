import { describe, expect, it } from "vitest";
import { visitorAddressFrom } from "./client-address";

/**
 * The rule two call sites share: `lib/supabase/server.ts` (what GoTrue records as the
 * sign-in address) and `lib/public/leadMessage.ts` (what the lead Edge Function RATE-LIMITS
 * on). The precedence is the security-relevant part, so it is pinned rather than left to
 * whichever header happens to be present in production.
 */
function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("visitorAddressFrom — precedence", () => {
  it("prefers cf-connecting-ip over x-forwarded-for", () => {
    const h = headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.7, 10.0.0.1",
    });
    expect(visitorAddressFrom(h)).toBe("203.0.113.9");
  });

  /**
   * The case this precedence exists for. Cloudflare sets `cf-connecting-ip` from the
   * connection it terminated and strips any copy the client sent, so a forged
   * `x-forwarded-for` cannot displace it. Behind a proxy that APPENDS rather than replaces,
   * the left-most forwarded entry is whatever the attacker put there, and on the lead path
   * that is a forgeable rate-limit bucket.
   */
  it("ignores a forged x-forwarded-for when the edge supplied the address", () => {
    const h = headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1, 203.0.113.9",
    });
    expect(visitorAddressFrom(h)).toBe("203.0.113.9");
  });

  it("falls back to the left-most forwarded entry", () => {
    expect(visitorAddressFrom(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
  });

  it("trims whitespace around either", () => {
    expect(visitorAddressFrom(headers({ "x-forwarded-for": "  203.0.113.9 , 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
    expect(visitorAddressFrom(headers({ "cf-connecting-ip": "  203.0.113.9  " }))).toBe(
      "203.0.113.9",
    );
  });
});

describe("visitorAddressFrom — nothing usable", () => {
  it("is null with no address headers at all", () => {
    expect(visitorAddressFrom(headers({ "user-agent": "x" }))).toBeNull();
  });

  it("is null for an empty value", () => {
    expect(visitorAddressFrom(headers({ "x-forwarded-for": "" }))).toBeNull();
    expect(visitorAddressFrom(headers({ "cf-connecting-ip": "   " }))).toBeNull();
  });

  // The column it lands in is bounded; a longer value is not an address worth passing on.
  it("rejects a value over 64 characters", () => {
    expect(visitorAddressFrom(headers({ "cf-connecting-ip": "a".repeat(65) }))).toBeNull();
    expect(visitorAddressFrom(headers({ "x-forwarded-for": "a".repeat(65) }))).toBeNull();
  });

  // An unusable cf header falls through rather than returning null. Behind Cloudflare this
  // cannot be reached from outside (it strips any client copy and never writes a 65-character
  // value), and without Cloudflare the header is simply absent, so the fallback is the normal
  // path rather than a way around the preference.
  it("falls through to the forwarded entry when cf-connecting-ip is unusable", () => {
    const h = headers({ "cf-connecting-ip": "a".repeat(65), "x-forwarded-for": "203.0.113.9" });
    expect(visitorAddressFrom(h)).toBe("203.0.113.9");
  });
});
