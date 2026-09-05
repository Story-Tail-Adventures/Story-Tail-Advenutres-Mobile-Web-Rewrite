import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { initialLinkAccountState } from "./state";

/**
 * Screen 2.1.8 Social Login / Account Linking's action.
 *
 * The property this file exists for: **sign in first, link second, and never link if the
 * sign-in failed.** Linking on the strength of a matching email address is how accounts
 * get taken over by whoever can register that address at a provider.
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  linkIdentity: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { linkAccountAction } from "./actions";

const EMAIL = "jordan@example.com";
const PASSWORD = "GreenPastures1";
const PROVIDER_URL = "https://accounts.google.com/o/oauth2/auth?state=abc";

function form(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = {
    email: EMAIL,
    password: PASSWORD,
    provider: "google",
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) fd.set(key, value);
  }
  return fd;
}

type ConsoleSpy = { mock: { calls: unknown[][] } };
let consoleSpies: ConsoleSpy[] = [];

function everythingLogged(): string {
  return JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

  for (const m of Object.values(mocks)) m.mockReset();

  mocks.createClient.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      linkIdentity: mocks.linkIdentity,
    },
  });
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  mocks.linkIdentity.mockResolvedValue({ data: { url: PROVIDER_URL }, error: null });
  mocks.redirect.mockImplementation((to: string) => {
    throw new RedirectSignal(to);
  });

  consoleSpies = (["warn", "error", "log", "info"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("linkAccountAction — the order is the security argument", () => {
  it("does NOT link when the password is wrong", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });

    const state = await linkAccountAction(initialLinkAccountState, form());

    expect(mocks.linkIdentity).not.toHaveBeenCalled();
    expect(state.formError).toEqual(authErrorByKind.invalid_credentials);
  });

  it("signs in before it links, never the other way round", async () => {
    const order: string[] = [];
    mocks.signInWithPassword.mockImplementation(async () => {
      order.push("signIn");
      return { data: {}, error: null };
    });
    mocks.linkIdentity.mockImplementation(async () => {
      order.push("link");
      return { data: { url: PROVIDER_URL }, error: null };
    });

    await expect(linkAccountAction(initialLinkAccountState, form())).rejects.toThrow(
      RedirectSignal,
    );
    expect(order).toEqual(["signIn", "link"]);
  });

  it("hands the browser to the provider to finish proving they own the social account", async () => {
    await expect(linkAccountAction(initialLinkAccountState, form())).rejects.toMatchObject({
      to: PROVIDER_URL,
    });

    const [options] = mocks.linkIdentity.mock.calls[0] as [
      { provider: string; options: { redirectTo: string; skipBrowserRedirect: boolean } },
    ];
    expect(options.provider).toBe("google");
    // Without this the URL is computed on the server and dropped — see lib/auth/actions.ts.
    expect(options.options.skipBrowserRedirect).toBe(true);
  });
});

describe("linkAccountAction — the provider it is asked for", () => {
  it.each(["facebook", "", "GOOGLE"])("refuses the unrecognised provider %j", async (provider) => {
    const state = await linkAccountAction(initialLinkAccountState, form({ provider }));
    expect(state.formError).toEqual(authErrorByKind.unknown);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses when no provider is posted at all", async () => {
    const state = await linkAccountAction(initialLinkAccountState, form({ provider: null }));
    expect(state.formError).toEqual(authErrorByKind.unknown);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("linkAccountAction — when the link itself fails", () => {
  it("still lets them through, because the password already worked", async () => {
    // They ARE signed in at this point. Losing the link is a disappointment, not a dead
    // end — stranding them on this form would be worse than the missing link.
    mocks.linkIdentity.mockResolvedValue({
      data: { url: null },
      error: new AuthApiError("nope", 500, "unexpected_failure"),
    });

    await expect(linkAccountAction(initialLinkAccountState, form())).rejects.toMatchObject({
      to: "/dashboard",
    });
  });
});

describe("linkAccountAction — validation, echo and logging", () => {
  it("rejects a missing password without calling the auth server", async () => {
    const state = await linkAccountAction(initialLinkAccountState, form({ password: "" }));
    expect(state.fieldErrors?.password).toEqual([AUTH_MESSAGES.passwordRequired]);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not apply the 12-character policy — this is a sign-in, not a sign-up", async () => {
    await expect(
      linkAccountAction(initialLinkAccountState, form({ password: "old" })),
    ).rejects.toThrow(RedirectSignal);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: "old" });
  });

  it("echoes the email back but never the password", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const state = await linkAccountAction(initialLinkAccountState, form());
    expect(state.email).toBe(EMAIL);
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("never logs the password or the address", async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: { url: null },
      error: new AuthApiError("boom", 500, "unexpected_failure"),
    });
    await expect(linkAccountAction(initialLinkAccountState, form())).rejects.toThrow(
      RedirectSignal,
    );

    const logged = everythingLogged();
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(EMAIL);
  });
});
