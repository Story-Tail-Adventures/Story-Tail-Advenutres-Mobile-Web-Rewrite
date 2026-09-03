import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { MFA_MESSAGES } from "@/lib/validation/mfa";
import { initialMfaChallengeState } from "./state";

/**
 * Screen 2.1.7 MFA Challenge's action.
 *
 * The property worth pinning: **the factor comes from the session, never from the form.**
 * A posted `factorId` would be a request to be challenged on a factor of the caller's
 * choosing, which is the opposite of what a challenge is for.
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { mfaChallengeAction } from "./actions";

const CODE = "483921";
const VERIFIED = { id: "factor-verified", status: "verified", factor_type: "totp" };
const UNVERIFIED = { id: "factor-unverified", status: "unverified", factor_type: "totp" };

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ code: CODE, next: "/dashboard", ...overrides })) {
    fd.set(k, v);
  }
  return fd;
}

function factors(totp: object[]) {
  mocks.listFactors.mockResolvedValue({ data: { totp, all: totp }, error: null });
}

let consoleSpy: { mock: { calls: unknown[][] } };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

  for (const m of Object.values(mocks)) m.mockReset();

  mocks.createClient.mockResolvedValue({
    auth: { mfa: { listFactors: mocks.listFactors, challengeAndVerify: mocks.challengeAndVerify } },
  });
  factors([VERIFIED]);
  mocks.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  mocks.redirect.mockImplementation((to: string) => {
    throw new RedirectSignal(to);
  });

  consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mfaChallengeAction — which factor gets challenged", () => {
  it("uses the session's verified factor and ignores any posted id", async () => {
    await expect(
      mfaChallengeAction(initialMfaChallengeState, form({ factorId: "attacker-chosen" })),
    ).rejects.toThrow(RedirectSignal);

    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: VERIFIED.id,
      code: CODE,
    });
  });

  it("will not challenge an unverified factor", async () => {
    // A half-finished enrollment is not a second factor. Treating it as one would let
    // somebody satisfy the gate with a factor they never proved they controlled.
    factors([UNVERIFIED]);
    const state = await mfaChallengeAction(initialMfaChallengeState, form());
    expect(state.formError).toEqual(authErrorByKind.session_expired);
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("says the session expired when there is no factor at all", async () => {
    factors([]);
    const state = await mfaChallengeAction(initialMfaChallengeState, form());
    expect(state.formError).toEqual(authErrorByKind.session_expired);
  });
});

describe("mfaChallengeAction — the code", () => {
  it("accepts the spacing an authenticator app actually displays", async () => {
    await expect(
      mfaChallengeAction(initialMfaChallengeState, form({ code: "483 921" })),
    ).rejects.toThrow(RedirectSignal);
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: VERIFIED.id,
      code: CODE,
    });
  });

  it("rejects the wrong shape without calling the auth server", async () => {
    const state = await mfaChallengeAction(initialMfaChallengeState, form({ code: "12345" }));
    expect(state.fieldErrors?.code).toEqual([MFA_MESSAGES.codeShape]);
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("puts a rejected code on the field, in the language of a rollover", async () => {
    mocks.challengeAndVerify.mockResolvedValue({
      data: {},
      error: new AuthApiError("nope", 401, "mfa_verification_failed"),
    });
    const state = await mfaChallengeAction(initialMfaChallengeState, form());
    expect(state.fieldErrors?.code?.[0]).toContain("roll over every 30 seconds");
  });

  it("surfaces rate limiting above the form, not on the field", async () => {
    mocks.challengeAndVerify.mockResolvedValue({
      data: {},
      error: new AuthApiError("slow down", 429, "over_request_rate_limit"),
    });
    const state = await mfaChallengeAction(initialMfaChallengeState, form());
    expect(state.formError).toEqual(authErrorByKind.rate_limited);
    expect(state.fieldErrors).toBeUndefined();
  });

  it("never logs the code — it is a live credential for another half minute", async () => {
    mocks.challengeAndVerify.mockResolvedValue({
      data: {},
      error: new AuthApiError("nope", 401, "mfa_verification_failed"),
    });
    await mfaChallengeAction(initialMfaChallengeState, form());
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(CODE);
  });
});

describe("mfaChallengeAction — after it works", () => {
  it("honours a same-origin next", async () => {
    await expect(
      mfaChallengeAction(initialMfaChallengeState, form({ next: "/trips/negril" })),
    ).rejects.toMatchObject({ to: "/trips/negril" });
  });

  it("refuses to redirect off-origin", async () => {
    await expect(
      mfaChallengeAction(initialMfaChallengeState, form({ next: "//evil.com" })),
    ).rejects.toMatchObject({ to: "/dashboard" });
  });

  it("drops the cached layout, because the assurance level just changed", async () => {
    await expect(mfaChallengeAction(initialMfaChallengeState, form())).rejects.toThrow(
      RedirectSignal,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
