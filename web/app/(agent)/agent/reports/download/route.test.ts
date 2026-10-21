import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * §3.11's per-report Export route. The audit row is the SQL function's job and is tested
 * there (supabase/tests/rls_agent_reports.sql). Here: the right report is asked for, an
 * unknown one never reaches the function, and the file is a file Excel reads.
 */

const mocks = vi.hoisted(() => ({ callAgentFunction: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentFunction: mocks.callAgentFunction }));

import { GET, HEAD } from "./route";

function request(qs: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000/agent/reports/download${qs}`, { headers });
}

const OK = { ok: true, data: { csv: "Destination,Trips,Value\r\nRoatán,1,10.00\r\n", fileName: "destinations-2026-01-01-to-2026-10-21.csv" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /agent/reports/download", () => {
  it("asks for the report and period on screen, with a basis only for revenue", async () => {
    mocks.callAgentFunction.mockResolvedValue(OK);
    await GET(request("?report=revenue&period=12mo&basis=received"));
    expect(mocks.callAgentFunction).toHaveBeenLastCalledWith("agent-report", {
      op: "export",
      report: "revenue",
      period: "12mo",
      basis: "received",
    });

    await GET(request("?report=suppliers&period=bogus&basis=received"));
    expect(mocks.callAgentFunction).toHaveBeenLastCalledWith("agent-report", {
      op: "export",
      report: "suppliers",
      period: "ytd",
    });
  });

  it("refuses an unknown report before anything (and so any audit row) happens", async () => {
    const res = await GET(request("?report=payroll"));
    expect(res.status).toBe(404);
    expect(mocks.callAgentFunction).not.toHaveBeenCalled();
  });

  it("answers with the function's file name, a BOM for Excel, and no caching", async () => {
    mocks.callAgentFunction.mockResolvedValue(OK);
    const res = await GET(request("?report=destinations"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="destinations-2026-01-01-to-2026-10-21.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = new Uint8Array(await res.arrayBuffer());
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(body)).toContain("Roatán");
  });

  it("does not put an unexpected file name into the header", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { csv: "x\r\n", fileName: 'a".csv' } });
    expect((await GET(request("?report=suppliers"))).status).toBe(503);
  });

  it("sends a signed-out caller to sign in, back to the report", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "unauthenticated" });
    const res = await GET(request("?report=suppliers"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?next=%2Fagent%2Freports%2Fsuppliers");
  });

  it("refuses a request from another site, or a sibling subdomain", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const res = await GET(request("?report=suppliers", { "sec-fetch-site": site }));
      expect(res.status, site).toBe(403);
    }
    expect(mocks.callAgentFunction).not.toHaveBeenCalled();
  });

  it("runs for this origin's own page and for a typed or bookmarked link", async () => {
    mocks.callAgentFunction.mockResolvedValue(OK);
    for (const site of ["same-origin", "none"]) {
      expect((await GET(request("?report=destinations", { "sec-fetch-site": site }))).status, site).toBe(200);
    }
  });

  it("treats a 200 with no CSV as a failure, and says so in words", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { outcome: "exported" } });
    const res = await GET(request("?report=suppliers"));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("didn't come through");
  });

  it("does not answer HEAD by running an export", () => {
    expect(HEAD().status).toBe(405);
  });
});
