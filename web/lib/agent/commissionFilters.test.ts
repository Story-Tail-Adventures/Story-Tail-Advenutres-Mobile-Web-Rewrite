import { describe, expect, it } from "vitest";

import {
  COMMISSION_STATUS_FILTERS,
  EMPTY_LEDGER_QUERY,
  isFiltered,
  ledgerHref,
  ledgerQueryFromParams,
} from "./commissionFilters";

/**
 * §3.7.2's URL contract.
 *
 * THE INVARIANT THAT MATTERS MOST: anything malformed is DROPPED, never passed on. A uuid
 * column handed "abc", or a date column handed "2026-02-31", makes PostgREST answer 400 —
 * and on this screen a failed read is the retry state, so one typo in a shared link would
 * read as "the ledger is down".
 */

const TRIP = "0195a2c0-1a00-7000-8000-000000000040";
const SANDALS = "0195a2c0-1a00-7000-8000-000000000030";

describe("ledgerQueryFromParams", () => {
  it("opens on every status, no filters, page 1", () => {
    expect(ledgerQueryFromParams({})).toEqual(EMPTY_LEDGER_QUERY);
  });

  it("keeps known statuses, drops unknown ones, and de-duplicates", () => {
    expect(
      ledgerQueryFromParams({ status: ["lost", "paid", "received", "lost"] }).statuses,
    ).toEqual(["lost", "received"]);
    expect(ledgerQueryFromParams({ status: "disputed" }).statuses).toEqual(["disputed"]);
  });

  it("accepts a uuid for supplier and trip, and drops anything that is not one", () => {
    const q = ledgerQueryFromParams({ supplier: SANDALS, trip: TRIP });
    expect(q.supplierId).toBe(SANDALS);
    expect(q.tripId).toBe(TRIP);

    const bad = ledgerQueryFromParams({ supplier: "sandals", trip: "40; drop table" });
    expect(bad.supplierId).toBeNull();
    expect(bad.tripId).toBeNull();
  });

  it("drops a date that is shaped right but does not exist", () => {
    expect(ledgerQueryFromParams({ from: "2026-02-31" }).travelFrom).toBeNull();
    expect(ledgerQueryFromParams({ from: "2026-2-3" }).travelFrom).toBeNull();
    expect(ledgerQueryFromParams({ from: "2026-02-28" }).travelFrom).toBe("2026-02-28");
  });

  it("swaps a range typed backwards rather than returning nothing", () => {
    const q = ledgerQueryFromParams({ from: "2026-12-31", to: "2026-01-01" });
    expect(q.travelFrom).toBe("2026-01-01");
    expect(q.travelTo).toBe("2026-12-31");
  });

  it("refuses year 0000, which Postgres does not have", () => {
    expect(ledgerQueryFromParams({ to: "0000-01-01" }).travelTo).toBeNull();
  });

  it("caps the page so the SQL offset cannot overflow an integer", () => {
    expect(ledgerQueryFromParams({ page: "99999999999" }).page).toBe(100_000);
  });

  it("treats a missing, zero or junk page as page 1", () => {
    expect(ledgerQueryFromParams({ page: "0" }).page).toBe(1);
    expect(ledgerQueryFromParams({ page: "-3" }).page).toBe(1);
    expect(ledgerQueryFromParams({ page: "two" }).page).toBe(1);
    expect(ledgerQueryFromParams({ page: "3" }).page).toBe(3);
  });

  it("reads an empty supplier select as 'all suppliers'", () => {
    // The select's "All suppliers" option submits `supplier=`, which must not become a filter.
    expect(ledgerQueryFromParams({ supplier: "" }).supplierId).toBeNull();
  });
});

describe("ledgerHref", () => {
  it("is the bare route for the empty query", () => {
    expect(ledgerHref(EMPTY_LEDGER_QUERY)).toBe("/agent/commission/ledger");
  });

  it("round-trips every filter through the URL parser", () => {
    const query = {
      statuses: ["received", "disputed"] as const,
      supplierId: SANDALS,
      tripId: TRIP,
      travelFrom: "2026-01-01",
      travelTo: "2026-06-30",
      page: 2,
    };
    const href = ledgerHref({ ...query, statuses: [...query.statuses] });
    const params = new URL(href, "http://x").searchParams;
    expect(
      ledgerQueryFromParams({
        status: params.getAll("status"),
        supplier: params.get("supplier") ?? undefined,
        trip: params.get("trip") ?? undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        page: params.get("page") ?? undefined,
      }),
    ).toEqual({ ...query, statuses: ["received", "disputed"] });
  });

  it("leaves page 1 out of the URL", () => {
    expect(ledgerHref({ ...EMPTY_LEDGER_QUERY, tripId: TRIP })).toBe(
      `/agent/commission/ledger?trip=${TRIP}`,
    );
  });
});

describe("isFiltered", () => {
  it("is false for the empty query and for paging alone", () => {
    expect(isFiltered(EMPTY_LEDGER_QUERY)).toBe(false);
    expect(isFiltered({ ...EMPTY_LEDGER_QUERY, page: 4 })).toBe(false);
  });

  it("is true for any narrowing", () => {
    expect(isFiltered({ ...EMPTY_LEDGER_QUERY, statuses: ["lost"] })).toBe(true);
    expect(isFiltered({ ...EMPTY_LEDGER_QUERY, travelTo: "2026-01-01" })).toBe(true);
  });
});

describe("COMMISSION_STATUS_FILTERS", () => {
  it("covers all five commission_status values, Lost included", () => {
    // The prototype's chip row draws four. A Lost line would otherwise be unreachable.
    expect(COMMISSION_STATUS_FILTERS.map((f) => f.value)).toEqual([
      "expected",
      "invoiced",
      "received",
      "disputed",
      "lost",
    ]);
  });

  it("uses the prototype's chip mapping", () => {
    expect(Object.fromEntries(COMMISSION_STATUS_FILTERS.map((f) => [f.value, f.chip]))).toEqual({
      expected: "inquiry",
      invoiced: "proposal",
      received: "booked",
      disputed: "due",
      lost: "past",
    });
  });
});
