import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIPS } from "@/content/public/trips";
import { MESSAGE_TEXT, initialMessageState } from "./state";

/**
 * The send, with the function call and Next's headers stubbed. Pinned: the "about" context is
 * rebuilt from the catalog (never what the page posted), the visitor's address is read from
 * the platform's header, every accepted send is the same thank-you, and a refusal keeps what
 * the visitor typed.
 */

const mocks = vi.hoisted(() => ({
  sendLeadMessage: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/lib/public/leadMessage", async () => {
  const real = await vi.importActual<typeof import("@/lib/public/leadMessage")>("@/lib/public/leadMessage");
  return { ...real, sendLeadMessage: mocks.sendLeadMessage };
});
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { sendMessageAction } from "./actions";

function form(over: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    from: "detail",
    trip: TRIPS[0].slug,
    topic: "",
    firstName: "Dana",
    lastName: "",
    email: "dana@example.com",
    phone: "",
    message: "Dreaming of Aruba.",
    website: "",
    startedAt: "1000",
    utm_source: "instagram",
    utm_medium: "",
    utm_campaign: "",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
}

beforeEach(() => {
  mocks.sendLeadMessage.mockReset();
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
});

describe("sendMessageAction", () => {
  it("sends the catalog's name for the trip and the visitor's address", async () => {
    mocks.sendLeadMessage.mockResolvedValue({ ok: true });
    expect(await sendMessageAction(initialMessageState, form())).toEqual({ outcome: "sent" });
    const [input, address] = mocks.sendLeadMessage.mock.calls[0];
    expect(input.about).toEqual({ kind: "trip", slug: TRIPS[0].slug, label: TRIPS[0].name });
    expect(input.page).toBe("detail");
    expect(input.utm).toEqual({ source: "instagram", medium: undefined, campaign: undefined });
    expect(input.startedAt).toBe(1000);
    expect(address).toBe("203.0.113.9");
  });

  it("drops a trip slug that is not in the catalog, and an unknown page", async () => {
    mocks.sendLeadMessage.mockResolvedValue({ ok: true });
    await sendMessageAction(initialMessageState, form({ trip: "not-a-trip", from: "evil" }));
    const [input] = mocks.sendLeadMessage.mock.calls[0];
    expect(input.about).toBeNull();
    expect(input.page).toBeNull();
  });

  it("shows the function's own sentence on a 400 and keeps what was typed", async () => {
    mocks.sendLeadMessage.mockResolvedValue({ ok: false, kind: "invalid", detail: "Please check your email address." });
    const state = await sendMessageAction(initialMessageState, form({ email: "nope" }));
    expect(state.formError).toBe("Please check your email address.");
    expect(state.email).toBe("nope");
    expect(state.message).toBe("Dreaming of Aruba.");
  });

  it("says try later when throttled, and try again when unavailable", async () => {
    mocks.sendLeadMessage.mockResolvedValue({ ok: false, kind: "throttled" });
    expect((await sendMessageAction(initialMessageState, form())).formError).toBe(MESSAGE_TEXT.throttled);
    mocks.sendLeadMessage.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect((await sendMessageAction(initialMessageState, form())).formError).toBe(MESSAGE_TEXT.unavailable);
  });
});
