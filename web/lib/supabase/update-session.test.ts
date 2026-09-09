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
function supabase({ signedIn }: { signedIn: boolean }) {
  mocks.createServerClient.mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: "u1" } : null }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      },
    },
  });
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
