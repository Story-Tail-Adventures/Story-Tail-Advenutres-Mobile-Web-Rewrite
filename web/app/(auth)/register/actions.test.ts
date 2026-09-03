import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { REGISTRATION_MESSAGES } from "@/lib/validation/registration";
import { initialRegisterState } from "./state";

/**
 * Screen 2.1.2 Registration's action.
 *
 * The sibling of app/(public)/(plain)/join/actions.test.ts, and it pins the same four
 * things, because they are the ones where a mistake is a security bug: the exact metadata
 * keys handed to the `handle_new_user` trigger, the enumeration-safe uniform response, the
 * redirect target, and that nothing sensitive reaches a console call.
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

import { registerAction } from "./actions";

const EMAIL = "jordan@example.com";
const PASSWORD = "GreenPastures1";
const NEXT = "/trips/negril";

function form(overrides: Record<string, string | null> = {}): FormData {
  const base: Record<string, string> = {
    firstName: " Jordan ",
    lastName: "Hayes",
    email: EMAIL,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    terms: "on",
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

function resolves(
  data: { user: object | null; session: object | null },
  error: AuthApiError | null = null,
) {
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

describe("registerAction — what reaches Supabase", () => {
  it("sends exactly first_name and last_name as metadata, whatever else the form carries", async () => {
    resolves({ user: fakeUser, session: null });

    await registerAction(initialRegisterState, form({ agent_id: "attacker", role: "agent" }));

    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    const [credentials] = mocks.signUp.mock.calls[0] as [
      {
        email: string;
        password: string;
        options: { data: Record<string, unknown>; emailRedirectTo: string };
      },
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
    await registerAction(initialRegisterState, form({ next: "//evil.com/steal" }));
    const [credentials] = mocks.signUp.mock.calls[0] as [{ options: { emailRedirectTo: string } }];
    expect(credentials.options.emailRedirectTo).toBe(
      "http://localhost:3000/auth/callback?next=%2Fdashboard",
    );
  });
});

describe("registerAction — the confirmation field 2.1.2 adds over the 2.0.6 gate", () => {
  it("refuses a mismatched confirmation without calling the auth server", async () => {
    const state = await registerAction(
      initialRegisterState,
      form({ confirmPassword: "GreenPastures2" }),
    );
    expect(state.fieldErrors?.confirmPassword).toEqual([REGISTRATION_MESSAGES.confirmMismatch]);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("marks the confirmation field, never the first password field", async () => {
    const state = await registerAction(
      initialRegisterState,
      form({ confirmPassword: "GreenPastures2" }),
    );
    expect(state.fieldErrors?.password).toBeUndefined();
  });

  it("requires the terms checkbox", async () => {
    const state = await registerAction(initialRegisterState, form({ terms: null }));
    expect(state.fieldErrors?.terms).toEqual([REGISTRATION_MESSAGES.termsRequired]);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

describe("registerAction — account enumeration", () => {
  it("returns an identical state for a duplicate email and a fresh sign-up awaiting confirmation", async () => {
    resolves(
      { user: null, session: null },
      new AuthApiError("User already registered", 422, "user_already_exists"),
    );
    const duplicate = await registerAction(initialRegisterState, form());

    resolves({ user: fakeUser, session: null });
    const fresh = await registerAction(initialRegisterState, form());

    expect(duplicate).toEqual(fresh);
    expect(duplicate).toEqual({ outcome: "confirm_email", email: EMAIL });
  });
});

describe("registerAction — outcomes", () => {
  it("redirects when confirmations are off and a session comes back", async () => {
    resolves({ user: fakeUser, session: fakeSession });
    await expect(registerAction(initialRegisterState, form())).rejects.toMatchObject({
      to: NEXT,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    // Not the whole layout: purging the root would evict every static public page.
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("puts a server-side weak-password verdict on the password field", async () => {
    resolves({ user: null, session: null }, new AuthApiError("weak", 422, "weak_password"));
    const state = await registerAction(initialRegisterState, form());
    expect(state.fieldErrors?.password).toEqual([authErrorByKind.weak_password.message]);
  });

  it("never offers 'reset your password' on a sign-up", async () => {
    // invalid_credentials is sign-in vocabulary; its action link points at /forgot-password,
    // which is nonsense for someone who has no account yet.
    resolves({ user: null, session: null }, new AuthApiError("nope", 400, "invalid_credentials"));
    const state = await registerAction(initialRegisterState, form());
    expect(state.formError).toEqual(authErrorByKind.unknown);
  });

  it("reports missing configuration without reaching for the client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const state = await registerAction(initialRegisterState, form());
    expect(state.formError).toEqual(authErrorByKind.not_configured);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("registerAction — what it keeps and what it says", () => {
  it("echoes the name and email back on failure, but neither password", async () => {
    const state = await registerAction(
      initialRegisterState,
      form({ confirmPassword: "GreenPastures2" }),
    );
    expect(state.firstName).toBe(" Jordan ");
    expect(state.email).toBe(EMAIL);
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("never logs a password, the email, or the metadata", async () => {
    resolves({ user: null, session: null }, new AuthApiError("boom", 500, "unexpected_failure"));
    await registerAction(initialRegisterState, form());

    const logged = everythingLogged();
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain("Jordan");
  });
});
