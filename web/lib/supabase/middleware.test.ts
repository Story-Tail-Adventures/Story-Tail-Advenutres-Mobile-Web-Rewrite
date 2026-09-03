import { describe, expect, it } from "vitest";
import { authRedirectFor } from "./middleware";

/**
 * The routing table the proxy applies on every request. Kept pure so the gate rules
 * from Screen 2.0.6 (signed-in visitors skip /join) and 2.0.1 (signed-in visitors skip
 * the public landing) are pinned without spinning up a Supabase client.
 */
describe("authRedirectFor — signed out", () => {
  // (No "#fragment" vectors: browsers never send the fragment, so nextUrl.pathname has none.)
  it.each(["/dashboard", "/dashboard/", "/trips/abc", "/account/security", "/agent/worklist"])(
    "sends %s to /login",
    (path) => {
      expect(authRedirectFor(path, false)).toBe("/login");
    },
  );

  it.each(["/", "/join", "/join/", "/login", "/register", "/explore/results", "/legal/terms"])(
    "lets %s through",
    (path) => {
      expect(authRedirectFor(path, false)).toBeNull();
    },
  );

  it("does not treat a prefix-lookalike as protected", () => {
    expect(authRedirectFor("/dashboards-are-public", false)).toBeNull();
    expect(authRedirectFor("/tripster", false)).toBeNull();
  });
});

describe("authRedirectFor — signed in", () => {
  it.each(["/login", "/register", "/join", "/join/", "/forgot-password"])(
    "bounces %s to /dashboard",
    (path) => {
      expect(authRedirectFor(path, true)).toBe("/dashboard");
    },
  );

  it("sends exactly the front door to /dashboard", () => {
    expect(authRedirectFor("/", true)).toBe("/dashboard");
  });

  it.each(["/explore", "/caribbean", "/about", "/legal/privacy", "/how-it-works"])(
    "still allows the public page %s",
    (path) => {
      expect(authRedirectFor(path, true)).toBeNull();
    },
  );

  it("lets a signed-in user into the protected tree", () => {
    expect(authRedirectFor("/dashboard", true)).toBeNull();
    expect(authRedirectFor("/trips/abc", true)).toBeNull();
  });
});
