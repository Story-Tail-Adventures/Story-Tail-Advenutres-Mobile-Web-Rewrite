import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { initialLoginState } from "./state";

/**
 * Screen 2.1.1 Login's action, with Supabase and Next's control-flow helpers stubbed out.
 *
 * This screen shipped before its sibling at /join and, oddly, without any of these — while
 * `signUpAction` next door carried 250 lines of them. What is pinned is security behaviour
 * rather than UI: the enumeration-safe error mapping, the redirect target, and that no
 * password or address reaches a console call.
 */

/** Stand-in for the NEXT_REDIRECT control-flow throw. */
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { signInAction } from "./actions";

const EMAIL = "jordan@example.com";
const PASSWORD = "GreenPastures1";

function form(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = { email: EMAIL, password: PASSWORD, next: "/dashboard" };
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) fd.set(key, value);
  }
  return fd;
}

function succeeds() {
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
}

function fails(error: AuthApiError) {
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error });
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

  mocks.signInWithPassword.mockReset();
  mocks.createClient.mockReset();
  mocks.redirect.mockReset();
  mocks.revalidatePath.mockReset();

  mocks.createClient.mockResolvedValue({
    auth: { signInWithPassword: mocks.signInWithPassword },
  });
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

describe("signInAction — validation", () => {
  it("rejects a missing email without calling the auth server", async () => {
    const state = await signInAction(initialLoginState, form({ email: "" }));
    // An empty string trips both the presence rule and the shape rule; the field renders
    // the first, and "don't forget your email" is the one worth reading.
    expect(state.fieldErrors?.email?.[0]).toBe(AUTH_MESSAGES.emailRequired);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const state = await signInAction(initialLoginState, form({ email: "jordan@" }));
    expect(state.fieldErrors?.email).toEqual([AUTH_MESSAGES.emailInvalid]);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a missing password without calling the auth server", async () => {
    const state = await signInAction(initialLoginState, form({ password: "" }));
    expect(state.fieldErrors?.password).toEqual([AUTH_MESSAGES.passwordRequired]);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does NOT apply the 12-character policy at sign-in", async () => {
    // Enforcing it here would lock out anyone whose password predates the policy, and
    // would leak the policy to an unauthenticated caller.
    succeeds();
    await expect(signInAction(initialLoginState, form({ password: "old" }))).rejects.toThrow(
      RedirectSignal,
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: "old" });
  });

  it("echoes the email back but never the password", async () => {
    const state = await signInAction(initialLoginState, form({ password: "" }));
    expect(state.email).toBe(EMAIL);
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });
});

describe("signInAction — where it sends people", () => {
  it("honours a same-origin next", async () => {
    succeeds();
    await expect(
      signInAction(initialLoginState, form({ next: "/trips/negril" })),
    ).rejects.toMatchObject({ to: "/trips/negril" });
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com", ""])(
    "refuses to redirect off-origin for next=%j",
    async (next) => {
      succeeds();
      await expect(signInAction(initialLoginState, form({ next }))).rejects.toMatchObject({
        to: "/dashboard",
      });
    },
  );

  it("drops the cached logged-out layout before leaving", async () => {
    succeeds();
    await expect(signInAction(initialLoginState, form())).rejects.toThrow(RedirectSignal);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("signInAction — failures", () => {
  it("gives the same answer for a wrong password and an address with no account", async () => {
    // Supabase collapses both into invalid_credentials; re-expanding it would hand an
    // unauthenticated caller an account-enumeration oracle.
    fails(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"));
    const wrongPassword = await signInAction(initialLoginState, form());

    fails(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"));
    const noSuchAccount = await signInAction(initialLoginState, form({ email: "nobody@example.com" }));

    expect(wrongPassword.formError).toEqual(noSuchAccount.formError);
    expect(wrongPassword.formError).toEqual(authErrorByKind.invalid_credentials);
  });

  it("points an unconfirmed account at the verification screen", async () => {
    fails(new AuthApiError("Email not confirmed", 400, "email_not_confirmed"));
    const state = await signInAction(initialLoginState, form());
    expect(state.formError?.action?.href).toBe("/verify-email");
  });

  it("reports missing configuration without reaching for the client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const state = await signInAction(initialLoginState, form());
    expect(state.formError).toEqual(authErrorByKind.not_configured);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("signInAction — what gets logged", () => {
  it("never logs the password or the email, on any path", async () => {
    fails(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"));
    await signInAction(initialLoginState, form());

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await signInAction(initialLoginState, form());

    const logged = everythingLogged();
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(EMAIL);
  });
});
