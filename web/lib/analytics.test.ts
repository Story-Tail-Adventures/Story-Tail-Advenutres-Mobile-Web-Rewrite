import { describe, it, expect } from "vitest";
import { redactAnalyticsUrl } from "./analytics";

/**
 * The privacy boundary for analytics, and the whole of it: the only thing any provider ever
 * receives from us is a page's URL, so what this function strips is what they never see.
 *
 * These cases used to be written against `redactAnalyticsEvent`, the Vercel `beforeSend`
 * wrapper. Vercel Web Analytics is gone with the move off that host, and Google Analytics
 * through Firebase takes a bare URL, so the rules are pinned directly on the function that
 * now carries them. The cases are unchanged: this is the same contract
 * web/content/public/legal/privacy.ts describes to travelers.
 */
const ORIGIN = "https://storytailadventures.vercel.app";
const url = (path: string) => `${ORIGIN}${path}`;

describe("redactAnalyticsUrl", () => {
  it("passes a plain public page through unchanged", () => {
    expect(redactAnalyticsUrl(url("/how-it-works"))).toBe(url("/how-it-works"));
  });

  it("keeps utm_* and drops every other query param and the hash", () => {
    expect(
      redactAnalyticsUrl(
        url("/explore/results?mode=hotels&destination=Lisbon&utm_source=ig&utm_campaign=fall#top"),
      ),
    ).toBe(url("/explore/results?utm_source=ig&utm_campaign=fall"));
  });

  it("leaves no bare ? when nothing survives", () => {
    expect(redactAnalyticsUrl(url("/trips?status=upcoming"))).toBe(url("/trips"));
  });

  it("drops the agent surface, including the client-name search", () => {
    expect(redactAnalyticsUrl(url("/agent"))).toBeNull();
    expect(redactAnalyticsUrl(url("/agent/clients?q=Smith"))).toBeNull();
    expect(redactAnalyticsUrl(url("/agent/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"))).toBeNull();
  });

  it("only treats /agent as a whole segment", () => {
    expect(redactAnalyticsUrl(url("/agentic"))).toBe(url("/agentic"));
  });

  it("replaces record ids in the path with [id]", () => {
    expect(redactAnalyticsUrl(url("/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"))).toBe(
      url("/trips/[id]"),
    );
    expect(redactAnalyticsUrl(url("/trips/0199A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5B/update?x=1"))).toBe(
      url("/trips/[id]/update"),
    );
  });

  it("leaves slugs that are not ids alone", () => {
    expect(redactAnalyticsUrl(url("/legal/cookies"))).toBe(url("/legal/cookies"));
  });

  // An address typed into the sign-up gate must not travel on the URL.
  it("strips an email out of the query", () => {
    expect(redactAnalyticsUrl(url("/join?email=a%40b.co"))).toBe(url("/join"));
  });

  // An implicit-flow auth redirect would carry tokens in the hash.
  it("strips the hash even when the query survives", () => {
    expect(redactAnalyticsUrl(url("/dashboard?utm_source=ig#access_token=secret"))).toBe(
      url("/dashboard?utm_source=ig"),
    );
  });

  it("drops a URL that will not parse", () => {
    expect(redactAnalyticsUrl("not a url")).toBeNull();
  });
});
