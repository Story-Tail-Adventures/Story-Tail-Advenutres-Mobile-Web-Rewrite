import { describe, expect, it } from "vitest";
import { HOTEL_KEYS, parseSearchResponse } from "./hotels";

/**
 * The boundary where a provider payload becomes something a page may render.
 *
 * The assertions that matter here are not about happy-path shape — they are about what
 * CANNOT get through. A booking site's name on this page breaches §1.3.5, and an unvetted
 * image host is a URL the visitor's browser fetches on our say-so, because the custom
 * next/image loader means `remotePatterns` never runs.
 */

/** A response as the Edge Function sends it, plus every field it is supposed to have dropped. */
function poisoned() {
  return {
    version: 1,
    currency: "USD",
    totalAvailable: 148,
    hasMore: false,
    source: "live",
    degraded: null,
    asOf: "2026-09-09T12:00:00.000Z",
    staleAsOf: null,
    query: {
      destination: "aruba",
      checkIn: "2026-10-19",
      checkOut: "2026-10-26",
      adults: 2,
      nights: 7,
    },
    results: [
      {
        id: "abc",
        propertyToken: "abc",
        name: "Bucuti & Tara Beach Resort",
        description: "Adults-only beachfront resort.",
        propertyType: "Resort",
        hotelClass: 5,
        overallRating: 4.8,
        reviewCount: 2140,
        location: { latitude: 12.5567, longitude: -70.0428 },
        checkInTime: "3:00 PM",
        checkOutTime: "11:00 AM",
        amenities: ["Beach access", "Spa"],
        images: [
          { url: "https://lh3.googleusercontent.com/proxy/abc=s287" },
          { url: "https://cdn.some-ota.example/photo.jpg" },
        ],
        ecoCertified: true,
        rate: { amountCents: "41200", currency: "USD", basis: "night", beforeTaxesFees: true },
        // Nothing below is in the schema. If any of it reaches a card, we have a contract
        // problem rather than a layout bug.
        source: "Booking.com",
        logo: "https://www.gstatic.com/travel-hotels/branding/booking.png",
        link: "https://www.booking.com/hotel/aw/bucuti.html",
        prices: [{ source: "Expedia", link: "https://www.expedia.com/h1" }],
        deal_description: "Cheaper than usual on Hotels.com",
      },
    ],
  };
}

describe("hotel search boundary", () => {
  it("strips every field that is not on the allow-list", () => {
    const result = parseSearchResponse(poisoned());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Keys, not values: a passthrough object would carry the hostile data inside a key we
    // do allow, and this is what catches that.
    expect(Object.keys(result.hotels[0]).sort()).toEqual([...HOTEL_KEYS].sort());
  });

  it("lets no booking site through, at any depth", () => {
    const result = parseSearchResponse(poisoned());
    const serialised = JSON.stringify(result);
    for (const hostile of ["Booking", "Expedia", "Hotels.com", "booking.com", "expedia.com"]) {
      expect(serialised).not.toContain(hostile);
    }
  });

  it("drops an image host we have not vetted", () => {
    const result = parseSearchResponse(poisoned());
    if (result.status !== "ok") throw new Error("expected ok");
    // The custom next/image loader passes any http src straight through, so remotePatterns
    // never runs and this list is the only thing standing between a provider and a request
    // from the visitor's browser.
    expect(result.hotels[0].photos).toEqual([
      "https://lh3.googleusercontent.com/proxy/abc=s287",
    ]);
  });

  it("converts the cents string to a number exactly once", () => {
    const result = parseSearchResponse(poisoned());
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.hotels[0].nightlyCents).toBe(41200);
    expect(result.hotels[0].currency).toBe("USD");
  });

  it("reports an exhausted budget distinctly from an outage", () => {
    const base = { ...poisoned(), results: [] };
    expect(parseSearchResponse({ ...base, degraded: "budget_exhausted" }).status)
      .toBe("budget_exhausted");
    expect(parseSearchResponse({ ...base, degraded: "provider_unavailable" }).status)
      .toBe("unavailable");
    // Degraded but with results is a stale serve, which is still a usable page.
    expect(parseSearchResponse({ ...poisoned(), degraded: "budget_exhausted" }).status).toBe("ok");
  });

  it("treats a genuinely empty destination as empty, not as a failure", () => {
    expect(parseSearchResponse({ ...poisoned(), results: [], totalAvailable: 0 }).status)
      .toBe("empty");
  });

  it("never throws on a malformed payload — it degrades", () => {
    for (const bad of [null, undefined, {}, { results: "nope" }, [], "text", 42]) {
      expect(parseSearchResponse(bad).status).toBe("unavailable");
    }
  });

  it("refuses a currency the app cannot format", () => {
    const wrong = poisoned();
    (wrong as { currency: string }).currency = "EUR";
    // Money is USD-only in this codebase (content/public/types.ts). A response in anything
    // else is a bug to surface, not a value to render.
    expect(parseSearchResponse(wrong).status).toBe("unavailable");
  });
});
