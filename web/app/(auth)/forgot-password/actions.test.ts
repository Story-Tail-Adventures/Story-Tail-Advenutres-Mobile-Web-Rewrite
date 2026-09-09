import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { initialForgotPasswordState } from "./state";

/**
 * Screen 2.1.4 Forgot Password's action.
 *
 * One property carries this whole file: **the answer must not depend on whether the
 * account exists.** A form that says "no account with that email" is an enumeration
 * oracle for anyone holding a list of addresses.
 */

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { requestPasswordResetAction } from "./actions";

const EMAIL = "jordan@example.com";

function form(email: string = EMAIL): FormData {
  const fd = new FormData();
  fd.set("email", email);
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

  mocks.resetPasswordForEmail.mockReset();
  mocks.createClient.mockReset();
  mocks.createClient.mockResolvedValue({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

  consoleSpies = (["warn", "error", "log", "info"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requestPasswordResetAction — account enumeration", () => {
  it("answers identically whether or not the address has an account", async () => {
    const exists = await requestPasswordResetAction(initialForgotPasswordState, form());

    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: new AuthApiError("User not found", 400, "user_not_found"),
    });
    const missing = await requestPasswordResetAction(initialForgotPasswordState, form());

    expect(missing).toEqual(exists);
    expect(exists).toEqual({ outcome: "sent", email: EMAIL });
  });

  it("reports sent even when GoTrue rejects the address outright", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: new AuthApiError("bad address", 400, "email_address_invalid"),
    });
    const state = await requestPasswordResetAction(initialForgotPasswordState, form());
    expect(state.outcome).toBe("sent");
  });
});

describe("requestPasswordResetAction — the two failures worth showing", () => {
  it("surfaces rate limiting, which explains a mail that is not coming", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: new AuthApiError("too many", 429, "over_email_send_rate_limit"),
    });
    const state = await requestPasswordResetAction(initialForgotPasswordState, form());
    expect(state.formError).toEqual(authErrorByKind.rate_limited);
    expect(state.outcome).toBeUndefined();
  });

  it("reports missing configuration without reaching for the client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const state = await requestPasswordResetAction(initialForgotPasswordState, form());
    expect(state.formError).toEqual(authErrorByKind.not_configured);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("requestPasswordResetAction — the link it sends", () => {
  it("routes the emailed link through the PKCE callback to the reset form", async () => {
    await requestPasswordResetAction(initialForgotPasswordState, form());
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Freset-password",
    });
  });

  it("trims the address before sending", async () => {
    await requestPasswordResetAction(initialForgotPasswordState, form(`  ${EMAIL}  `));
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, expect.anything());
  });
});

describe("requestPasswordResetAction — validation and logging", () => {
  it("rejects a malformed address without calling the auth server", async () => {
    const state = await requestPasswordResetAction(initialForgotPasswordState, form("jordan@"));
    expect(state.fieldErrors?.email).toEqual([AUTH_MESSAGES.emailInvalid]);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("never logs the address", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: new AuthApiError("boom", 500, "unexpected_failure"),
    });
    await requestPasswordResetAction(initialForgotPasswordState, form());
    expect(everythingLogged()).not.toContain(EMAIL);
  });
});
