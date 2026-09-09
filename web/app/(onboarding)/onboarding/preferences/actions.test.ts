import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREFERENCES_MESSAGES } from "@/lib/validation/preferences";
import { PREFERENCES_TEXT, initialPreferencesState } from "./state";

/**
 * Screen 2.1.11's actions.
 *
 * The parts worth pinning are the ones a chip group makes easy to get wrong: that an
 * untouched group posts nothing and must still be sent as an empty array (or the Edge
 * Function leaves the old answers in place), that the repeater's two parallel `getAll()`
 * lists pair up by index, and that "Skip for now" moves only the cursor — the preferences
 * function would spend an audit row on a save that changed nothing.
 */

/** Stand-in for the NEXT_REDIRECT throw, so a test fails if the action carries on after it. */
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

import { savePreferencesAction, skipPreferencesAction } from "./actions";

/** A chip group posts one entry per ticked box; the repeater posts two parallel lists. */
function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

const FILLED: [string, string][] = [
  ["destinations", "Caribbean"],
  ["destinations", "Bahamas"],
  ["destinationOther", "Kenya"],
  ["travelStyles", "resort"],
  ["travelStyles", "romantic"],
  ["dietary", "pescatarian"],
  ["dietaryNotes", "Severe tree nut allergy"],
  ["accessibility", "quiet_room"],
  ["accessibilityNotes", "An outlet by the bed for a CPAP"],
  ["loyaltyProgram", "Marriott Bonvoy"],
  ["loyaltyNumber", "4ZE82Q"],
  ["loyaltyProgram", ""],
  ["loyaltyNumber", ""],
  ["budgetBand", "premium"],
  ["favoritePastTrips", "Negril, 2019."],
];

function bodySent(): Record<string, unknown> {
  // The mock's arguments are `any[]`; this narrows to the shape `callOnboarding` declares.
  return mocks.callOnboarding.mock.calls[0][1] as Record<string, unknown>;
}

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

describe("savePreferencesAction", () => {
  it("sends the whole screen and advances the wizard", async () => {
    const to = await redirectedBy(() =>
      savePreferencesAction(initialPreferencesState, form(FILLED)),
    );

    expect(mocks.callOnboarding.mock.calls[0][0]).toBe("onboarding-preferences");
    expect(bodySent()).toEqual({
      destinations: ["Caribbean", "Bahamas", "Kenya"],
      travelStyles: ["resort", "romantic"],
      dietary: ["pescatarian"],
      dietaryNotes: "Severe tree nut allergy",
      accessibility: ["quiet_room"],
      accessibilityNotes: "An outlet by the bed for a CPAP",
      // Paired by index, blank row dropped, the two-word program kept whole.
      loyalty: [{ program: "Marriott Bonvoy", number: "4ZE82Q" }],
      budgetBand: "premium",
      favoritePastTrips: "Negril, 2019.",
      advance: true,
    });
    expect(to).toBe("/onboarding/companions");
  });

  it("sends an untouched group as an empty array, not as a missing key", async () => {
    // A chip group nobody ticked posts nothing at all. If that arrived as an absent key the
    // function would read it as "leave it alone" and somebody clearing every chip would
    // find their old answers still there.
    await redirectedBy(() =>
      savePreferencesAction(initialPreferencesState, form([["budgetBand", ""]])),
    );

    expect(bodySent()).toEqual({
      destinations: [],
      travelStyles: [],
      dietary: [],
      dietaryNotes: null,
      accessibility: [],
      accessibilityNotes: null,
      loyalty: [],
      budgetBand: null,
      favoritePastTrips: null,
      advance: true,
    });
  });

  it("writes nothing when a group contradicts itself", async () => {
    const state = await savePreferencesAction(
      initialPreferencesState,
      form([
        ["dietary", "none"],
        ["dietary", "halal"],
      ]),
    );

    expect(mocks.callOnboarding).not.toHaveBeenCalled();
    expect(state.fieldErrors?.dietary).toEqual([PREFERENCES_MESSAGES.dietaryNoneAlone]);
  });

  it("hands back what was typed so a rejected submit does not empty the screen", async () => {
    const state = await savePreferencesAction(
      initialPreferencesState,
      form([...FILLED, ["dietary", "none"]]),
    );

    expect(state.values?.destinationOther).toBe("Kenya");
    expect(state.values?.loyalty).toEqual([
      { program: "Marriott Bonvoy", number: "4ZE82Q" },
      { program: "", number: "" },
    ]);
  });

  it("never sends a dietary note as a member of the slug array", async () => {
    // Their own columns since 20260904124903: the array is a closed vocabulary that
    // agent-side filtering groups on.
    await redirectedBy(() =>
      savePreferencesAction(initialPreferencesState, form(FILLED)),
    );
    expect(bodySent().dietary).toEqual(["pescatarian"]);
  });

  it("sends people to sign in again when the session has gone", async () => {
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unauthenticated" });
    expect(
      await redirectedBy(() => savePreferencesAction(initialPreferencesState, form(FILLED))),
    ).toBe("/login");
  });

  it("falls back to the generic failure when there is nothing to explain", async () => {
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unavailable" });
    const state = await savePreferencesAction(initialPreferencesState, form(FILLED));
    expect(state.formError).toBe(PREFERENCES_TEXT.formError);
    expect(state.values?.budgetBand).toBe("premium");
  });
});

describe("skipPreferencesAction", () => {
  it("moves the cursor on without touching the row or an audit trail", async () => {
    const to = await redirectedBy(skipPreferencesAction);
    expect(mocks.callOnboarding).toHaveBeenCalledWith("onboarding-step", {
      step: "companions",
    });
    expect(to).toBe("/onboarding/companions");
  });

  it("carries on when the cursor could not be written", async () => {
    mocks.callOnboarding.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect(await redirectedBy(skipPreferencesAction)).toBe("/onboarding/companions");
  });
});
