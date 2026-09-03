import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { authErrorByKind } from "@/lib/auth-errors";
import { MFA_MESSAGES } from "@/lib/validation/mfa";
import { initialMfaEnrollState, initialMfaVerifyState } from "./state";

/**
 * Screen 2.1.6 MFA Setup's two actions.
 *
 * The enroll half has one behaviour that is invisible from the screen and expensive to
 * rediscover: it sweeps abandoned unverified factors first. Without that, ten refreshes
 * exhaust `max_enrolled_factors` and enrollment starts failing for a reason nobody could
 * guess from the page.
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { beginMfaEnrollmentAction, verifyMfaEnrollmentAction } from "./actions";

const CODE = "483921";
const RAW_SVG = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';

function verifyForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    code: CODE,
    factorId: "factor-1",
    next: "/dashboard",
    ...overrides,
  })) {
    fd.set(k, v);
  }
  return fd;
}

let consoleSpy: { mock: { calls: unknown[][] } };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

  for (const m of Object.values(mocks)) m.mockReset();

  mocks.createClient.mockResolvedValue({
    auth: {
      mfa: {
        listFactors: mocks.listFactors,
        unenroll: mocks.unenroll,
        enroll: mocks.enroll,
        challengeAndVerify: mocks.challengeAndVerify,
      },
    },
  });
  mocks.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
  mocks.enroll.mockResolvedValue({
    data: { id: "factor-1", totp: { qr_code: RAW_SVG, secret: "SECRET", uri: "otpauth://x" } },
    error: null,
  });
  mocks.unenroll.mockResolvedValue({ data: {}, error: null });
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

describe("beginMfaEnrollmentAction — clearing up after abandoned attempts", () => {
  it("unenrolls every unverified factor before enrolling a new one", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: "stale-1", status: "unverified" },
          { id: "stale-2", status: "unverified" },
          { id: "keep-me", status: "verified" },
        ],
        totp: [],
      },
      error: null,
    });

    await beginMfaEnrollmentAction(initialMfaEnrollState, new FormData());

    expect(mocks.unenroll).toHaveBeenCalledTimes(2);
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: "stale-1" });
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: "stale-2" });
    // A verified factor is somebody's working second factor. Sweeping it would lock them
    // out of their own account.
    expect(mocks.unenroll).not.toHaveBeenCalledWith({ factorId: "keep-me" });
  });
});

describe("beginMfaEnrollmentAction — what the screen gets back", () => {
  it("wraps raw SVG markup as a data URI so it can be an <img> src", async () => {
    const state = await beginMfaEnrollmentAction(initialMfaEnrollState, new FormData());
    expect(state.enrollment?.qrCode).toBe(
      `data:image/svg+xml;base64,${Buffer.from(RAW_SVG).toString("base64")}`,
    );
  });

  it("leaves an already-wrapped data URI alone", async () => {
    // supabase-js hands back `data:image/svg+xml;utf-8,<svg…>` where the REST API returns
    // raw markup. Wrapping unconditionally produces a data URI that decodes to another
    // data URI — an <img> that renders nothing, and says nothing about why.
    const wrapped = "data:image/svg+xml;utf-8,<svg></svg>";
    mocks.enroll.mockResolvedValue({
      data: { id: "factor-1", totp: { qr_code: wrapped, secret: "S", uri: "otpauth://x" } },
      error: null,
    });
    const state = await beginMfaEnrollmentAction(initialMfaEnrollState, new FormData());
    expect(state.enrollment?.qrCode).toBe(wrapped);
  });

  it("returns the factor id and the typeable secret", async () => {
    const state = await beginMfaEnrollmentAction(initialMfaEnrollState, new FormData());
    expect(state.enrollment?.factorId).toBe("factor-1");
    expect(state.enrollment?.secret).toBe("SECRET");
  });

  it("reports a failed enrollment without an enrollment to render", async () => {
    mocks.enroll.mockResolvedValue({
      data: null,
      error: new AuthApiError("nope", 500, "unexpected_failure"),
    });
    const state = await beginMfaEnrollmentAction(initialMfaEnrollState, new FormData());
    expect(state.enrollment).toBeUndefined();
    expect(state.formError).toBeDefined();
  });

  it("reports missing configuration without reaching for the client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const state = await beginMfaEnrollmentAction(initialMfaEnrollState, new FormData());
    expect(state.formError).toEqual(authErrorByKind.not_configured);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("verifyMfaEnrollmentAction", () => {
  it("verifies the enrolled factor with the normalised code", async () => {
    await expect(
      verifyMfaEnrollmentAction(initialMfaVerifyState, verifyForm({ code: "483 921" })),
    ).rejects.toThrow(RedirectSignal);
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      code: CODE,
    });
  });

  it("rejects the wrong shape without calling the auth server", async () => {
    const state = await verifyMfaEnrollmentAction(
      initialMfaVerifyState,
      verifyForm({ code: "1234567" }),
    );
    expect(state.fieldErrors?.code).toEqual([MFA_MESSAGES.codeShape]);
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("refuses when the form carries no factor to verify", async () => {
    const state = await verifyMfaEnrollmentAction(
      initialMfaVerifyState,
      verifyForm({ factorId: "" }),
    );
    expect(state.formError).toEqual(authErrorByKind.unknown);
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("puts a rejected code on the field, in the language of a rollover", async () => {
    mocks.challengeAndVerify.mockResolvedValue({
      data: {},
      error: new AuthApiError("nope", 401, "mfa_verification_failed"),
    });
    const state = await verifyMfaEnrollmentAction(initialMfaVerifyState, verifyForm());
    expect(state.fieldErrors?.code?.[0]).toContain("roll over every 30 seconds");
  });

  it("honours a same-origin next and refuses an off-origin one", async () => {
    await expect(
      verifyMfaEnrollmentAction(initialMfaVerifyState, verifyForm({ next: "/account" })),
    ).rejects.toMatchObject({ to: "/account" });

    await expect(
      verifyMfaEnrollmentAction(initialMfaVerifyState, verifyForm({ next: "https://evil.com" })),
    ).rejects.toMatchObject({ to: "/dashboard" });
  });

  it("never logs the code", async () => {
    mocks.challengeAndVerify.mockResolvedValue({
      data: {},
      error: new AuthApiError("nope", 401, "mfa_verification_failed"),
    });
    await verifyMfaEnrollmentAction(initialMfaVerifyState, verifyForm());
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(CODE);
  });
});
