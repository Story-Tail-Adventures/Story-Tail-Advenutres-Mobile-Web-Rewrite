import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { REGISTRATION_MESSAGES } from "@/lib/validation/registration";
import { initialResetPasswordState } from "./state";

/**
 * Screen 2.1.5 Reset Password's action.
 *
 * The property that matters: the recovery session is the only authority for whose password
 * this changes. There is no email field and no token field, and the session is re-checked
 * at submit rather than trusted from the page's render — it can expire in between, and
 * "your password is updated" for a request that updated nothing is the worst outcome here.
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { resetPasswordAction } from "./actions";

const PASSWORD = "GreenPastures1";

function form(overrides: Record<string, string> = {}): FormData {
  const base = { password: PASSWORD, confirmPassword: PASSWORD, ...overrides };
  const fd = new FormData();
  for (const [key, value] of Object.entries(base)) fd.set(key, value);
  return fd;
}

function signedIn(user: object | null = { id: "u1", email: "jordan@example.com" }) {
  mocks.getUser.mockResolvedValue({ data: { user } });
}

type ConsoleSpy = { mock: { calls: unknown[][] } };
let consoleSpies: ConsoleSpy[] = [];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

  for (const m of Object.values(mocks)) m.mockReset();

  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.redirect.mockImplementation((to: string) => {
    throw new RedirectSignal(to);
  });
  signedIn();

  consoleSpies = (["warn", "error", "log", "info"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("resetPasswordAction — the session is the authority", () => {
  it("refuses when the recovery session has gone, without touching the password", async () => {
    signedIn(null);
    const state = await resetPasswordAction(initialResetPasswordState, form());
    expect(state.formError).toEqual(authErrorByKind.session_expired);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password of whoever the session belongs to, taking no identity from the form", async () => {
    const fd = form();
    fd.set("email", "someone.else@example.com");
    fd.set("token", "forged");

    await expect(resetPasswordAction(initialResetPasswordState, fd)).rejects.toThrow(
      RedirectSignal,
    );
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: PASSWORD });
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });

  it("re-checks the session at submit rather than trusting the render", async () => {
    await expect(resetPasswordAction(initialResetPasswordState, form())).rejects.toThrow(
      RedirectSignal,
    );
    expect(mocks.getUser).toHaveBeenCalled();
  });
});

describe("resetPasswordAction — validation", () => {
  it("applies the 12-character policy", async () => {
    const state = await resetPasswordAction(
      initialResetPasswordState,
      form({ password: "short1A", confirmPassword: "short1A" }),
    );
    expect(state.fieldErrors?.password).toEqual([AUTH_MESSAGES.passwordTooShort]);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("reports a mismatch on the confirmation field", async () => {
    const state = await resetPasswordAction(
      initialResetPasswordState,
      form({ confirmPassword: "GreenPastures2" }),
    );
    expect(state.fieldErrors?.confirmPassword).toEqual([REGISTRATION_MESSAGES.confirmMismatch]);
    expect(state.fieldErrors?.password).toBeUndefined();
  });

  it("puts a server-side weak-password verdict on the password field", async () => {
    mocks.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError("weak", 422, "weak_password"),
    });
    const state = await resetPasswordAction(initialResetPasswordState, form());
    expect(state.fieldErrors?.password).toEqual([authErrorByKind.weak_password.message]);
  });
});

describe("resetPasswordAction — after it works", () => {
  it("drops the cached logged-out layout and takes them to their trips", async () => {
    await expect(resetPasswordAction(initialResetPasswordState, form())).rejects.toMatchObject({
      to: "/dashboard",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("never returns either password in its state, on any path", async () => {
    const mismatch = await resetPasswordAction(
      initialResetPasswordState,
      form({ confirmPassword: "GreenPastures2" }),
    );
    expect(JSON.stringify(mismatch)).not.toContain(PASSWORD);

    signedIn(null);
    const expired = await resetPasswordAction(initialResetPasswordState, form());
    expect(JSON.stringify(expired)).not.toContain(PASSWORD);
  });

  it("never logs a password", async () => {
    mocks.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError("boom", 500, "unexpected_failure"),
    });
    await resetPasswordAction(initialResetPasswordState, form());
    const logged = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(PASSWORD);
  });
});
