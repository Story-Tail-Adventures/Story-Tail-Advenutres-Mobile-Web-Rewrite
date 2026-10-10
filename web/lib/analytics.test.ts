import { describe, it, expect } from "vitest";
import { redactAnalyticsEvent } from "./analytics";

const ORIGIN = "https://storytailadventures.vercel.app";
const view = (path: string) => ({ type: "pageview" as const, url: `${ORIGIN}${path}` });

describe("redactAnalyticsEvent", () => {
  it("passes a plain public page through unchanged", () => {
    expect(redactAnalyticsEvent(view("/how-it-works"))).toEqual(view("/how-it-works"));
  });

  it("keeps utm_* and drops every other query param and the hash", () => {
    const result = redactAnalyticsEvent(
      view("/explore/results?mode=hotels&destination=Lisbon&utm_source=ig&utm_campaign=fall#top"),
    );
    expect(result?.url).toBe(`${ORIGIN}/explore/results?utm_source=ig&utm_campaign=fall`);
  });

  it("leaves no bare ? when nothing survives", () => {
    expect(redactAnalyticsEvent(view("/trips?status=upcoming"))?.url).toBe(`${ORIGIN}/trips`);
  });

  it("drops the agent surface, including the client-name search", () => {
    expect(redactAnalyticsEvent(view("/agent"))).toBeNull();
    expect(redactAnalyticsEvent(view("/agent/clients?q=Smith"))).toBeNull();
    expect(redactAnalyticsEvent(view("/agent/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"))).toBeNull();
  });

  it("only treats /agent as a whole segment", () => {
    expect(redactAnalyticsEvent(view("/agentic"))).toEqual(view("/agentic"));
  });

  it("keeps id segments in the path", () => {
    const path = "/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(redactAnalyticsEvent(view(path))?.url).toBe(`${ORIGIN}${path}`);
  });

  it("redacts custom events the same way", () => {
    expect(
      redactAnalyticsEvent({ type: "event", url: `${ORIGIN}/join?email=a%40b.co` })?.url,
    ).toBe(`${ORIGIN}/join`);
  });

  it("drops a URL that will not parse", () => {
    expect(redactAnalyticsEvent({ type: "pageview", url: "not a url" })).toBeNull();
  });
});
