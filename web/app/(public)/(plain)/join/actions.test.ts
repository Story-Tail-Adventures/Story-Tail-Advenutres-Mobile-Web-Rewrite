import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { AUTH_MESSAGES } from "@/lib/validation/auth";
import { JOIN_MESSAGES } from "./schema";
import { initialJoinState } from "./state";

/**
 * The sign-up action, with Supabase and Next's control-flow helpers stubbed out.
 *
 * What is pinned here is security behaviour, not UI: the exact metadata keys handed to
 * the `handle_new_user` trigger, the enumeration-safe uniform response, the redirect
 * target, and that nothing sensitive reaches a console call.
 */

/** Stand-in for the NEXT_REDIRECT control-flow throw. */
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { signUpAction } from "./actions";

const PASSWORD = "GreenPastures1";
const EMAIL = "jordan@example.com";
const NEXT = "/explore/couples-negril";

function form(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = {
    firstName: " Jordan ",
    lastName: "Hayes",
    email: EMAIL,
    password: PASSWORD,
    terms: "on",
    intent: "quote",
    trip: "couples-negril",
    next: NEXT,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) fd.set(key, value);
  }
  return fd;
}

const fakeUser = { id: "00000000-0000-7000-8000-000000000001" };
const fakeSession = { access_token: "t", refresh_token: "r" };

function resolves(data: { user: object | null; session: object | null }, error: AuthApiError | null = null) {
  mocks.signUp.mockResolvedValue({ data, error });
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

  mocks.signUp.mockReset();
  mocks.createClient.mockReset();
  mocks.redirect.mockReset();
  mocks.revalidatePath.mockReset();

  mocks.createClient.mockResolvedValue({ auth: { signUp: mocks.signUp } });
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

describe("signUpAction — what reaches Supabase", () => {
  it("sends exactly first_name and last_name as metadata, whatever else the form carries", async () => {
    resolves({ user: fakeUser, session: null });

    await signUpAction(initialJoinState, form({ agent_id: "attacker", role: "agent" }));

    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    const [credentials] = mocks.signUp.mock.calls[0] as [
      { email: string; password: string; options: { data: Record<string, unknown>; emailRedirectTo: string } },
    ];
    expect(credentials.email).toBe(EMAIL);
    expect(credentials.password).toBe(PASSWORD);
    expect(Object.keys(credentials.options.data)).toEqual(["first_name", "last_name"]);
    expect(credentials.options.data).toEqual({ first_name: "Jordan", last_name: "Hayes" });
    expect(credentials.options.emailRedirectTo).toBe(
      `http://localhost:3000/auth/callback?next=${encodeURIComponent(NEXT)}`,
    );
  });

  it("carries only a same-origin next in the confirmation link", async () => {
    resolves({ user: fakeUser, session: null });

    await signUpAction(initialJoinState, form({ next: "//evil.com/steal" }));

    const [credentials] = mocks.signUp.mock.calls[0] as [{ options: { emailRedirectTo: string } }];
    expect(credentials.options.emailRedirectTo).toBe(
      "http://localhost:3000/auth/callback?next=%2Fdashboard",
    );
  });
});

describe("signUpAction — account enumeration", () => {
  it("returns an identical state for a duplicate email and a fresh sign-up awaiting confirmation", async () => {
    resolves(
      { user: null, session: null },
      new AuthApiError("User already registered", 422, "user_already_exists"),
    );
    const duplicate = await signUpAction(initialJoinState, form());

    resolves({ user: fakeUser, session: null });
    const fresh = await signUpAction(initialJoinState, form());

    expect(duplicate).toEqual(fresh);
    expect(duplicate).toEqual({ outcome: "confirm_email", email: EMAIL });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("signUpAction — signed in immediately (confirmations off)", () => {
  it("revalidates the dashboard, then redirects to the safe next", async () => {
    resolves({ user: fakeUser, session: fakeSession });

    await expect(signUpAction(initialJoinState, form())).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith(NEXT);
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    );
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", null])(
    "falls back to /dashboard for next=%j",
    async (next) => {
      resolves({ user: fakeUser, session: fakeSession });

      await expect(signUpAction(initialJoinState, form({ next }))).rejects.toBeInstanceOf(
        RedirectSignal,
      );
      expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    },
  );
});

describe("signUpAction — failures", () => {
  it("returns field errors without touching Supabase when validation fails", async () => {
    const state = await signUpAction(initialJoinState, form({ terms: null, password: "Short1" }));

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.fieldErrors?.terms).toEqual([JOIN_MESSAGES.termsRequired]);
    expect(state.fieldErrors?.password).toEqual([AUTH_MESSAGES.passwordTooShort]);
    expect(state.firstName).toBe(" Jordan ");
    expect(state.lastName).toBe("Hayes");
    expect(state.email).toBe(EMAIL);
    expect(state).not.toHaveProperty("password");
  });

  it("maps 429 to rate_limited and echoes everything except the password", async () => {
    resolves({ user: null, session: null }, new AuthApiError("slow down", 429, "over_email_send_rate_limit"));

    const state = await signUpAction(initialJoinState, form());

    expect(state.formError).toBe(authErrorByKind.rate_limited);
    expect(state.email).toBe(EMAIL);
    expect(state.firstName).toBe(" Jordan ");
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("puts GoTrue's weak_password and email_address_invalid on their fields", async () => {
    resolves({ user: null, session: null }, new AuthApiError("weak", 422, "weak_password"));
    const weak = await signUpAction(initialJoinState, form());
    expect(weak.fieldErrors?.password).toEqual([authErrorByKind.weak_password.message]);
    expect(weak.formError).toBeUndefined();

    resolves({ user: null, session: null }, new AuthApiError("bad", 400, "email_address_invalid"));
    const invalid = await signUpAction(initialJoinState, form());
    expect(invalid.fieldErrors?.email).toEqual([authErrorByKind.email_invalid.message]);
    expect(invalid.formError).toBeUndefined();
  });

  it("does not use sign-in vocabulary for an unrecognised 400", async () => {
    resolves({ user: null, session: null }, new AuthApiError("bad json", 400, "validation_failed"));

    const state = await signUpAction(initialJoinState, form());

    expect(state.formError).toBe(authErrorByKind.unknown);
    expect(state.formError?.action).toBeUndefined();
  });

  it("surfaces an unconfigured Supabase as a form error, not a 500", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const state = await signUpAction(initialJoinState, form());

    expect(state.formError).toBe(authErrorByKind.not_configured);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.email).toBe(EMAIL);
  });
});

describe("signUpAction — logging", () => {
  it("never writes the password, the email or the names to the console", async () => {
    // Every branch that logs, in turn.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await signUpAction(initialJoinState, form());
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

    resolves({ user: null, session: null }, new AuthApiError("slow down", 429, "over_email_send_rate_limit"));
    await signUpAction(initialJoinState, form());

    resolves({ user: null, session: null }, new AuthApiError("boom", 500, "unexpected_failure"));
    await signUpAction(initialJoinState, form());

    await signUpAction(initialJoinState, form({ terms: null }));

    const logged = everythingLogged();
    expect(logged).not.toBe("[]");
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain("Jordan");
    expect(logged).not.toContain("Hayes");
    // Code and status are fine — they are what a support thread needs.
    expect(logged).toContain("unexpected_failure");
    expect(logged).toContain("429");
  });
});
