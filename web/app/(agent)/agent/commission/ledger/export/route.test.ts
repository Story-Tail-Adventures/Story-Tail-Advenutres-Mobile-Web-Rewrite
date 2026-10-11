import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * §3.7.2's Export route.
 *
 * What it must get right, beyond "returns a CSV": the file is filtered EXACTLY as the screen
 * was (the same parser reads both URLs), a malformed filter never reaches the function, and
 * Excel reads accented names correctly (the byte-order mark). The audit row is the SQL
 * function's job and is tested there.
 */

const mocks = vi.hoisted(() => ({ callAgentFunction: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentFunction: mocks.callAgentFunction }));

import { GET } from "./route";

function request(qs: string) {
  return new NextRequest(`http://localhost:3000/agent/commission/ledger/export${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /agent/commission/ledger/export", () => {
  it("passes the ledger's filters through, parsed and cleaned", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { csv: "Trip\r\n" } });
    await GET(request("?status=lost&status=bogus&supplier=nope&from=2026-01-01&to=2026-02-31"));
    expect(mocks.callAgentFunction).toHaveBeenCalledWith("agent-commission", {
      op: "export",
      filters: {
        statuses: ["lost"],
        supplierId: null,
        tripId: null,
        travelFrom: "2026-01-01",
        travelTo: null,
      },
    });
  });

  it("answers with an attachment, a BOM for Excel, and no caching", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { csv: "Trip\r\nRoatán\r\n" } });
    const res = await GET(request(""));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="commission-ledger-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = new Uint8Array(await res.arrayBuffer());
    // EF BB BF: the UTF-8 byte-order mark.
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(body)).toContain("Roatán");
  });

  it("sends a signed-out caller to sign in, not a broken file", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "unauthenticated" });
    const res = await GET(request(""));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?next=");
  });

  it("says so in words when the function fails", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "unavailable" });
    const res = await GET(request(""));
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/didn't come through/);
  });
});
