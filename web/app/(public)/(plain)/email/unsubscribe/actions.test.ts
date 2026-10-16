import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/email/unsubscribe", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/unsubscribe")>()),
  setMessagesEmail: mocks.set,
}));

import { changeMessagesEmail } from "./actions";

const TOKEN = "abcdefghijklmnopqrstuvwxyz";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => vi.clearAllMocks());

describe("changeMessagesEmail (§3.10 Stage 4)", () => {
  it("a malformed token goes nowhere", async () => {
    await expect(changeMessagesEmail(form({ t: "nope", on: "false" }))).rejects.toThrow("REDIRECT /email/unsubscribe");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("passes the switch through and comes back to read it fresh", async () => {
    mocks.set.mockResolvedValue("off");
    await expect(changeMessagesEmail(form({ t: TOKEN, on: "false" }))).rejects.toThrow(`REDIRECT /email/unsubscribe?t=${TOKEN}&done=off`);
    expect(mocks.set).toHaveBeenCalledWith(TOKEN, false);
    mocks.set.mockResolvedValue("on");
    await expect(changeMessagesEmail(form({ t: TOKEN, on: "true" }))).rejects.toThrow("&done=on");
    expect(mocks.set).toHaveBeenLastCalledWith(TOKEN, true);
  });

  it("a failed update says so", async () => {
    mocks.set.mockResolvedValue("unavailable");
    await expect(changeMessagesEmail(form({ t: TOKEN, on: "false" }))).rejects.toThrow("&done=error");
  });
});
