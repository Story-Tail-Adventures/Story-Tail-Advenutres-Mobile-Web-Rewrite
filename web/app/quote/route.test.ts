import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function get(query: string) {
  return GET(new NextRequest(`http://localhost:3000/quote?${query}`));
}

describe("GET /quote", () => {
  it("redirects a topic bar's submission to the gate, with the quote request as next", () => {
    const response = get("topic=honeymoons&dest=Bora+Bora&travelers=2&vibe=Quiet");
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("http://localhost:3000");
    expect(location.pathname).toBe("/join");
    const next = new URL(location.searchParams.get("next")!, location.origin);
    expect(next.pathname).toBe("/trips/new");
    expect(next.searchParams.get("place")).toBe("Bora Bora");
    expect(next.searchParams.get("note")).toBe("Hoping for: Quiet");
  });

  it("sends anything without a quote topic to /explore", () => {
    const response = get("topic=cruises");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/explore");
  });
});
