/**
 * Tests for quote-request's validation.
 *
 * The failures worth pinning: a retry becoming a second trip, an indicative Google price
 * becoming a cost the platform appears to have quoted, and a client-supplied blob reaching
 * `trip_component.payload` unfiltered.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { parseBody } from "./quote.ts";
import { uuidV7 } from "./uuid.ts";

const base = () => ({
  tripId: uuidV7(),
  kind: "hotel",
  name: "Bucuti & Tara Beach Resort",
  location: "Aruba",
  checkIn: "2026-10-19",
  checkOut: "2026-10-26",
  travelers: 2,
});

Deno.test("a hotel becomes a custom trip, not an all-inclusive one", () => {
  // The enum has no 'hotel'. Claiming all_inclusive would assert a board basis we do not know.
  assertEquals(parseBody(base()).tripType, "custom");
  assertEquals(parseBody({ ...base(), kind: "cruise" }).tripType, "cruise");
});

Deno.test("the title carries the destination, and both are capped", () => {
  const input = parseBody(base());
  assertEquals(input.title, "Bucuti & Tara Beach Resort · Aruba");
  assertEquals(input.destinations, ["Aruba"]);

  const long = parseBody({ ...base(), name: "x".repeat(400) });
  assert(long.title.length <= 120);
});

Deno.test("the trip id must be a recent v7, so a retry is idempotent", () => {
  // A client-generated id is what makes "send" twice create one trip rather than two.
  assertThrows(() => parseBody({ ...base(), tripId: "not-a-uuid" }));
  assertThrows(() => parseBody({ ...base(), tripId: crypto.randomUUID() }));
});

Deno.test("dates are real calendar dates, in order", () => {
  assertThrows(() => parseBody({ ...base(), checkIn: "2026-02-30", checkOut: "2026-03-05" }));
  assertThrows(() => parseBody({ ...base(), checkIn: "2026-10-26", checkOut: "2026-10-19" }));
  // Undated is allowed: "I like this place, when could we go?" is a real inquiry.
  const undated = parseBody({ ...base(), checkIn: undefined, checkOut: undefined });
  assertEquals(undated.checkIn, null);
  assertEquals(undated.checkOut, null);
});

Deno.test("a nameless request is refused", () => {
  assertThrows(() => parseBody({ ...base(), name: "" }));
  assertThrows(() => parseBody({ ...base(), name: 42 }));
});

Deno.test("the snapshot is an allow-list, not a passthrough", () => {
  const input = parseBody({
    ...base(),
    snapshot: {
      propertyType: "Resort",
      indicativeRateCents: 41200,
      hotelClass: 5,
      rating: 4.8,
      amenities: ["Beach access", "Spa"],
      photoUrl: "https://lh3.googleusercontent.com/x",
      // None of the below is on the list.
      source: "Booking.com",
      link: "https://www.booking.com/hotel/aw/x.html",
      nested: { evil: true },
      huge: "y".repeat(10_000),
    },
  });

  const keys = Object.keys(input.snapshot).sort();
  assertEquals(keys, [
    "amenities",
    "capturedAt",
    "hotelClass",
    "indicativeRateCents",
    "photoUrl",
    "propertyType",
    "rating",
  ]);
  // The same rule as the search boundary: a booking site must not reach our database either.
  assertEquals(JSON.stringify(input.snapshot).includes("Booking"), false);
  assertEquals(JSON.stringify(input.snapshot).includes("booking.com"), false);
});

Deno.test("the indicative rate stays in the snapshot and never becomes a cost", () => {
  // `QuoteInput` has no cost field at all, so the handler cannot accidentally write one:
  // trip_component.cost_cents keeps its zero default. This asserts the shape that guarantees
  // it, because the money columns roll into trip.total_value_cents and commission forecasts.
  const input = parseBody({ ...base(), snapshot: { indicativeRateCents: 41200 } });
  assertEquals(input.snapshot.indicativeRateCents, 41200);
  assertEquals(Object.hasOwn(input, "costCents"), false);
  assertEquals(Object.hasOwn(input, "cost_cents"), false);
});

Deno.test("traveler count is clamped rather than trusted", () => {
  assertEquals(parseBody({ ...base(), travelers: 999 }).travelers, 20);
  assertEquals(parseBody({ ...base(), travelers: 0 }).travelers, 1);
  assertEquals(parseBody({ ...base(), travelers: "lots" }).travelers, 2);
});

Deno.test("provenance is set from the kind, never from the caller", () => {
  // Otherwise a caller could label their own request as coming from a supplier feed.
  assertEquals(parseBody(base()).apiSource, "serpapi_google_hotels");
  assertEquals(parseBody({ ...base(), kind: "cruise" }).apiSource, "track_cruises");
  assertEquals(
    parseBody({ ...base(), apiSource: "manual" } as Record<string, unknown>).apiSource,
    "serpapi_google_hotels",
  );
});
