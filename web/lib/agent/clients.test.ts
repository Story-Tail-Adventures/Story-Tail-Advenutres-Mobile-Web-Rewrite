import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.3.1's view models.
 *
 * FIVE INVARIANTS THIS FILE PINS, each one a thing that is invisible until it is wrong:
 *
 *  1. NULL MEANS THE READ FAILED, and an empty book does not. A roster of zero clients and a
 *     roster that could not be fetched need different screens — one says "No clients yet",
 *     the other offers a retry.
 *  2. A NULL CURRENCY IS A DASH, NOT "$0.00". The accessor returns NULL for a client with
 *     nothing committed; a labelled zero claims they have spent nothing where the truth is
 *     that nothing has been booked.
 *  3. THE CURRENCY NOTE FIRES WHENEVER A ROW LEFT ONE OUT — §3.2's rule, applied per row.
 *  4. `total_count` IS READ OFF A ROW and survives an empty page.
 *  5. PLAIN DATA: every view model is JSON-safe, because these cross into components.
 */

const mocks = vi.hoisted(() => ({
  callAgentRead: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { loadClientRoster, rosterQueryFromParams, ROSTER_PAGE_SIZE } from "./clients";

const BASE_ROW = {
  client_id: "c1",
  display_name: "Jordan Hayes",
  first_name: "Jordan",
  last_name: "Hayes",
  email: "jordan.hayes@example.com",
  phone: "+1-555-0142",
  status: "active",
  tags: ["anniversary"],
  lifetime_value_cents: "1976500",
  lifetime_currency: "USD",
  lifetime_currency_count: 1,
  trip_count: 5,
  last_trip_title: "Beaches Turks & Caicos",
  last_trip_end_date: "2024-01-13",
  next_trip_title: "Anniversary Week in Negril",
  next_trip_start_date: "2026-08-12",
  next_trip_status: "booked",
  next_trip_destinations: ["Negril, Jamaica"],
  last_contact_at: "2026-09-26T12:00:00Z",
  created_at: "2024-03-01T00:00:00Z",
  archived_at: null,
  as_of_date: "2026-09-26",
  total_count: 27,
};

const SUMMARY = {
  active_count: 27,
  in_motion_count: 5,
  inquiry_count: 1,
  archived_count: 2,
  tag_facets: [{ tag: "vip", count: 4 }],
};

function arrange(rows: unknown[], summary: unknown[] = [SUMMARY]) {
  mocks.callAgentRead.mockImplementation((read: string) =>
    Promise.resolve({ ok: true, rows: read === "agent_client_roster" ? rows : summary }),
  );
}

const QUERY = { status: "active" as const, tags: [], search: "", page: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }),
  });
});

describe("rosterQueryFromParams", () => {
  it("defaults to active, no tags, no search, page 1", () => {
    expect(rosterQueryFromParams({})).toEqual({
      status: "active",
      tags: [],
      search: "",
      page: 1,
    });
  });

  it("accepts one tag or many — Next gives a string for one and an array for several", () => {
    expect(rosterQueryFromParams({ tag: "vip" }).tags).toEqual(["vip"]);
    expect(rosterQueryFromParams({ tag: ["vip", "family"] }).tags).toEqual(["vip", "family"]);
  });

  it("treats anything but 'archived' as active — an unknown status is not a third state", () => {
    expect(rosterQueryFromParams({ status: "archived" }).status).toBe("archived");
    expect(rosterQueryFromParams({ status: "merged_into" }).status).toBe("active");
    expect(rosterQueryFromParams({ status: "" }).status).toBe("active");
  });

  it("clamps a junk or zero page to 1 rather than computing a negative offset", () => {
    expect(rosterQueryFromParams({ page: "0" }).page).toBe(1);
    expect(rosterQueryFromParams({ page: "-4" }).page).toBe(1);
    expect(rosterQueryFromParams({ page: "banana" }).page).toBe(1);
    expect(rosterQueryFromParams({ page: "3" }).page).toBe(3);
  });

  it("trims the search, so a space is not a filter", () => {
    expect(rosterQueryFromParams({ q: "  hayes  " }).search).toBe("hayes");
    expect(rosterQueryFromParams({ q: "   " }).search).toBe("");
  });
});

describe("loadClientRoster", () => {
  it("returns null when EITHER read fails — a table with no header counts is worse than a retry", async () => {
    mocks.callAgentRead.mockImplementation((read: string) =>
      Promise.resolve(
        read === "agent_client_roster"
          ? { ok: true, rows: [BASE_ROW] }
          : { ok: false, kind: "unavailable" },
      ),
    );
    expect(await loadClientRoster(QUERY)).toBeNull();

    mocks.callAgentRead.mockImplementation((read: string) =>
      Promise.resolve(
        read === "agent_client_roster"
          ? { ok: false, kind: "unavailable" }
          : { ok: true, rows: [SUMMARY] },
      ),
    );
    expect(await loadClientRoster(QUERY)).toBeNull();
  });

  it("an empty book is a populated object, not null", async () => {
    arrange([]);
    const roster = await loadClientRoster(QUERY);
    expect(roster).not.toBeNull();
    expect(roster?.rows).toEqual([]);
    expect(roster?.total).toBe(0);
    expect(roster?.pageCount).toBe(1);
  });

  it("passes the filters through, and null rather than an empty array when unfiltered", async () => {
    arrange([BASE_ROW]);
    await loadClientRoster({ status: "archived", tags: ["vip"], search: "hayes", page: 2 });
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_client_roster", {
      p_status: ["archived"],
      p_tags: ["vip"],
      p_search: "hayes",
      p_limit: ROSTER_PAGE_SIZE,
      p_offset: ROSTER_PAGE_SIZE,
    });

    vi.clearAllMocks();
    arrange([BASE_ROW]);
    await loadClientRoster(QUERY);
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_client_roster", {
      p_status: ["active"],
      p_tags: null,
      p_search: null,
      p_limit: ROSTER_PAGE_SIZE,
      p_offset: 0,
    });
  });

  it("formats the money, and gives a client with nothing committed a dash rather than $0.00", async () => {
    arrange([
      BASE_ROW,
      {
        ...BASE_ROW,
        client_id: "c2",
        display_name: "Eli Park",
        first_name: "Eli",
        last_name: "Park",
        lifetime_value_cents: "0",
        lifetime_currency: null,
        lifetime_currency_count: 0,
      },
    ]);
    const roster = await loadClientRoster(QUERY);
    expect(roster?.rows[0]?.lifetimeLabel).toContain("19,765");
    expect(roster?.rows[1]?.lifetimeLabel).toBeNull();
  });

  it("raises the currency note only when a row actually left a currency out", async () => {
    arrange([BASE_ROW]);
    expect((await loadClientRoster(QUERY))?.currencyNote).toBeNull();

    arrange([{ ...BASE_ROW, lifetime_currency_count: 2 }]);
    expect((await loadClientRoster(QUERY))?.currencyNote).toMatch(/one client/i);

    arrange([
      { ...BASE_ROW, lifetime_currency_count: 2 },
      { ...BASE_ROW, client_id: "c3", lifetime_currency_count: 3 },
    ]);
    expect((await loadClientRoster(QUERY))?.currencyNote).toMatch(/^2 clients/);
  });

  it("says 'Now' for a client who is travelling, instead of a date that has passed", async () => {
    arrange([{ ...BASE_ROW, next_trip_status: "in_progress" }]);
    const row = (await loadClientRoster(QUERY))?.rows[0];
    expect(row?.nextTripIsNow).toBe(true);
    expect(row?.nextTripLabel).toBe("Now · Negril, Jamaica");
  });

  it("keeps a trip with no dates — an inquiry has none and is the one most needing a call", async () => {
    arrange([
      {
        ...BASE_ROW,
        next_trip_title: "Somewhere warm, February-ish",
        next_trip_start_date: null,
        next_trip_status: "inquiry",
      },
    ]);
    expect((await loadClientRoster(QUERY))?.rows[0]?.nextTripLabel).toBe(
      "Somewhere warm, February-ish",
    );
  });

  it("pairs a trip with a month and year when it has one", async () => {
    arrange([BASE_ROW]);
    const row = (await loadClientRoster(QUERY))?.rows[0];
    expect(row?.nextTripLabel).toBe("Anniversary Week in Negril · Aug 26");
    expect(row?.lastTripLabel).toBe("Beaches Turks & Caicos · Jan 24");
  });

  it("reads total_count off a row and derives the page count from it", async () => {
    arrange([BASE_ROW]);
    const roster = await loadClientRoster(QUERY);
    expect(roster?.total).toBe(27);
    expect(roster?.pageCount).toBe(Math.ceil(27 / ROSTER_PAGE_SIZE));
  });

  it("marks a facet selected when the query carries it", async () => {
    arrange([BASE_ROW]);
    const roster = await loadClientRoster({ ...QUERY, tags: ["vip"] });
    expect(roster?.facets).toEqual([{ tag: "vip", count: 4, selected: true }]);
  });

  it("falls back to an empty facet list rather than throwing on a null tag_facets", async () => {
    arrange([BASE_ROW], [{ ...SUMMARY, tag_facets: null }]);
    expect((await loadClientRoster(QUERY))?.facets).toEqual([]);
  });

  it("uses the email as given, and null stays null for the component to label", async () => {
    arrange([{ ...BASE_ROW, email: null }]);
    expect((await loadClientRoster(QUERY))?.rows[0]?.email).toBeNull();
  });

  it("builds initials from the name parts, not from the display name", async () => {
    arrange([{ ...BASE_ROW, display_name: "Belle Fitzwilliam-Castellanos",
               first_name: "Annabelle", last_name: "Fitzwilliam-Castellanos" }]);
    expect((await loadClientRoster(QUERY))?.rows[0]?.initials).toBe("AF");
  });

  // Every view model crosses into a component. A Date, a Map or an undefined here is a
  // runtime error at the server/client boundary rather than a type error at build time.
  it("is PLAIN DATA all the way down", async () => {
    arrange([BASE_ROW, { ...BASE_ROW, client_id: "c2", lifetime_currency: null, tags: null }]);
    const roster = await loadClientRoster(QUERY);
    const walk = (value: unknown, path: string): void => {
      if (value === undefined) throw new Error(`undefined at ${path}`);
      if (value === null || typeof value !== "object") {
        expect(typeof value, path).not.toBe("function");
        return;
      }
      expect(value instanceof Date, path).toBe(false);
      expect(value instanceof Map, path).toBe(false);
      expect(value instanceof Set, path).toBe(false);
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(roster, "roster");
    expect(JSON.parse(JSON.stringify(roster))).toEqual(roster);
  });
});
