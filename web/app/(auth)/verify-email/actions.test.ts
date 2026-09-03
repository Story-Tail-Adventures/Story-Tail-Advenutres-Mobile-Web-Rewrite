import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { initialChangeEmailState, initialResendState } from "./state";

/**
 * Screen 2.1.3 Email Verification's two actions.
 *
 * The rule worth pinning on the resend: **a session, when there is one, outranks the
 * form.** Accepting a posted address from a signed-in caller would turn "resend my
 * verification email" into "send verification email to anyone I name".
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resend: vi.fn(),
  updateUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { changeEmailAction, resendVerificationAction } from "./actions";

const MINE = "jordan@example.com";
const SOMEONE_ELSE = "victim@example.com";

function form(email?: string): FormData {
  const fd = new FormData();
  if (email !== undefined) fd.set("email", email);
  return fd;
}

function signedIn(email: string | null) {
  mocks.getUser.mockResolvedValue({ data: { user: email ? { id: "u1", email } : null } });
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
    auth: { getUser: mocks.getUser, resend: mocks.resend, updateUser: mocks.updateUser },
  });
  mocks.resend.mockResolvedValue({ data: {}, error: null });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  signedIn(null);

  consoleSpies = (["warn", "error", "log", "info"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("resendVerificationAction — whose address gets used", () => {
  it("ignores a posted address when there is a session", async () => {
    signedIn(MINE);
    await resendVerificationAction(initialResendState, form(SOMEONE_ELSE));
    expect(mocks.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: MINE }),
    );
  });

  it("takes the address from the form when there is no session", async () => {
    // Straight after sign-up there is no session — GoTrue withholds one until the address
    // is confirmed — so this is the common path, not the exception.
    await resendVerificationAction(initialResendState, form(MINE));
    expect(mocks.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: MINE }),
    );
  });

  it("rejects a malformed address without calling the auth server", async () => {
    const state = await resendVerificationAction(initialResendState, form("jordan@"));
    expect(state.fieldErrors?.email).toEqual([AUTH_MESSAGES.emailInvalid]);
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});

describe("resendVerificationAction — account enumeration", () => {
  it("answers identically whether or not the address has an account", async () => {
    const real = await resendVerificationAction(initialResendState, form(MINE));

    mocks.resend.mockResolvedValue({
      data: {},
      error: new AuthApiError("User not found", 400, "user_not_found"),
    });
    const unknown = await resendVerificationAction(initialResendState, form(MINE));

    expect(unknown).toEqual(real);
    expect(real).toEqual({ outcome: "sent", email: MINE });
  });

  it("still surfaces rate limiting, which explains a mail that is not coming", async () => {
    mocks.resend.mockResolvedValue({
      data: {},
      error: new AuthApiError("too many", 429, "over_email_send_rate_limit"),
    });
    const state = await resendVerificationAction(initialResendState, form(MINE));
    expect(state.formError).toEqual(authErrorByKind.rate_limited);
  });

  it("never logs the address", async () => {
    mocks.resend.mockResolvedValue({
      data: {},
      error: new AuthApiError("boom", 500, "unexpected_failure"),
    });
    await resendVerificationAction(initialResendState, form(MINE));
    expect(everythingLogged()).not.toContain(MINE);
  });
});

describe("changeEmailAction", () => {
  it("refuses without a session — an unauthenticated one is an account-takeover form", async () => {
    const state = await changeEmailAction(initialChangeEmailState, form(SOMEONE_ELSE));
    expect(state.formError).toEqual(authErrorByKind.session_expired);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("moves the address on the session's own account", async () => {
    signedIn(MINE);
    await changeEmailAction(initialChangeEmailState, form(SOMEONE_ELSE));
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { email: SOMEONE_ELSE },
      {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard",
      },
    );
  });

  it("rejects a malformed address before it reaches the session check", async () => {
    signedIn(MINE);
    const state = await changeEmailAction(initialChangeEmailState, form("nope"));
    expect(state.fieldErrors?.email).toEqual([AUTH_MESSAGES.emailInvalid]);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("reports success as sent, with the new address to show back", async () => {
    signedIn(MINE);
    const state = await changeEmailAction(initialChangeEmailState, form(SOMEONE_ELSE));
    expect(state).toEqual({ outcome: "sent", email: SOMEONE_ELSE });
  });
});
