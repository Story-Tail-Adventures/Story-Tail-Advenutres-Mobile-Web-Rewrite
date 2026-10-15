// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ markThreadReadAction: vi.fn() }));
vi.mock("@/app/(agent)/agent/messages/actions", () => ({ markThreadReadAction: mocks.markThreadReadAction }));

import { POST } from "./route";

const CONV = "0195a2c0-1a00-7000-8000-0000000000b0";
const SEEN = "2026-10-15T14:02:11.123456+00:00";
const ORIGIN = "https://app.story-tail.test";

function post(body: unknown, { origin = ORIGIN, id = CONV }: { origin?: string | null; id?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  const req = new NextRequest(`${ORIGIN}/api/agent/messages/${id}/read`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ conversationId: id }) });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/agent/messages/[id]/read (a notification's Mark read)", () => {
  it("reads the thread up to the notified message, passing the timestamp through as text", async () => {
    mocks.markThreadReadAction.mockResolvedValue({ changed: true });
    const res = await post({ seenUpTo: SEEN });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ changed: true });
    expect(mocks.markThreadReadAction).toHaveBeenCalledWith(CONV, SEEN);
  });

  it("refuses another site, or no Origin at all", async () => {
    expect((await post({ seenUpTo: SEEN }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ seenUpTo: SEEN }, { origin: null })).status).toBe(403);
    expect(mocks.markThreadReadAction).not.toHaveBeenCalled();
  });

  it("refuses a malformed thread id, timestamp or body", async () => {
    expect((await post({ seenUpTo: SEEN }, { id: "not-a-uuid" })).status).toBe(400);
    expect((await post({ seenUpTo: "yesterday" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(mocks.markThreadReadAction).not.toHaveBeenCalled();
  });
});
