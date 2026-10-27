import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendLeadMessage, type LeadMessageInput } from "./leadMessage";

/**
 * The server's one call to `lead-message`. Pinned: the visitor's address goes only beside the
 * shared key (never alone, never without it), the key is never sent when unset, and each
 * answer maps to the sentence the form shows.
 */

const input: LeadMessageInput = {
  firstName: "Dana",
  lastName: "",
  email: "dana@example.com",
  phone: "",
  message: "Hi",
  page: "about",
  about: null,
  utm: {},
  website: "",
  startedAt: 1,
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function headersSent(): Record<string, string> {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

describe("sendLeadMessage", () => {
  it("sends the visitor's address with the key, when both exist", async () => {
    vi.stubEnv("STA_LEAD_FORM_KEY", "k-1");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendLeadMessage(input, "203.0.113.9")).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:54321/functions/v1/lead-message");
    expect(headersSent()["x-sta-form-key"]).toBe("k-1");
    expect(headersSent()["x-sta-client-ip"]).toBe("203.0.113.9");
  });

  it("sends neither without the key", async () => {
    vi.stubEnv("STA_LEAD_FORM_KEY", "");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await sendLeadMessage(input, "203.0.113.9");
    expect(headersSent()["x-sta-form-key"]).toBeUndefined();
    expect(headersSent()["x-sta-client-ip"]).toBeUndefined();
  });

  it("maps a 400 to its sentence, a 429 to throttled, anything else to unavailable", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Please tell Gyasi your first name." }), { status: 400 }),
    );
    expect(await sendLeadMessage(input, null)).toEqual({
      ok: false,
      kind: "invalid",
      detail: "Please tell Gyasi your first name.",
    });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect(await sendLeadMessage(input, null)).toEqual({ ok: false, kind: "throttled" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect(await sendLeadMessage(input, null)).toEqual({ ok: false, kind: "unavailable" });
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    expect(await sendLeadMessage(input, null)).toEqual({ ok: false, kind: "unavailable" });
  });
});

