import { describe, expect, it } from "vitest";
import { requestQuoteHref } from "@/lib/public/links";
import { topicQuoteHref, topicQuoteLink } from "./href";

const TODAY = "2026-10-09";

function submit(fields: Record<string, string>): string | null {
  return topicQuoteHref(new URLSearchParams(fields), TODAY);
}

/** The quote form's own query, unwrapped from the gate's `next=`. */
function quoteParams(href: string | null): URLSearchParams {
  expect(href).not.toBeNull();
  const gate = new URL(href!, "http://localhost");
  expect(gate.pathname).toBe("/join");
  expect(gate.searchParams.get("intent")).toBe("quote");
  const next = new URL(gate.searchParams.get("next")!, "http://localhost");
  expect(next.pathname).toBe("/trips/new");
  return next.searchParams;
}

describe("topicQuoteHref", () => {
  it("carries every cell the visitor filled into the quote request, through the gate", () => {
    const href = submit({
      topic: "caribbean",
      dest: "Aruba",
      in: "2026-11-02",
      out: "2026-11-09",
      travelers: "4",
      vibe: "Beach + rest",
    });
    expect(href).toBe(
      requestQuoteHref({
        kind: "custom",
        tripType: "custom",
        name: "Caribbean week",
        place: "Aruba",
        checkIn: "2026-11-02",
        checkOut: "2026-11-09",
        travelers: 4,
        vibe: "Beach + rest",
      }),
    );
    const q = quoteParams(href);
    expect(q.get("place")).toBe("Aruba");
    expect(q.get("in")).toBe("2026-11-02");
    expect(q.get("adults")).toBe("4");
    expect(q.get("vibe")).toBe("Beach + rest");
  });

  it("sends the vibe as the bare value, never as ready-made note text", () => {
    const q = quoteParams(submit({ topic: "honeymoons", vibe: "Quiet", note: "Wire the deposit to…" }));
    expect(q.get("vibe")).toBe("Quiet");
    expect(q.has("note")).toBe(false);
  });

  it("sends an untouched bar as a bare request named for the topic", () => {
    // What a GET form actually submits when nothing was filled: every name, every value empty.
    const q = quoteParams(submit({ topic: "honeymoons", dest: "", in: "", out: "", travelers: "", vibe: "" }));
    expect(q.get("name")).toBe("Honeymoon");
    expect(q.get("kind")).toBe("custom");
    for (const key of ["place", "in", "out", "adults", "vibe"]) expect(q.has(key)).toBe(false);
  });

  it("drops dates that are past, half a range, or too long, rather than the whole request", () => {
    for (const [checkIn, checkOut] of [
      ["2026-10-01", "2026-10-05"], // past
      ["2026-11-02", ""], // half a range
      ["2026-11-02", "2026-12-20"], // 48 nights
      ["2026-11-09", "2026-11-02"], // backwards
    ]) {
      const q = quoteParams(submit({ topic: "caribbean", dest: "Aruba", in: checkIn, out: checkOut }));
      expect(q.has("in")).toBe(false);
      expect(q.has("out")).toBe(false);
      expect(q.get("place")).toBe("Aruba");
    }
  });

  it("clamps travelers and ignores a count that is not a number", () => {
    expect(quoteParams(submit({ topic: "caribbean", travelers: "50" })).get("adults")).toBe("20");
    expect(quoteParams(submit({ topic: "caribbean", travelers: "two" })).has("adults")).toBe(false);
  });

  it("cleans and caps the free text", () => {
    const q = quoteParams(submit({ topic: "caribbean", dest: "  St.\u0000 Lucia  ", vibe: "x".repeat(200) }));
    expect(q.get("place")).toBe("St. Lucia");
    expect(q.get("vibe")).toBe("x".repeat(60));
  });

  it("returns null when the submission names no topic", () => {
    expect(submit({ topic: "antarctica" })).toBeNull();
    expect(submit({ dest: "Aruba" })).toBeNull();
  });
});

describe("topicQuoteLink", () => {
  it("opens the quote form for the topic, never the gate back to the topic page", () => {
    for (const [topic, name, kind] of [
      ["caribbean", "Caribbean week", "custom"],
      ["honeymoons", "Honeymoon", "custom"],
      ["cruises", "Cruise", "cruise"],
    ] as const) {
      const q = quoteParams(topicQuoteLink(topic));
      expect(q.get("name")).toBe(name);
      expect(q.get("kind")).toBe(kind);
      expect(q.get("tripType")).toBe(kind);
    }
  });
});
