import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function get(query: string, origin = "http://localhost:3000") {
  return GET(new NextRequest(`${origin}/quote?${query}`));
}

describe("GET /quote", () => {
  it("redirects a topic bar's submission to the gate, with the quote request as next", () => {
    const response = get("topic=honeymoons&dest=Bora+Bora&travelers=2&vibe=Quiet");
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!, "http://example.test");
    expect(location.pathname).toBe("/join");
    const next = new URL(location.searchParams.get("next")!, location.origin);
    expect(next.pathname).toBe("/trips/new");
    expect(next.searchParams.get("place")).toBe("Bora Bora");
    expect(next.searchParams.get("vibe")).toBe("Quiet");
  });

  it("answers with a relative Location, so the request's host never leaks into it", () => {
    const location = get("topic=caribbean", "http://internal-host.vercel.internal").headers.get("location")!;
    expect(location.startsWith("/join?")).toBe(true);
    expect(location).not.toContain("internal-host");
  });

  it("sends a submission with no topic to /explore", () => {
    const response = get("topic=antarctica");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/explore");
  });
});
