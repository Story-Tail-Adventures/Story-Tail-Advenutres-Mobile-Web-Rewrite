/**
 * @vitest-environment node
 *
 * Node, not the project's default jsdom: NextResponse.next({ request }) asserts
 * `request.headers instanceof Headers`, and jsdom supplies its own Headers, so a NextRequest
 * built under jsdom fails that check across realms. Nothing here needs a DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_FLAG_COOKIE } from "@/lib/auth/chrome-flag";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { updateSession } from "./middleware";

/**
 * `authFlagAction`'s decision table is pinned in lib/auth/chrome-flag.test.ts. This covers
 * the part that only exists once it meets a real response: that the flag actually lands on
 * whichever response `updateSession` returns, redirects included.
 *
 * The redirect case is the one worth a test — signing out ENDS in a redirect to /login, so a
 * flag applied only to the pass-through response would leave the public chrome showing an
 * avatar until the visitor's next full page load.
 */
type Refreshed = { name: string; value: string; options?: Record<string, unknown> };

/**
 * The cookie @supabase/ssr stores a session in. Every request below that expects `getUser()`
 * to be consulted carries it, because `updateSession` now short-circuits without it — and
 * because a signed-in visitor who does not have it is not a state the browser can produce.
 * A fixture that modelled one was testing something that cannot happen.
 */
const SESSION = { "sb-127-auth-token": "base64-session" };

/**
 * The paths here are gated ones (`/dashboard`, `/join`) rather than public ones. The proxy's
 * matcher no longer runs on the public pages at all (web/proxy.ts), so a public path would
 * be exercising `updateSession` on a request that never reaches it. The flag is written and
 * cleared on these routes, which is all it ever needed: sign-in and sign-out both pass
 * through /login.
 */
function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

/**
 * `refreshes` makes `getUser()` invoke the `setAll` callback the way GoTrue does when it
 * renews an expired access token — which is the only way `supabaseResponse` ever acquires
 * cookies, and therefore the only way to test that they survive.
 */
function supabase({ signedIn, refreshes }: { signedIn: boolean; refreshes?: Refreshed[] }) {
  mocks.createServerClient.mockImplementation((_url, _key, config) => ({
    auth: {
      getUser: async () => {
        if (refreshes) config.cookies.setAll(refreshes);
        return { data: { user: signedIn ? { id: "u1" } : null }, error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      },
    },
  }));
}

/** The Set-Cookie the response carries for our flag, or undefined. */
function flagCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${AUTH_FLAG_COOKIE}=`));
}

function setCookie(response: Response, name: string) {
  return response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("updateSession — the public-chrome flag", () => {
  it("sets it on a pass-through response for a signed-in visitor", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(request("/dashboard", SESSION));

    expect(response.status).toBe(200);
    expect(flagCookie(response)).toContain(`${AUTH_FLAG_COOKIE}=1`);
  });

  it("writes nothing when the visitor already has the right flag", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(
      request("/dashboard", { ...SESSION, [AUTH_FLAG_COOKIE]: "1" }),
    );

    // The whole point of authFlagAction's no-op: every response would otherwise carry a
    // redundant Set-Cookie, and a Set-Cookie is a reason a CDN will not cache one.
    expect(flagCookie(response)).toBeUndefined();
  });

  it("writes nothing for a signed-out visitor who has no flag", async () => {
    supabase({ signedIn: false });

    const response = await updateSession(request("/"));

    expect(flagCookie(response)).toBeUndefined();
  });

  it("clears a leftover flag for a signed-out visitor", async () => {
    supabase({ signedIn: false });

    const response = await updateSession(request("/", { [AUTH_FLAG_COOKIE]: "1" }));

    expect(flagCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  // Signing out ends here: /dashboard with no session redirects to /login, and that is the
  // response that has to carry the clear.
  it("clears the flag on the redirect a signed-out visitor gets off a protected route", async () => {
    supabase({ signedIn: false });

    const response = await updateSession(request("/dashboard", { [AUTH_FLAG_COOKIE]: "1" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(flagCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("sets the flag on the redirect a signed-in visitor gets off /join", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(request("/join", SESSION));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(flagCookie(response)).toContain(`${AUTH_FLAG_COOKIE}=1`);
  });

  it("is readable by the pre-paint script and scoped to the whole site", async () => {
    supabase({ signedIn: true });

    const cookie = flagCookie(await updateSession(request("/dashboard", SESSION)));

    // Not HttpOnly: components/AuthChromeScript.tsx reads it from document.cookie.
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });
});

/**
 * The short-circuit that keeps anonymous traffic off Supabase.
 *
 * No session cookie means `getUser()` can only answer null, so asking costs a network round
 * trip for a foregone conclusion. Crawlers and scanners were paying it on every request, and
 * it is the bulk of the Fluid Active CPU behind the 2026-10-26 Hobby pause.
 *
 * Each test below arms the mock with `signedIn: true` on purpose: the point is not that the
 * answer is null, it is that the question is never asked.
 */
describe("updateSession — a request with no session cookie", () => {
  it("never builds a Supabase client", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(request("/"));

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  // The gate still has to close. This is the path a crawler takes into /dashboard.
  it("still bounces a protected route to /login", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(request("/dashboard"));

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("next=%2Fdashboard");
  });

  it("still clears a stale flag", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(request("/", { [AUTH_FLAG_COOKIE]: "1" }));

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(flagCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("asks Supabase as soon as a session cookie is there", async () => {
    supabase({ signedIn: true });

    await updateSession(request("/dashboard", SESSION));

    expect(mocks.createServerClient).toHaveBeenCalled();
  });

  // Past 3180 bytes @supabase/ssr stores the token in `.0`/`.1` chunks and the unchunked
  // name does not exist at all, so matching only the bare name would log those visitors out.
  it("asks Supabase for a chunked token too", async () => {
    supabase({ signedIn: true });

    await updateSession(request("/dashboard", { "sb-127-auth-token.0": "chunk-one" }));

    expect(mocks.createServerClient).toHaveBeenCalled();
  });

  // Mid-OAuth there is a verifier but no session yet. Paying for one lookup is the safe
  // direction; skipping a real session is not.
  it("asks Supabase while a PKCE flow is in progress", async () => {
    supabase({ signedIn: true });

    await updateSession(
      request("/dashboard", { "sb-127-auth-token-code-verifier": "verifier" }),
    );

    expect(mocks.createServerClient).toHaveBeenCalled();
  });

  it("is not fooled by our own cookies", async () => {
    supabase({ signedIn: true });

    await updateSession(
      request("/dashboard", { "sta-theme": "dark", [AUTH_FLAG_COOKIE]: "1" }),
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});

describe("updateSession — without Supabase configured", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  it("clears a flag left over from a run that had config", async () => {
    const response = await updateSession(request("/", { [AUTH_FLAG_COOKIE]: "1" }));

    expect(flagCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("writes nothing when there is no flag to clear", async () => {
    const response = await updateSession(request("/"));

    expect(flagCookie(response)).toBeUndefined();
  });
});

/**
 * Rule 1 at the top of lib/supabase/middleware.ts, which this file exists to keep honest:
 * "Always return supabaseResponse (or copy its cookies onto whatever you do return).
 * Dropping it desynchronises the browser's cookies from the refreshed session and logs the
 * user out at random."
 *
 * The redirects are where that was violated. Every refresh-and-redirect pairing below is a
 * request that really happens, and each one used to drop the refresh on the floor.
 *
 * All of them carry a session cookie, which is what a refresh means: GoTrue is renewing an
 * access token that expired, not minting one from nothing.
 */
describe("updateSession — a refreshed session survives", () => {
  const REFRESH: Refreshed[] = [
    {
      name: "sb-127-auth-token",
      value: "base64-refreshed",
      options: { path: "/", sameSite: "lax", httpOnly: true, maxAge: 34560000 },
    },
    { name: "sb-127-auth-token.1", value: "base64-chunk-two", options: { path: "/" } },
  ];

  it("on the pass-through response", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/dashboard", SESSION));

    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
  });

  // An expired token on a protected route: refresh, then bounce to /login.
  it("on the redirect a signed-out visitor gets off a protected route", async () => {
    supabase({ signedIn: false, refreshes: REFRESH });

    const response = await updateSession(request("/dashboard", SESSION));

    expect(response.status).toBe(307);
    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
  });

  // A signed-in visitor bounced off /join, on a request that also refreshed.
  it("on the redirect a signed-in visitor gets off an auth-only route", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/join", SESSION));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
  });

  // Chunked tokens are two cookies, not one; dropping the second is as bad as dropping both.
  it("including every chunk of a chunked token", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/join", SESSION));

    expect(setCookie(response, "sb-127-auth-token.1")).toContain("base64-chunk-two");
  });

  // Copied as cookies, not flattened to name=value: a session cookie that lost HttpOnly or
  // Path would be a different, quieter bug.
  it("with its attributes intact", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const cookie = setCookie(await updateSession(request("/join", SESSION)), "sb-127-auth-token");

    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("alongside the public-chrome flag, which is written once", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/join", SESSION));

    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
    expect(response.headers.getSetCookie().filter((c) => c.startsWith(`${AUTH_FLAG_COOKIE}=`)))
      .toHaveLength(1);
  });
});
