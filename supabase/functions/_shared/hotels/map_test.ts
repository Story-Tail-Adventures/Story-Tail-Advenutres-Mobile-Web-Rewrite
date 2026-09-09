/**
 * Tests for the provider→published mapping.
 *
 * Two classes of failure here, and they cost differently. A malformed payload that throws
 * takes down a public page for everyone. A booking-site name that survives the mapper is a
 * breach of the host agency agreement (§1.3.5) that nobody notices until a compliance
 * review — so those assertions are made against the SERIALISED output, not field by field:
 * a field-level check passes happily while the value rides along inside a passthrough
 * object.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { mapSearchResponse, PAYLOAD_VERSION, rateSpread } from "./map.ts";
import { EMPTY_PAGE, SEARCH_PAGE, SHAPELESS_PAGE } from "./__fixtures__/provider.ts";

const USD = "USD";

Deno.test("no booking-site identity survives the mapper", () => {
  const mapped = mapSearchResponse(SEARCH_PAGE, USD);
  const serialised = JSON.stringify(mapped);

  // The fixture definitely contains all of these — assert that first, or this test could
  // pass against a payload that never had them.
  const source = JSON.stringify(SEARCH_PAGE);
  for (const hostile of ["Booking.com", "Hotels.com", "Expedia", "booking.com/hotel"]) {
    assertStringIncludes(source, hostile);
  }

  for (const hostile of ["Booking", "Hotels.com", "Expedia", "booking.com", "hotels.com"]) {
    assertEquals(
      serialised.includes(hostile),
      false,
      `"${hostile}" reached the published payload`,
    );
  }
});

Deno.test("our vendor's URLs and Google's booking module do not survive either", () => {
  const serialised = JSON.stringify(mapSearchResponse(SEARCH_PAGE, USD));
  for (const hostile of [
    "serpapi.com",
    "google.com/travel",
    "next_page_token",
    "serpapi_property_details_link",
    "deal_description",
  ]) {
    assertEquals(serialised.includes(hostile), false, `"${hostile}" reached the payload`);
  }
});

Deno.test("a sponsored property is dropped", () => {
  const mapped = mapSearchResponse(SEARCH_PAGE, USD);
  assertEquals(mapped.results.some((r) => r.name === "Sponsored Beach Club"), false);
  assertEquals(JSON.stringify(mapped).includes("SPONSORED"), false);
});

Deno.test("a property with no extracted rate is kept, with a null rate", () => {
  // Dropping it would silently shrink the page, and "$1,148" is a display string we refuse
  // to parse — a wrong price on a public page is a compliance problem, not a layout one.
  const mapped = mapSearchResponse(SEARCH_PAGE, USD);
  const boardwalk = mapped.results.find((r) => r.name === "Boardwalk Boutique Hotel");
  assert(boardwalk, "expected the no-price property to survive");
  assertEquals(boardwalk.rate, null);
});

Deno.test("rates convert to integer cents without a rounding slip", () => {
  const mapped = mapSearchResponse(SEARCH_PAGE, USD);
  const bucuti = mapped.results.find((r) => r.name.startsWith("Bucuti"));
  assertEquals(bucuti?.rate?.amountCents, "41200");
  assertEquals(bucuti?.rate?.currency, "USD");
  assertEquals(bucuti?.rate?.basis, "night");

  // 318.5 → 31850, not 31849. Float × 100 needs the round.
  const renaissance = mapped.results.find((r) => r.name.startsWith("Renaissance"));
  assertEquals(renaissance?.rate?.amountCents, "31850");
});

Deno.test("only allow-listed image hosts survive", () => {
  const mapped = mapSearchResponse(SEARCH_PAGE, USD);
  const bucuti = mapped.results.find((r) => r.name.startsWith("Bucuti"));
  assertEquals(bucuti?.images.length, 1);
  assertStringIncludes(bucuti!.images[0].url, "lh3.googleusercontent.com");
  // The custom next/image loader passes any http URL straight through, so an unvetted host
  // would be fetched by the visitor's browser from wherever we named.
  assertEquals(JSON.stringify(mapped).includes("some-ota.example"), false);
});

Deno.test("amenities are deduped and capped", () => {
  const mapped = mapSearchResponse(SEARCH_PAGE, USD);
  const bucuti = mapped.results.find((r) => r.name.startsWith("Bucuti"));
  // The fixture lists "Spa" twice.
  assertEquals(bucuti?.amenities, ["Beach access", "Spa", "Free Wi-Fi", "Restaurant"]);
});

Deno.test("an empty destination maps to zero results without throwing", () => {
  const mapped = mapSearchResponse(EMPTY_PAGE, USD);
  assertEquals(mapped.results.length, 0);
  assertEquals(mapped.totalAvailable, 0);
});

Deno.test("a response with no properties key at all does not throw", () => {
  const mapped = mapSearchResponse(SHAPELESS_PAGE, USD);
  assertEquals(mapped.results.length, 0);
  assertEquals(mapped.totalAvailable, null);
});

Deno.test("hasMore is always false, because page two is another bill", () => {
  assertEquals(mapSearchResponse(SEARCH_PAGE, USD).hasMore, false);
});

Deno.test("the payload carries its version, so a shape change cannot read old rows", () => {
  assertEquals(mapSearchResponse(SEARCH_PAGE, USD).version, PAYLOAD_VERSION);
});

Deno.test("rateSpread reports the cheapest and dearest nightly rate", () => {
  const spread = rateSpread(mapSearchResponse(SEARCH_PAGE, USD));
  assertEquals(spread.lowest, 31850);
  assertEquals(spread.highest, 41200);
});

Deno.test("a rating outside 0-5 is dropped rather than rendered as stars", () => {
  const mapped = mapSearchResponse(
    { properties: [{ name: "Odd", overall_rating: 9.2 }] },
    USD,
  );
  assertEquals(mapped.results[0].overallRating, null);
});
