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

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
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

    const response = await updateSession(request("/explore"));

    expect(response.status).toBe(200);
    expect(flagCookie(response)).toContain(`${AUTH_FLAG_COOKIE}=1`);
  });

  it("writes nothing when the visitor already has the right flag", async () => {
    supabase({ signedIn: true });

    const response = await updateSession(request("/explore", { [AUTH_FLAG_COOKIE]: "1" }));

    // The whole point of authFlagAction's no-op: every public page view would otherwise
    // carry a redundant Set-Cookie.
    expect(flagCookie(response)).toBeUndefined();
  });

  it("writes nothing for a signed-out visitor who has no flag", async () => {
    supabase({ signedIn: false });

    const response = await updateSession(request("/explore"));

    expect(flagCookie(response)).toBeUndefined();
  });

  it("clears a leftover flag for a signed-out visitor", async () => {
    supabase({ signedIn: false });

    const response = await updateSession(request("/explore", { [AUTH_FLAG_COOKIE]: "1" }));

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

    const response = await updateSession(request("/join"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(flagCookie(response)).toContain(`${AUTH_FLAG_COOKIE}=1`);
  });

  it("is readable by the pre-paint script and scoped to the whole site", async () => {
    supabase({ signedIn: true });

    const cookie = flagCookie(await updateSession(request("/explore")));

    // Not HttpOnly: components/AuthChromeScript.tsx reads it from document.cookie.
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });
});

describe("updateSession — without Supabase configured", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  it("clears a flag left over from a run that had config", async () => {
    const response = await updateSession(request("/explore", { [AUTH_FLAG_COOKIE]: "1" }));

    expect(flagCookie(response)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("writes nothing when there is no flag to clear", async () => {
    const response = await updateSession(request("/explore"));

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

    const response = await updateSession(request("/explore"));

    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
  });

  // An expired token on a protected route: refresh, then bounce to /login.
  it("on the redirect a signed-out visitor gets off a protected route", async () => {
    supabase({ signedIn: false, refreshes: REFRESH });

    const response = await updateSession(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
  });

  // A signed-in visitor bounced off /join, on a request that also refreshed.
  it("on the redirect a signed-in visitor gets off an auth-only route", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/join"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
  });

  // Chunked tokens are two cookies, not one; dropping the second is as bad as dropping both.
  it("including every chunk of a chunked token", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/join"));

    expect(setCookie(response, "sb-127-auth-token.1")).toContain("base64-chunk-two");
  });

  // Copied as cookies, not flattened to name=value: a session cookie that lost HttpOnly or
  // Path would be a different, quieter bug.
  it("with its attributes intact", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const cookie = setCookie(await updateSession(request("/join")), "sb-127-auth-token");

    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("alongside the public-chrome flag, which is written once", async () => {
    supabase({ signedIn: true, refreshes: REFRESH });

    const response = await updateSession(request("/join"));

    expect(setCookie(response, "sb-127-auth-token")).toContain("base64-refreshed");
    expect(response.headers.getSetCookie().filter((c) => c.startsWith(`${AUTH_FLAG_COOKIE}=`)))
      .toHaveLength(1);
  });
});
