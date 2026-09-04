import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_MESSAGES } from "@/lib/validation/companion";
import { COMPANIONS_TEXT, initialCompanionsState } from "./state";

/**
 * Screen 2.1.12's actions.
 *
 * This is the first §2.1 screen that writes a LIST, so the shape is different from the two
 * before it: each traveler is saved as they are added, and "Save & continue" only moves the
 * cursor. The things worth pinning are that an edit carries the row's id (so the function
 * can re-check ownership rather than trust it), that a passport number can never leave
 * here, and that a rejected save hands back what was typed along with which row it belonged
 * to — the form has to reopen where it was.
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

vi.mock("@/lib/onboarding/api", () => ({
  callOnboarding: mocks.callOnboarding,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  continueCompanionsAction,
  removeCompanionAction,
  saveCompanionAction,
  skipCompanionsAction,
} from "./actions";

const ID = "01a06c8c-56bb-7921-b252-d00c4b111ffb";

function form(over: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    firstName: "Sam",
    lastName: "Hayes",
    relationship: "Spouse",
    dateOfBirth: "1990-03-11",
    passportExpiry: "2031-02-28",
    passportCountry: "US",
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...over }))
    fd.set(key, value);
  return fd;
}

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

describe("saveCompanionAction", () => {
  it("adds a traveler without an id", async () => {
    const state = await saveCompanionAction(initialCompanionsState, form());

    expect(mocks.callOnboarding.mock.calls[0][0]).toBe("onboarding-companions");
    expect(bodySent()).toEqual({
      action: "add",
      firstName: "Sam",
      lastName: "Hayes",
      relationship: "Spouse",
      dateOfBirth: "1990-03-11",
      passportExpiry: "2031-02-28",
      passportCountry: "US",
    });
    // The token is what closes the form; without it a landed save leaves it open.
    expect(state.savedToken).toEqual(expect.any(Number));
  });

  it("edits with the row's id, which the function re-checks against the caller", async () => {
    await saveCompanionAction(initialCompanionsState, form({ id: ID }));
    expect(bodySent().action).toBe("edit");
    expect(bodySent().id).toBe(ID);
  });

  it("never sends a passport number, even from a crafted post", async () => {
    await saveCompanionAction(
      initialCompanionsState,
      form({ passportNumber: "B987654321" }),
    );
    expect(JSON.stringify(bodySent())).not.toContain("B987654321");
  });

  it("writes nothing when a name is missing, and says which one", async () => {
    const state = await saveCompanionAction(
      initialCompanionsState,
      form({ lastName: " " }),
    );

    expect(mocks.callOnboarding).not.toHaveBeenCalled();
    expect(state.fieldErrors?.lastName).toEqual([
      COMPANION_MESSAGES.lastNameRequired,
    ]);
    expect(state.savedToken).toBeUndefined();
  });

  it("hands back what was typed AND which row it was, so the form reopens where it was", async () => {
    const state = await saveCompanionAction(
      initialCompanionsState,
      form({ id: ID, lastName: "" }),
    );
    expect(state.editingId).toBe(ID);
    expect(state.values?.firstName).toBe("Sam");
    expect(state.values?.passportExpiry).toBe("2031-02-28");
  });

  it("sends people to sign in again when the session has gone", async () => {
    mocks.callOnboarding.mockResolvedValue({
      ok: false,
      kind: "unauthenticated",
    });
    expect(
      await redirectedBy(() =>
        saveCompanionAction(initialCompanionsState, form()),
      ),
    ).toBe("/login");
  });
});

describe("removeCompanionAction", () => {
  it("sends only the id", async () => {
    const fd = new FormData();
    fd.set("id", ID);
    await removeCompanionAction(initialCompanionsState, fd);
    expect(bodySent()).toEqual({ action: "remove", id: ID });
  });

  it("does not call anything when there is no id to remove", async () => {
    const state = await removeCompanionAction(
      initialCompanionsState,
      new FormData(),
    );
    expect(mocks.callOnboarding).not.toHaveBeenCalled();
    expect(state.formError).toBe(COMPANIONS_TEXT.errorRemove);
  });
});

describe("continueCompanionsAction", () => {
  it("moves the cursor and says so explicitly rather than posting an empty body", async () => {
    const to = await redirectedBy(continueCompanionsAction);
    expect(mocks.callOnboarding).toHaveBeenCalledWith("onboarding-companions", {
      action: "none",
      advance: true,
    });
    expect(to).toBe("/onboarding/connect");
  });
});

describe("skipCompanionsAction", () => {
  it("moves the cursor through the step endpoint, touching no companion", async () => {
    const to = await redirectedBy(skipCompanionsAction);
    expect(mocks.callOnboarding).toHaveBeenCalledWith("onboarding-step", {
      step: "connect",
    });
    expect(to).toBe("/onboarding/connect");
  });
});
