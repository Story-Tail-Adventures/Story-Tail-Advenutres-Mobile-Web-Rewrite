/**
 * @vitest-environment node
 *
 * Tests for the provider→published mapping.
 *
 * Two classes of failure here, and they cost differently. A malformed payload that throws
 * takes down a public page for everyone. A booking-site name that survives the mapper is a
 * breach of the host agency agreement (§1.3.5) that nobody notices until a compliance
 * review — so those assertions are made against the SERIALISED output, not field by field:
 * a field-level check passes happily while the value rides along inside a passthrough
 * object.
 *
 * Ported verbatim in meaning from `supabase/functions/_shared/hotels/map_test.ts`. THE
 * FILENAME IS PART OF THE PORT: `web/vitest.config.ts` collects only files ending
 * `.test.ts`/`.test.tsx` (or `.spec.`), so the upstream `map_test.ts` name would have been
 * picked up by nothing at all — and the §1.3.5 compliance assertions below would have
 * silently stopped running while the suite reported green.
 */
import { describe, expect, it } from "vitest";
import { mapSearchResponse, PAYLOAD_VERSION, rateSpread } from "./map";
import { EMPTY_PAGE, SEARCH_PAGE, SHAPELESS_PAGE } from "./__fixtures__/provider";
import { assert } from "./__fixtures__/assert";

const USD = "USD";

describe("mapSearchResponse", () => {
  it("no booking-site identity survives the mapper", () => {
    const mapped = mapSearchResponse(SEARCH_PAGE, USD);
    const serialised = JSON.stringify(mapped);

    // The fixture definitely contains all of these — assert that first, or this test could
    // pass against a payload that never had them.
    const source = JSON.stringify(SEARCH_PAGE);
    for (const hostile of ["Booking.com", "Hotels.com", "Expedia", "booking.com/hotel"]) {
      expect(source).toContain(hostile);
    }

    for (const hostile of ["Booking", "Hotels.com", "Expedia", "booking.com", "hotels.com"]) {
      expect(serialised.includes(hostile), `"${hostile}" reached the published payload`)
        .toEqual(false);
    }
  });

  it("our vendor's URLs and Google's booking module do not survive either", () => {
    const serialised = JSON.stringify(mapSearchResponse(SEARCH_PAGE, USD));
    for (const hostile of [
      "serpapi.com",
      "google.com/travel",
      "next_page_token",
      "serpapi_property_details_link",
      "deal_description",
    ]) {
      expect(serialised.includes(hostile), `"${hostile}" reached the payload`).toEqual(false);
    }
  });

  it("a sponsored property is dropped", () => {
    const mapped = mapSearchResponse(SEARCH_PAGE, USD);
    expect(mapped.results.some((r) => r.name === "Sponsored Beach Club")).toEqual(false);
    expect(JSON.stringify(mapped).includes("SPONSORED")).toEqual(false);
  });

  it("a property with no extracted rate is kept, with a null rate", () => {
    // Dropping it would silently shrink the page, and "$1,148" is a display string we refuse
    // to parse — a wrong price on a public page is a compliance problem, not a layout one.
    const mapped = mapSearchResponse(SEARCH_PAGE, USD);
    const boardwalk = mapped.results.find((r) => r.name === "Boardwalk Boutique Hotel");
    assert(boardwalk, "expected the no-price property to survive");
    expect(boardwalk.rate).toEqual(null);
  });

  it("rates convert to integer cents without a rounding slip", () => {
    const mapped = mapSearchResponse(SEARCH_PAGE, USD);
    const bucuti = mapped.results.find((r) => r.name.startsWith("Bucuti"));
    expect(bucuti?.rate?.amountCents).toEqual("41200");
    expect(bucuti?.rate?.currency).toEqual("USD");
    expect(bucuti?.rate?.basis).toEqual("night");

    // 318.5 → 31850, not 31849. Float × 100 needs the round.
    const renaissance = mapped.results.find((r) => r.name.startsWith("Renaissance"));
    expect(renaissance?.rate?.amountCents).toEqual("31850");
  });

  it("only allow-listed image hosts survive", () => {
    const mapped = mapSearchResponse(SEARCH_PAGE, USD);
    const bucuti = mapped.results.find((r) => r.name.startsWith("Bucuti"));
    // Upstream read `bucuti!.images[0].url` on the next line; narrowing once is the same
    // proof without the `!`.
    assert(bucuti, "expected the allow-listed-image property to survive");
    expect(bucuti.images.length).toEqual(1);
    expect(bucuti.images[0].url).toContain("lh3.googleusercontent.com");
    // The custom next/image loader passes any http URL straight through, so an unvetted host
    // would be fetched by the visitor's browser from wherever we named.
    expect(JSON.stringify(mapped).includes("some-ota.example")).toEqual(false);
  });

  it("amenities are deduped and capped", () => {
    const mapped = mapSearchResponse(SEARCH_PAGE, USD);
    const bucuti = mapped.results.find((r) => r.name.startsWith("Bucuti"));
    // The fixture lists "Spa" twice.
    expect(bucuti?.amenities).toEqual(["Beach access", "Spa", "Free Wi-Fi", "Restaurant"]);
  });

  it("an empty destination maps to zero results without throwing", () => {
    const mapped = mapSearchResponse(EMPTY_PAGE, USD);
    expect(mapped.results.length).toEqual(0);
    expect(mapped.totalAvailable).toEqual(0);
  });

  it("a response with no properties key at all does not throw", () => {
    const mapped = mapSearchResponse(SHAPELESS_PAGE, USD);
    expect(mapped.results.length).toEqual(0);
    expect(mapped.totalAvailable).toEqual(null);
  });

  it("hasMore is always false, because page two is another bill", () => {
    expect(mapSearchResponse(SEARCH_PAGE, USD).hasMore).toEqual(false);
  });

  it("the payload carries its version, so a shape change cannot read old rows", () => {
    expect(mapSearchResponse(SEARCH_PAGE, USD).version).toEqual(PAYLOAD_VERSION);
  });

  it("rateSpread reports the cheapest and dearest nightly rate", () => {
    const spread = rateSpread(mapSearchResponse(SEARCH_PAGE, USD));
    expect(spread.lowest).toEqual(31850);
    expect(spread.highest).toEqual(41200);
  });

  it("a rating outside 0-5 is dropped rather than rendered as stars", () => {
    const mapped = mapSearchResponse(
      { properties: [{ name: "Odd", overall_rating: 9.2 }] },
      USD,
    );
    expect(mapped.results[0].overallRating).toEqual(null);
  });
});
