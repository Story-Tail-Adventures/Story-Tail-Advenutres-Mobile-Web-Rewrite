import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";

/**
 * The two auth actions that belong to no single screen: starting an OAuth sign-in and
 * signing out.
 *
 * The OAuth one has two properties worth holding still. `skipBrowserRedirect` must be set,
 * or the provider URL is computed on the server and silently dropped — the button appears
 * to do nothing. And a provider that is not switched on must be a no-op rather than an
 * error, because the buttons that reach it are already rendered disabled.
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { signInWithProviderAction, signOutAction } from "./actions";

const PROVIDER_URL = "https://accounts.google.com/o/oauth2/auth?state=abc";

function form(next = "/dashboard"): FormData {
  const fd = new FormData();
  fd.set("next", next);
  return fd;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_AUTH_GOOGLE_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_AUTH_APPLE_ENABLED", "false");

  for (const m of Object.values(mocks)) m.mockReset();

  mocks.createClient.mockResolvedValue({
    auth: { signInWithOAuth: mocks.signInWithOAuth, signOut: mocks.signOut },
  });
  mocks.signInWithOAuth.mockResolvedValue({ data: { url: PROVIDER_URL }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.redirect.mockImplementation((to: string) => {
    throw new RedirectSignal(to);
  });

  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signInWithProviderAction", () => {
  it("asks Supabase not to redirect for it, and redirects to the URL it gets back", async () => {
    await expect(signInWithProviderAction("google", form())).rejects.toMatchObject({
      to: PROVIDER_URL,
    });

    const [options] = mocks.signInWithOAuth.mock.calls[0] as [
      { provider: string; options: { redirectTo: string; skipBrowserRedirect: boolean } },
    ];
    expect(options.provider).toBe("google");
    // Without this the URL is computed on the server and thrown away — supabase-js has no
    // `window` to navigate and the submit looks like a dead button.
    expect(options.options.skipBrowserRedirect).toBe(true);
  });

  it("carries the provider on the callback URL so a collision can reach Screen 2.1.8", async () => {
    await expect(signInWithProviderAction("google", form("/trips/negril"))).rejects.toThrow(
      RedirectSignal,
    );
    const [options] = mocks.signInWithOAuth.mock.calls[0] as [
      { options: { redirectTo: string } },
    ];
    expect(options.options.redirectTo).toBe(
      "http://localhost:3000/auth/callback?next=%2Ftrips%2Fnegril&provider=google",
    );
  });

  it("refuses to carry an off-origin next", async () => {
    await expect(signInWithProviderAction("google", form("//evil.com"))).rejects.toThrow(
      RedirectSignal,
    );
    const [options] = mocks.signInWithOAuth.mock.calls[0] as [
      { options: { redirectTo: string } },
    ];
    expect(options.options.redirectTo).toContain("next=%2Fdashboard");
  });

  it("does nothing at all for a provider that is switched off", async () => {
    await signInWithProviderAction("apple", form());
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends people back to sign-in when the provider handshake fails", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new AuthApiError("nope", 500, "unexpected_failure"),
    });
    await expect(signInWithProviderAction("google", form())).rejects.toMatchObject({
      to: "/login?error=unknown",
    });
  });
});

describe("signOutAction", () => {
  it("signs out this browser only, not every device", async () => {
    // Revoking every session belongs to Screen 2.5.7's explicit "sign out everywhere".
    // Doing it here would log someone out of their phone because they closed a tab.
    await expect(signOutAction()).rejects.toMatchObject({ to: "/login" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("drops the cached signed-in layout before leaving", async () => {
    await expect(signOutAction()).rejects.toThrow(RedirectSignal);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("still lands them on sign-in when Supabase refuses the sign-out", async () => {
    // Whatever happened server-side, the person asked to leave. Stranding them on a page
    // that still looks signed in would be worse than an inconsistent server state.
    mocks.signOut.mockResolvedValue({
      error: new AuthApiError("boom", 500, "unexpected_failure"),
    });
    await expect(signOutAction()).rejects.toMatchObject({ to: "/login" });
  });
});
