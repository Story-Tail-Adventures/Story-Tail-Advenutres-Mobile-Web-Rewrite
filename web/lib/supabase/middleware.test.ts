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

/**
 * Screen 2.1.7 MFA Challenge — the half-authenticated state.
 *
 * "Signed in" stops being a yes/no once a second factor exists: a session can hold a valid
 * password login and still have no business reading anyone's trips. These cases pin the
 * gap between those two, which is where an MFA bug would actually live.
 */
describe("authRedirectFor — a second factor is enrolled but not yet verified", () => {
  it.each(["/dashboard", "/trips/abc", "/account/security", "/agent/worklist"])(
    "sends %s to the challenge, not to the page",
    (path) => {
      expect(authRedirectFor(path, true, "required")).toBe("/login/mfa");
    },
  );

  it.each(["/", "/login", "/register", "/join", "/forgot-password"])(
    "sends %s to the challenge rather than bouncing it to the dashboard",
    (path) => {
      // The signed-in rule would otherwise send these to /dashboard, which then bounces
      // straight back here — a redirect loop dressed up as a routing rule.
      expect(authRedirectFor(path, true, "required")).toBe("/login/mfa");
    },
  );

  it.each(["/explore", "/explore/results", "/legal/terms", "/caribbean"])(
    "leaves the public page %s alone",
    (path) => {
      // Someone halfway through signing in has no less right to read about Aruba than
      // someone who never started.
      expect(authRedirectFor(path, true, "required")).toBeNull();
    },
  );

  it("lets the challenge screen itself render", () => {
    expect(authRedirectFor("/login/mfa", true, "required")).toBeNull();
  });
});

describe("authRedirectFor — the challenge screen's own preconditions", () => {
  it("sends a signed-out visitor to sign in first", () => {
    expect(authRedirectFor("/login/mfa", false, "none")).toBe("/login");
  });

  it.each(["none", "satisfied"] as const)(
    "sends a session with nothing to prove (%s) on to the dashboard",
    (assurance) => {
      // A code entry that can never succeed is a dead end, not a security control.
      expect(authRedirectFor("/login/mfa", true, assurance)).toBe("/dashboard");
    },
  );
});

describe("authRedirectFor — once the second factor is verified", () => {
  it.each(["/dashboard", "/trips/abc", "/account/security"])("lets %s through", (path) => {
    expect(authRedirectFor(path, true, "satisfied")).toBeNull();
  });

  it("goes back to bouncing signed-in visitors off the auth screens", () => {
    expect(authRedirectFor("/login", true, "satisfied")).toBe("/dashboard");
    expect(authRedirectFor("/", true, "satisfied")).toBe("/dashboard");
  });
});

describe("authRedirectFor — an account with no second factor is unaffected", () => {
  it("behaves exactly as it did before MFA existed", () => {
    expect(authRedirectFor("/dashboard", true, "none")).toBeNull();
    expect(authRedirectFor("/dashboard", false, "none")).toBe("/login");
    expect(authRedirectFor("/login", true, "none")).toBe("/dashboard");
  });
});
