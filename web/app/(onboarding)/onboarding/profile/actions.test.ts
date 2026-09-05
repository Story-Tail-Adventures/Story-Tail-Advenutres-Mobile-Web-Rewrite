import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_MESSAGES } from "@/lib/validation/profile";
import { initialProfileState, PROFILE_TEXT } from "./state";

/**
 * Screen 2.1.10's actions.
 *
 * Three things here are worth pinning because getting them wrong is a data problem rather
 * than a layout one: that a phone number reaches the Edge Function normalised and never as
 * typed, that a passport NUMBER can never be sent from this screen, and that "Skip for now"
 * writes only the cursor — calling the profile function with an empty body would spend an
 * `audit_event` row saying somebody changed nothing.
 */

/**
 * Stand-in for the NEXT_REDIRECT control-flow throw, so a test also fails if the action
 * carries on doing work after deciding to navigate away.
 */
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  callOnboarding: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/onboarding/api", () => ({ callOnboarding: mocks.callOnboarding }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { saveProfileAction, skipProfileAction } from "./actions";

const FILLED: Record<string, string> = {
  phone: "(305) 555-0184",
  dateOfBirth: "1992-04-22",
  addressLine1: "1240 Brickell Bay Dr",
  addressLine2: "",
  addressCity: "Miami",
  addressRegion: "FL",
  addressPostalCode: "33131",
  addressCountry: "US",
  emergencyName: "Sam Hayes",
  emergencyPhone: "(305) 555-0186",
  emergencyRelationship: "Spouse",
  passportExpiry: "2029-08-14",
  passportCountry: "US",
};

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...FILLED, ...overrides })) fd.set(key, value);
  return fd;
}

function bodySent(): Record<string, unknown> {
  // The mock's arguments are `any[]`; this narrows to the shape `callOnboarding` declares.
  return mocks.callOnboarding.mock.calls[0][1] as Record<string, unknown>;
}

/** Runs `action`, swallowing the redirect throw and returning where it aimed. */
async function redirectedBy(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callOnboarding.mockResolvedValue({ ok: true, data: { ok: true } });
  mocks.redirect.mockImplementation((to: string) => {
    throw new RedirectSignal(to);
  });
});

describe("saveProfileAction", () => {
  it("sends the whole profile to onboarding-profile and advances the wizard", async () => {
    const to = await redirectedBy(() => saveProfileAction(initialProfileState, form()));

    expect(mocks.callOnboarding).toHaveBeenCalledTimes(1);
    expect(mocks.callOnboarding.mock.calls[0][0]).toBe("onboarding-profile");
    expect(bodySent()).toEqual({
      phone: "+13055550184",
      dateOfBirth: "1992-04-22",
      address: {
        line1: "1240 Brickell Bay Dr",
        line2: null,
        city: "Miami",
        region: "FL",
        postalCode: "33131",
        country: "US",
      },
      emergencyContact: {
        name: "Sam Hayes",
        phone: "+13055550186",
        relationship: "Spouse",
      },
      passport: { expiresOn: "2029-08-14", issuingCountry: "US" },
      advance: true,
    });
    expect(to).toBe("/onboarding/preferences");
  });

  it("never sends a passport number, even when the form carries one", async () => {
    // There is no such input on the screen; this is about a crafted post. The function
    // refuses the key loudly too, but nothing should ever get that far from here.
    await redirectedBy(() =>
      saveProfileAction(initialProfileState, form({ passportNumber: "A123456789" })),
    );

    expect(JSON.stringify(bodySent())).not.toContain("A123456789");
    expect(bodySent().passport).toEqual({ expiresOn: "2029-08-14", issuingCountry: "US" });
  });

  it("writes nothing when the form does not validate", async () => {
    const state = await saveProfileAction(
      initialProfileState,
      form({ emergencyPhone: "" }),
    );

    expect(mocks.callOnboarding).not.toHaveBeenCalled();
    expect(state.fieldErrors?.emergencyContact).toEqual([
      PROFILE_MESSAGES.emergencyIncomplete,
    ]);
  });

  it("hands back what was typed, not what it would have stored", async () => {
    // Showing somebody `+13055550184` after they typed `(305) 555-0184` and got a different
    // field wrong reads as the form having quietly rewritten them.
    const state = await saveProfileAction(initialProfileState, form({ addressCity: "" }));

    expect(state.values?.phone).toBe("(305) 555-0184");
    expect(state.values?.addressCity).toBe("");
  });

  it("sends people to sign in again when the session has gone", async () => {
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unauthenticated" });
    const to = await redirectedBy(() => saveProfileAction(initialProfileState, form()));
    expect(to).toBe("/login");
  });

  it("prefers the function's own explanation over the generic failure", async () => {
    mocks.callOnboarding.mockResolvedValue({
      ok: false,
      kind: "rejected",
      detail: "An address needs a street, a city and a country.",
    });
    const state = await saveProfileAction(initialProfileState, form());
    expect(state.formError).toBe("An address needs a street, a city and a country.");
  });

  it("falls back to the generic failure when there is nothing to explain", async () => {
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unavailable" });
    const state = await saveProfileAction(initialProfileState, form());
    expect(state.formError).toBe(PROFILE_TEXT.formError);
    expect(state.values?.phone).toBe("(305) 555-0184");
  });
});

describe("skipProfileAction", () => {
  it("moves the cursor on without touching the profile or an audit row", async () => {
    const to = await redirectedBy(skipProfileAction);

    expect(mocks.callOnboarding).toHaveBeenCalledTimes(1);
    expect(mocks.callOnboarding).toHaveBeenCalledWith("onboarding-step", {
      step: "preferences",
    });
    expect(to).toBe("/onboarding/preferences");
  });

  it("carries on when the cursor could not be written", async () => {
    // The cost of a lost cursor write is resuming one step early. Holding somebody on a
    // screen they just asked to skip would be the worse failure.
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect(await redirectedBy(skipProfileAction)).toBe("/onboarding/preferences");
  });

  it("still sends a lost session to sign in", async () => {
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unauthenticated" });
    expect(await redirectedBy(skipProfileAction)).toBe("/login");
  });
});
