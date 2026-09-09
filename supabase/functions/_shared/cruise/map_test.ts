/**
 * Tests for the cruise mapping layer.
 *
 * These exist for the same reason onboarding_test.ts does: they pin rules that are easy to
 * "simplify" into a bug, and every one of these cases is a real property of the provider's
 * data rather than a hypothetical. ci.yml runs the PR workflow with no secrets and no
 * network, which is why everything here is pure.
 */
import { assertEquals } from "jsr:@std/assert@^1";
import {
  BOOKED_SLUGS,
  companyToSlug,
  mapCruiseLine,
  mapPort,
  mapSailing,
  mapShip,
  shipProviderKey,
  slugify,
  toCabinPrices,
  toCents,
  toCurrency,
  toDate,
  toPortCalls,
} from "./map.ts";
import { COMPANIES } from "./types.ts";
import { LIVE_CRUISES_PAGE } from "./__fixtures__/provider.ts";

Deno.test("companyToSlug maps the three lines whose names disagree", () => {
  // The whole reason the map exists: these three would otherwise mint duplicate
  // cruise_line rows next to the slugs screen 2.0.9 already links to.
  assertEquals(companyToSlug("ncl"), "norwegian");
  assertEquals(companyToSlug("celebrity-cruises"), "celebrity");
  assertEquals(companyToSlug("disney-cruise-line"), "disney");
});

Deno.test("companyToSlug leaves the four that already agree alone", () => {
  for (const slug of ["royal-caribbean", "princess", "carnival", "holland-america"]) {
    assertEquals(companyToSlug(slug), slug);
  }
});

Deno.test("every provider company maps to a slug the slug CHECK accepts", () => {
  // cruise_line has CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9-]+$'). A company value
  // that fails it would take down the whole reference sync on one bad row.
  for (const company of COMPANIES) {
    const slug = companyToSlug(company);
    assertEquals(slug, slug.toLowerCase());
    assertEquals(/^[a-z0-9-]+$/.test(slug), true, `bad slug for ${company}: ${slug}`);
  }
});

Deno.test("Virgin Voyages is booked but has no provider company", () => {
  // The asymmetry that makes "curated wins over synced" concrete. If this ever fails
  // because the provider added Virgin, the migration's curated row needs its provenance
  // pair filled rather than a second row minted.
  assertEquals(BOOKED_SLUGS.has("virgin-voyages"), true);
  const covered = COMPANIES.map(companyToSlug);
  assertEquals(covered.includes("virgin-voyages"), false);
});

Deno.test("the provider covers seven of the eight lines Story-Tail books", () => {
  const covered = new Set(COMPANIES.map(companyToSlug));
  const missing = [...BOOKED_SLUGS].filter((s) => !covered.has(s));
  assertEquals(missing, ["virgin-voyages"]);
  assertEquals([...BOOKED_SLUGS].filter((s) => covered.has(s)).length, 7);
});

Deno.test("toCents rounds half-cents up where the naive multiply rounds them down", () => {
  // Not float panic in general: Math.round(v * 100) is exact for every 2-decimal fare
  // (swept 0..10000). It fails on HALF-CENTS, where the binary residue sits just under the
  // midpoint. price_euro is a cross-market conversion, so a third decimal is routine.
  assertEquals(1199.995 * 100, 119999.49999999999);
  assertEquals(Math.round(1199.995 * 100), 119999);
  assertEquals(toCents(1199.995), 120000);

  assertEquals(Math.round(8.165 * 100), 816);
  assertEquals(toCents(8.165), 817);

  // And it stays exact on the ordinary 2-decimal case.
  assertEquals(toCents(1199.99), 119999);
  assertEquals(toCents(0), 0);
  assertEquals(toCents(1290), 129000);
  assertEquals(toCents(2640.5), 264050);
  assertEquals(toCents(null), null);
  assertEquals(toCents(undefined), null);
  // Rejected rather than stored: the column CHECK refuses negatives, and a NaN fare would
  // fail the whole upsert over one bad provider row.
  assertEquals(toCents(-1), null);
  assertEquals(toCents(Number.NaN), null);
  assertEquals(toCents(Number.POSITIVE_INFINITY), null);
});

Deno.test("toDate takes the calendar date and does not shift it through a timezone", () => {
  // The bug this prevents: a departure that moves a day depending on where the function
  // ran. Asserted against the naive path so the reason cannot be optimised away.
  const withOffset = "2026-11-14T00:00:00-05:00";
  assertEquals(toDate(withOffset), "2026-11-14");
  assertEquals(new Date(withOffset).toISOString().slice(0, 10), "2026-11-14");

  const lateOffset = "2026-11-14T23:30:00-05:00";
  assertEquals(toDate(lateOffset), "2026-11-14");
  assertEquals(new Date(lateOffset).toISOString().slice(0, 10), "2026-11-15");

  assertEquals(toDate("2026-11-14"), "2026-11-14");
  assertEquals(toDate(null), null);
  assertEquals(toDate("not a date"), null);
});

Deno.test("toCurrency normalises to char(3) or drops the value", () => {
  assertEquals(toCurrency("usd"), "USD");
  assertEquals(toCurrency(" eur "), "EUR");
  assertEquals(toCurrency("US"), null);
  assertEquals(toCurrency("US$"), null);
  assertEquals(toCurrency(null), null);
});

Deno.test("toPortCalls numbers Holland America's all-null days densely", () => {
  // Their spec: HAL's feed omits every per-port day number. Ordering by `day` would
  // scramble the itinerary; coalescing it to 0 or 1 would invent facts.
  const calls = toPortCalls([
    { port: "Fort Lauderdale", day: null },
    { port: "Half Moon Cay", day: null },
    { port: "Grand Turk", day: null },
  ]);
  assertEquals(calls.map((c) => c.sequence), [1, 2, 3]);
  assertEquals(calls.map((c) => c.day), [null, null, null]);
  assertEquals(calls.map((c) => c.port_name), [
    "Fort Lauderdale",
    "Half Moon Cay",
    "Grand Turk",
  ]);
});

Deno.test("toPortCalls keeps sequence dense when a stop is dropped", () => {
  // A gap would trip the unique index on (sailing_id, sequence) only by luck; the real
  // damage is an itinerary that renders a hole. Filter first, number second.
  const calls = toPortCalls([
    { port: "Miami", day: 1 },
    { port: "   ", day: 2 },
    { port: "Nassau", day: 3 },
  ]);
  assertEquals(calls.map((c) => [c.sequence, c.port_name, c.day]), [
    [1, "Miami", 1],
    [2, "Nassau", 3],
  ]);
});

Deno.test("toPortCalls tolerates a missing or malformed ports_list", () => {
  assertEquals(toPortCalls(null), []);
  assertEquals(toPortCalls(undefined), []);
  assertEquals(toPortCalls([]), []);
});

Deno.test("mapSailing drops a sailing with no readable departure date", () => {
  // departure_date is NOT NULL and is what every search filters on. Everything else on
  // their Cruise schema is nullable and must survive being absent.
  const base = { cruise_id: "Y731", company: "princess", locale: "en_US" } as const;
  assertEquals(mapSailing({ ...base, departure_date: "" }), null);
  assertEquals(mapSailing({ ...base, departure_date: "garbage" }), null);

  const ok = mapSailing({ ...base, departure_date: "2027-01-09T00:00:00Z" });
  assertEquals(ok?.departure_date, "2027-01-09");
  assertEquals(ok?.title, null);
  assertEquals(ok?.ship_name, null);
  assertEquals(ok?.duration_nights, null);
  assertEquals(ok?.lead_price_cents, null);
  assertEquals(ok?.destinations, []);
});

Deno.test("mapSailing keeps the (key, locale) pair that makes the row unique", () => {
  // Princess and Holland America share the Y731 voyage-code format, and the same id
  // recurs per locale with different pricing. Both halves have to reach the row or the
  // upsert merges two different sailings.
  const one = mapSailing({
    cruise_id: "Y731",
    company: "princess",
    locale: "en_US",
    departure_date: "2027-01-09T00:00:00Z",
    price: 1850,
    currency: "USD",
  })!;
  const two = mapSailing({
    cruise_id: "Y731",
    company: "holland-america",
    locale: "en_GB",
    departure_date: "2027-01-09T00:00:00Z",
    price: 1490,
    currency: "GBP",
  })!;
  assertEquals(one.provider_key, two.provider_key);
  assertEquals(one.provider_locale === two.provider_locale, false);
  assertEquals(one.company === two.company, false);
  assertEquals([one.lead_price_cents, one.currency], [185000, "USD"]);
  assertEquals([two.lead_price_cents, two.currency], [149000, "GBP"]);
});

Deno.test("mapSailing drops a fare that arrived without its currency", () => {
  // cruise_sailing CHECKs that a non-null lead_price_cents has a currency. Dropping the
  // number beats failing the upsert over a provider row that sent one and not the other.
  const row = mapSailing({
    cruise_id: "AB12",
    company: "carnival",
    locale: "en_US",
    departure_date: "2027-03-01",
    price: 1290,
    currency: null,
    price_euro: 1190,
  })!;
  assertEquals(row.lead_price_cents, null);
  assertEquals(row.currency, null);
  // price_euro is independent of `currency` and survives.
  assertEquals(row.lead_price_eur_cents, 119000);
});

Deno.test("mapCruiseLine reads cruise_count as the sailing count", () => {
  const row = mapCruiseLine({
    company: "ncl",
    display_name: "Norwegian Cruise Line",
    cruise_count: 8421,
    ship_count: 19,
    destination_count: 42,
    destinations: ["Caribbean", "Alaska", "Caribbean"],
    locales: ["en_US", "en_GB"],
    earliest_departure: "2026-09-12T00:00:00Z",
    latest_departure: "2028-04-30T00:00:00Z",
  });
  assertEquals(row.slug, "norwegian");
  assertEquals(row.is_booked, true);
  assertEquals(row.sailing_count, 8421);
  assertEquals(row.provider_key, "ncl");
  assertEquals(row.earliest_departure, "2026-09-12");
  assertEquals(row.latest_departure, "2028-04-30");
  // Duplicates within one payload are normal; order is preserved because destinations
  // render in the order the provider chose.
  assertEquals(row.destinations, ["Caribbean", "Alaska"]);
});

Deno.test("mapCruiseLine marks a line Story-Tail does not book", () => {
  const row = mapCruiseLine({ company: "aida", display_name: "AIDA Cruises" });
  assertEquals(row.slug, "aida");
  assertEquals(row.is_booked, false);
  // Sorted after the curated eight rather than interleaved with them.
  assertEquals(row.display_order >= 900, true);
});

Deno.test("mapCruiseLine falls back to the slug when display_name is empty", () => {
  const row = mapCruiseLine({ company: "msc", display_name: "" });
  assertEquals(row.name, "msc");
});

Deno.test("mapShip keys a ship by company and name, not name alone", () => {
  // /ships returns no id, so the provenance key is composite. Two lines both sailing a
  // "Discovery" would otherwise collide on one row.
  const a = mapShip({ ship_name: "Discovery", company: "princess", sailing_count: 7 });
  const b = mapShip({ ship_name: "Discovery", company: "carnival", sailing_count: 9 });
  assertEquals(a.provider_key, "princess:Discovery");
  assertEquals(b.provider_key, "carnival:Discovery");
  assertEquals(a.provider_key === b.provider_key, false);
});

Deno.test("toCabinPrices normalises an open-ended cabin vocabulary", () => {
  // Five documented codes "plus line-specific tiers like CONCIERGE, AQUA, VISTA_SUITE,
  // NEPTUNE_SUITE, HAVEN" — so shape is enforced, membership is not. The CHECK on
  // cabin_code is ^[A-Z0-9_]+$, which every output here has to satisfy.
  const rows = toCabinPrices(
    {
      INTERIOR: 1199,
      OCEANVIEW: 1399.99,
      "vista suite": 3499,
      "neptune-suite": 5099,
      HAVEN: 7200,
    },
    "USD",
    "en_US",
  );

  const byCode = Object.fromEntries(rows.map((r) => [r.cabin_code, r.price_cents]));
  assertEquals(byCode["INTERIOR"], 119900);
  assertEquals(byCode["OCEANVIEW"], 139999);
  assertEquals(byCode["VISTA_SUITE"], 349900);
  assertEquals(byCode["NEPTUNE_SUITE"], 509900);
  assertEquals(byCode["HAVEN"], 720000);
  for (const row of rows) {
    assertEquals(/^[A-Z0-9_]+$/.test(row.cabin_code), true, row.cabin_code);
    assertEquals(row.currency, "USD");
  }
});

Deno.test("toCabinPrices yields nothing without a currency, and that is normal", () => {
  // Costa's cabin source has been unavailable since 2026-04-21 per their spec, and the
  // list endpoint never sends this field at all. Absence is not an error.
  assertEquals(toCabinPrices({ INTERIOR: 1199 }, null, "en_US"), []);
  assertEquals(toCabinPrices(null, "USD", "en_US"), []);
  assertEquals(toCabinPrices(undefined, "USD", "en_US"), []);
  // No locale means we cannot say which market the figures belong to, so they are dropped
  // rather than stored ambiguously.
  assertEquals(toCabinPrices({ INTERIOR: 1199 }, "USD", null), []);
});

Deno.test("slugify handles the accented port and ship names the feed contains", () => {
  assertEquals(slugify("Curaçao"), "curacao");
  assertEquals(slugify("Wonder of the Seas"), "wonder-of-the-seas");
  assertEquals(slugify("  Málaga, Spain  "), "malaga-spain");
  assertEquals(slugify("AIDAnova"), "aidanova");
});

// ─────────────────────────────────────────────────────────────────────────────
// Against a real captured page. See LIVE_CRUISES_PAGE's docstring for why each of these
// four cases is here — none of them appears in the provider's own spec examples.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("one cruise_id across locales yields distinct rows, not one merged row", () => {
  // The natural key is (provider, provider_key, provider_locale). Live data shows 61020
  // three times with different currencies, titles, durations AND itinerary_ids — 23 nights
  // in en_US against 21 in nl_NL. Keyed on provider_key alone these collapse into one row
  // whose price and duration depend on which page arrived last.
  const rows = LIVE_CRUISES_PAGE.data.map(mapSailing).filter((r) => r !== null);
  const sixtyOne = rows.filter((r) => r!.provider_key === "61020");
  assertEquals(sixtyOne.length, 3);

  const keys = sixtyOne.map((r) =>
    `${r!.provider}|${r!.provider_key}|${r!.provider_locale}`
  );
  assertEquals(new Set(keys).size, 3, "all three must be distinguishable");

  const byLocale = Object.fromEntries(sixtyOne.map((r) => [r!.provider_locale, r!]));
  assertEquals(byLocale["en_US"].duration_nights, 23);
  assertEquals(byLocale["nl_NL"].duration_nights, 21);
  assertEquals([byLocale["en_US"].lead_price_cents, byLocale["en_US"].currency], [
    436800,
    "USD",
  ]);
  assertEquals([byLocale["nl_NL"].lead_price_cents, byLocale["nl_NL"].currency], [
    342000,
    "EUR",
  ]);
});

Deno.test("a locale outside the published enum still maps", () => {
  // pt_BR is absent from their LocaleEnum but present in live responses. Had
  // provider_locale been a Postgres enum, this row would have failed the whole page.
  const brazil = LIVE_CRUISES_PAGE.data.find((c) => c.locale === "pt_BR")!;
  const row = mapSailing(brazil)!;
  assertEquals(row.provider_locale, "pt_BR");
  assertEquals(row.currency, "BRL");
  assertEquals(row.lead_price_cents, 1112100);
  // price_euro is a cross-market conversion and lands on a fractional cent — the case
  // toCents exists for.
  assertEquals(row.lead_price_eur_cents, 189671);
});

Deno.test("a 04:00Z departure stays on its own calendar day", () => {
  // Live departure_date values are midnight US Eastern expressed as 04:00Z. Read as an
  // instant and reformatted in a westward zone, this sailing moves to the 8th.
  const row = mapSailing(LIVE_CRUISES_PAGE.data[0])!;
  assertEquals(row.departure_date, "2026-09-09");
});

Deno.test("localised port names are NOT reconciled, and that is a known limitation", () => {
  // "Rhodes, Greece" / "Rodi, Grecia" / "Rodes, Grécia" are one physical port under three
  // names, and nothing in the payload connects them. This test does not assert a fix — it
  // pins the behaviour so the day someone syncs a non-en_US locale, the duplicate port rows
  // are a documented consequence rather than a surprise. See cruise_port's column comment.
  const names = LIVE_CRUISES_PAGE.data.flatMap((c) =>
    toPortCalls(c.ports_list).map((p) => p.port_name)
  );
  assertEquals(names.includes("Rhodes, Greece"), true);
  assertEquals(names.includes("Rodi, Grecia"), true);
  assertEquals(names.includes("Rodes, Grécia"), true);
  // Every en_US scope is unaffected, which is why the shipped configuration is en_US only.
  const englishOnly = LIVE_CRUISES_PAGE.data
    .filter((c) => c.locale === "en_US")
    .flatMap((c) => toPortCalls(c.ports_list).map((p) => p.port_name));
  assertEquals(englishOnly.includes("Rodi, Grecia"), false);
});

Deno.test("mapPort strips the quoting debris in the live port catalogue", () => {
  // Real entries from a live /filter-options response. The apostrophes are encoding
  // debris; leaving them makes the natural key unstable the day the provider fixes it.
  assertEquals(mapPort("'Bucht von Palma'").name, "Bucht von Palma");
  assertEquals(
    mapPort("'Ionisches Meer 'darkest spot'").name,
    "Ionisches Meer 'darkest spot",
  );
  assertEquals(mapPort("  Barcelona, Spain  ").name, "Barcelona, Spain");
  // An at-sea position is a real itinerary stop and is kept verbatim: dropping it would
  // put a hole in the port-call sequence of every sailing with a sea day.
  assertEquals(mapPort("38.6 N 19.8 E - Ionian Sea").name, "38.6 N 19.8 E - Ionian Sea");
  // A count the vocabulary endpoint does not supply stays null, never a misleading zero.
  assertEquals(mapPort("Nassau, Bahamas").sailing_count, null);
  assertEquals(mapPort("Nassau, Bahamas", 5401).sailing_count, 5401);
});

Deno.test("both writers of cruise_ship agree on the provenance key", () => {
  // Two code paths write this table: /ships through mapShip, and a sailing naming an unknown
  // ship through sync.ts's stub path. They diverged — the stub built its key from the
  // internal cruise_line UUID, so one ship could hold either format depending on which path
  // saw it first, and the "provider's identifier" column held a value the provider never
  // sent. This asserts they cannot drift apart again.
  const fromShipsEndpoint = mapShip({
    ship_name: "Norwegian Spirit",
    company: "ncl",
    sailing_count: 42,
  });
  assertEquals(
    fromShipsEndpoint.provider_key,
    shipProviderKey("ncl", "Norwegian Spirit"),
  );
  assertEquals(fromShipsEndpoint.provider_key, "ncl:Norwegian Spirit");

  // The company slug, never a uuid: a provenance key must survive the line row being
  // recreated, and must be reconcilable against the provider.
  assertEquals(shipProviderKey("ncl", "  Norwegian Spirit  "), "ncl:Norwegian Spirit");
  assertEquals(/^[0-9a-f-]{36}:/.test(fromShipsEndpoint.provider_key), false);
});

Deno.test("cabin prices carry the market they came from", () => {
  // GET /cruises/{id} answers de_DE/EUR whatever you ask for — it takes no locale parameter
  // and ignores one (tested against the live API). So a US sailing's breakdown arrives in
  // euros, and it has to say so: quoting a euro figure as a dollar one is the failure this
  // column prevents. The tier structure and the ratios are still market-independent, which
  // is why the rows are kept rather than discarded.
  const rows = toCabinPrices(
    { INTERIOR: 1198.3, OCEANVIEW: 1398, BALCONY: 1698, DELUXE: 2498 },
    "EUR",
    "de_DE",
  );
  assertEquals(rows.length, 4);
  for (const row of rows) {
    assertEquals(row.currency, "EUR");
    assertEquals(row.provider_locale, "de_DE");
  }
  // Ratios survive the currency mismatch, and they are the useful part.
  const byCode = Object.fromEntries(rows.map((r) => [r.cabin_code, r.price_cents]));
  assertEquals(byCode["BALCONY"] > byCode["INTERIOR"], true);
  assertEquals(byCode["DELUXE"] > byCode["BALCONY"], true);
});
