import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.7.1 and §3.7.2's view models.
 *
 * WHAT THIS FILE PINS, each one invisible until it is wrong:
 *
 *  1. NULL MEANS THE READ FAILED. An advisor with nothing yet gets tiles of zeros and an
 *     empty table; an advisor whose read fell over gets a retry. Mixing them up shows "$0
 *     received this year" to someone whose year was fine.
 *  2. NULL IS NOT ZERO. No rate is not 0%, and last year with nothing in it is not "−100%".
 *  3. ONLY AN EXACT DRILL IS A LINK. At risk links to the disputed lines because they are
 *     exactly what it sums; the other tiles would land on lists that add up to something else.
 *  4. AN ARCHIVED TRIP'S LINE STAYS, but its title is not a link into a page that will not open.
 *  5. `total_count` IS READ OFF A ROW and survives an empty page.
 */

const mocks = vi.hoisted(() => ({
  callAgentRead: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  dashboardMonths,
  dashboardTiles,
  ledgerRow,
  lineView,
  loadAddLineForm,
  loadCommissionDashboard,
  loadCommissionLedger,
  loadCommissionLine,
  rateLabel,
  searchTripsForLine,
  travelDateLabel,
} from "./commission";
import { EMPTY_LEDGER_QUERY } from "./commissionFilters";

const DASH = {
  as_of_date: "2026-10-11",
  currency: "USD",
  ytd_received_cents: "306818",
  ly_received_cents: "81794",
  avg_rate_pct: 12.1,
  ly_avg_rate_pct: 12.0,
  upcoming_commission_cents: "467356",
  upcoming_trip_count: 5,
  at_risk_cents: "2558",
  disputed_count: 1,
  trailing_12_cents: "385818",
  prior_12_cents: "96144",
};

function month(monthStart: string, cents: string) {
  return { month_start: monthStart, received_cents: cents, line_count: cents === "0" ? 0 : 1 };
}

const MONTHS = [
  "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
  "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01",
].map((m, i) => month(m, i === 6 ? "100000" : i === 11 ? "4000" : "0"));

const LEDGER_ROW = {
  commission_id: "01a0b1c2-d300-7000-8000-000000000077",
  trip_id: "0195a2c0-1a00-7000-8000-000000000302",
  trip_title: "Getaway #2",
  trip_archived: false,
  client_id: "c1",
  client_display_name: "Noah Castillo",
  supplier_id: "0195a2c0-1a00-7000-8000-000000000030",
  supplier_name: "Sandals Resorts",
  start_date: "2026-06-29",
  end_date: "2026-07-06",
  gross_booking_cents: "270000",
  commission_pct: 12,
  expected_commission_cents: "32400",
  processing_fee_cents: "0",
  received_commission_cents: "32400",
  currency: "USD",
  status: "received",
  received_at: "2026-09-04",
  inteletravel_reference: "ITV-2026-1188",
  as_of_date: "2026-10-11",
  total_count: 19,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("dashboardTiles", () => {
  it("draws the prototype's four, in its order and tones", () => {
    const tiles = dashboardTiles(DASH);
    expect(tiles.map((t) => [t.label, t.accent])).toEqual([
      ["YTD received", "secondary"],
      ["Expected · 90d", "primary"],
      ["At risk", "surface"],
      ["Avg rate", "tertiary"],
    ]);
  });

  it("formats each figure and its second line", () => {
    const [ytd, upcoming, risk, rate] = dashboardTiles(DASH);
    expect(ytd.value).toBe("$3,068");
    expect(ytd.sub).toBe("+275% vs last year");
    expect(upcoming.value).toBe("$4,674");
    expect(upcoming.sub).toBe("5 trips");
    expect(risk.value).toBe("$26");
    expect(risk.sub).toBe("1 disputed");
    expect(rate.value).toBe("12.1%");
    expect(rate.sub).toBe("+0.1 pts vs last year");
  });

  it("says nothing about change when last year had nothing to change from", () => {
    const [ytd, , , rate] = dashboardTiles({
      ...DASH,
      ly_received_cents: "0",
      ly_avg_rate_pct: null,
    });
    expect(ytd.sub).toBeNull();
    expect(rate.sub).toBeNull();
  });

  it("renders no rate as an explanation, not 0%", () => {
    const rate = dashboardTiles({ ...DASH, avg_rate_pct: null })[3];
    expect(rate.value).toBeNull();
    expect(rate.unavailable).toBe("Nothing received yet this year.");
  });

  it("links At risk to the disputed lines, and only when there are some", () => {
    expect(dashboardTiles(DASH)[2].href).toBe("/agent/commission/ledger?status=disputed");
    expect(dashboardTiles({ ...DASH, disputed_count: 0, at_risk_cents: "0" })[2].href).toBeNull();
    // The others would drill to lists that sum to something else.
    for (const t of [0, 1, 3]) expect(dashboardTiles(DASH)[t].href ?? null).toBeNull();
  });

  it("names the quiet states in words", () => {
    const [, upcoming, risk] = dashboardTiles({
      ...DASH,
      upcoming_commission_cents: "0",
      upcoming_trip_count: 0,
      at_risk_cents: "0",
      disputed_count: 0,
    });
    expect(upcoming.sub).toBe("Nothing priced in the next 90 days");
    expect(risk.sub).toBe("Nothing disputed");
  });

  it("uses a true minus sign for a fall", () => {
    const [ytd] = dashboardTiles({ ...DASH, ytd_received_cents: "50000", ly_received_cents: "100000" });
    expect(ytd.sub).toBe("−50% vs last year");
  });

  it("says 'No change' rather than '±0%' when nothing moved", () => {
    const [ytd, , , rate] = dashboardTiles({
      ...DASH,
      ytd_received_cents: "81794",
      avg_rate_pct: 12.04,
      ly_avg_rate_pct: 12.0,
    });
    expect(ytd.sub).toBe("No change vs last year");
    // 0.04 points rounds to 0.0 — still no change, not "+0.0 pts".
    expect(rate.sub).toBe("No change vs last year");
  });
});

describe("dashboardMonths", () => {
  it("labels each month, marks the last as current, and scales to the tallest", () => {
    const months = dashboardMonths(MONTHS, "USD");
    expect(months).toHaveLength(12);
    expect(months[0].label).toBe("Nov");
    expect(months[11].longLabel).toBe("October 2026");
    expect(months.filter((m) => m.isCurrent).map((m) => m.monthStart)).toEqual(["2026-10-01"]);
    // The tallest bar leaves headroom; a small one is never invisible; an empty one is flat.
    expect(months[6].heightPct).toBe(93);
    expect(months[11].heightPct).toBeGreaterThanOrEqual(2);
    expect(months[0].heightPct).toBe(0);
    expect(months[6].amountLabel).toBe("$1,000");
  });

  it("draws twelve flat bars when nothing arrived", () => {
    const months = dashboardMonths(MONTHS.map((m) => ({ ...m, received_cents: "0" })), "USD");
    expect(months.every((m) => m.heightPct === 0)).toBe(true);
  });
});

describe("loadCommissionDashboard", () => {
  it("is null when a read fails", async () => {
    mocks.callAgentRead.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect(await loadCommissionDashboard()).toBeNull();
  });

  it("is null for a caller the accessor does not recognise as an agent", async () => {
    // No row is "not an agent". An agent with an empty ledger gets one row of zeros.
    mocks.callAgentRead.mockResolvedValue({ ok: true, rows: [] });
    expect(await loadCommissionDashboard()).toBeNull();
  });

  it("builds the tiles, the chart and the trend chip", async () => {
    mocks.callAgentRead.mockImplementation((read: string) =>
      Promise.resolve({ ok: true, rows: read === "agent_commission_dashboard" ? [DASH] : MONTHS }),
    );
    const d = await loadCommissionDashboard();
    expect(d?.tiles).toHaveLength(4);
    expect(d?.months).toHaveLength(12);
    expect(d?.anyReceived).toBe(true);
    expect(d?.trendChange).toBe("+301% vs the 12 months before");
  });

  it("leaves the trend chip off when the prior year had nothing", async () => {
    mocks.callAgentRead.mockImplementation((read: string) =>
      Promise.resolve({
        ok: true,
        rows: read === "agent_commission_dashboard" ? [{ ...DASH, prior_12_cents: "0" }] : MONTHS,
      }),
    );
    expect((await loadCommissionDashboard())?.trendChange).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ledgerRow", () => {
  it("formats a line", () => {
    expect(ledgerRow(LEDGER_ROW)).toEqual({
      commissionId: LEDGER_ROW.commission_id,
      lineHref: `/agent/commission/ledger/${LEDGER_ROW.commission_id}`,
      tripTitle: "Getaway #2",
      tripHref: `/agent/trips/${LEDGER_ROW.trip_id}`,
      tripArchived: false,
      clientName: "Noah Castillo",
      supplierName: "Sandals Resorts",
      travelLabel: "Jun 29, 2026",
      grossLabel: "$2,700",
      rateLabel: "12%",
      commissionLabel: "$324",
      status: "received",
      statusChip: "booked",
      statusLabel: "Received",
    });
  });

  it("keeps an archived trip's line but does not link it", () => {
    const row = ledgerRow({ ...LEDGER_ROW, trip_archived: true });
    expect(row.tripHref).toBeNull();
    expect(row.tripArchived).toBe(true);
  });

  it("shows an unknown status as itself on a colourless chip, not as another status", () => {
    const row = ledgerRow({ ...LEDGER_ROW, status: "written_off" });
    expect(row.statusLabel).toBe("written_off");
    expect(row.statusChip).toBe("unknown");
  });

  it("draws an undated trip as undated rather than as the epoch", () => {
    expect(ledgerRow({ ...LEDGER_ROW, start_date: null }).travelLabel).toBeNull();
  });
});

describe("rateLabel / travelDateLabel", () => {
  it("drops trailing zeros and keeps real decimals", () => {
    expect(rateLabel(12)).toBe("12%");
    expect(rateLabel("12.50")).toBe("12.5%");
    expect(rateLabel(13.75)).toBe("13.75%");
  });

  it("formats a calendar date without shifting it a day", () => {
    // Read at noon UTC: midnight would land on Dec 31 for any reader west of Greenwich.
    expect(travelDateLabel("2027-01-01")).toBe("Jan 1, 2027");
  });
});

describe("loadCommissionLedger", () => {
  function arrange(rows: unknown[], summary: unknown[], suppliers: unknown[]) {
    mocks.callAgentRead.mockImplementation((read: string) =>
      Promise.resolve({
        ok: true,
        rows: read === "agent_commission_ledger"
          ? rows
          : read === "agent_commission_ledger_summary" ? summary : suppliers,
      }),
    );
  }

  const SUMMARY = {
    expected_count: 5, invoiced_count: 2, received_count: 10,
    disputed_count: 1, lost_count: 1, total_count: 19,
  };
  const SUPPLIERS = [
    { supplier_id: "s1", supplier_name: "Allianz Travel", line_count: 2 },
    { supplier_id: "s2", supplier_name: "Sandals Resorts", line_count: 17 },
  ];

  it("is null when any of the three reads fails", async () => {
    mocks.callAgentRead.mockImplementation((read: string) =>
      Promise.resolve(read === "agent_commission_ledger_suppliers"
        ? { ok: false, kind: "unavailable" }
        : { ok: true, rows: [] }),
    );
    expect(await loadCommissionLedger(EMPTY_LEDGER_QUERY)).toBeNull();
  });

  it("passes the query through, with no status filter meaning every status", async () => {
    arrange([LEDGER_ROW], [SUMMARY], SUPPLIERS);
    await loadCommissionLedger({ ...EMPTY_LEDGER_QUERY, page: 3, supplierId: "s2" });
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_commission_ledger", {
      p_status: null,
      p_supplier_id: "s2",
      p_trip_id: null,
      p_travel_from: null,
      p_travel_to: null,
      p_limit: 25,
      p_offset: 50,
    });
  });

  it("reads the total off a row, the counts off the summary, and pages from the total", async () => {
    arrange([LEDGER_ROW], [SUMMARY], SUPPLIERS);
    const ledger = await loadCommissionLedger(EMPTY_LEDGER_QUERY);
    expect(ledger?.total).toBe(19);
    expect(ledger?.pageCount).toBe(1);
    expect(ledger?.counts).toEqual({ expected: 5, invoiced: 2, received: 10, disputed: 1, lost: 1 });
    expect(ledger?.suppliers.map((s) => s.name)).toEqual(["Allianz Travel", "Sandals Resorts"]);
  });

  it("is an empty ledger, not a failure, when there are no lines", async () => {
    arrange([], [{ ...SUMMARY, total_count: 0 }], []);
    const ledger = await loadCommissionLedger(EMPTY_LEDGER_QUERY);
    expect(ledger).not.toBeNull();
    expect(ledger?.rows).toEqual([]);
    expect(ledger?.total).toBe(0);
  });

  it("names the trip only when filtered to one", async () => {
    arrange([LEDGER_ROW], [SUMMARY], SUPPLIERS);
    expect((await loadCommissionLedger(EMPTY_LEDGER_QUERY))?.tripTitle).toBeNull();
    expect(
      (await loadCommissionLedger({ ...EMPTY_LEDGER_QUERY, tripId: LEDGER_ROW.trip_id }))?.tripTitle,
    ).toBe("Getaway #2");
  });

  it("keeps the view model JSON-safe", async () => {
    arrange([LEDGER_ROW], [SUMMARY], SUPPLIERS);
    const ledger = await loadCommissionLedger(EMPTY_LEDGER_QUERY);
    expect(JSON.parse(JSON.stringify(ledger))).toEqual(ledger);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3.7.3 / §3.7.4
// ─────────────────────────────────────────────────────────────────────────────

const LINE_ROW = {
  commission_id: "c1",
  trip_id: "t1",
  trip_title: "Kyoto in the spring",
  trip_status: "booked",
  trip_archived: false,
  trip_start_date: "2026-12-10",
  trip_end_date: "2026-12-22",
  booked_on: "2026-08-01",
  client_id: "cl1",
  client_display_name: "Maya Carter",
  supplier_id: "s1",
  supplier_name: "Sandals Resorts",
  gross_booking_cents: "1140000",
  commission_pct: 12,
  expected_commission_cents: "136800",
  processing_fee_cents: "0",
  received_commission_cents: "0",
  currency: "USD",
  payment_terms: "after_travel",
  payment_lag_days: 60,
  expected_payment_date: "2027-02-20",
  status: "expected",
  received_at: null,
  inteletravel_reference: null,
  notes: null,
  version: 3,
  can_remove: true,
  as_of_date: "2026-10-11",
};

describe("lineView", () => {
  it("draws the prototype's header and the expectation card", () => {
    const v = lineView(LINE_ROW);
    expect(v.heading).toBe("Sandals Resorts · Kyoto in the spring · $1,368 expected");
    expect(v.termsLine).toBe("Sandals Resorts · 60 days after travel");
    expect(v.expectationLine).toBe("Expected around Feb 20, 2027.");
    expect(v.tripHref).toBe("/agent/trips/t1");
    expect(v.canRemove).toBe(true);
  });

  it("seeds the edit form with dollars and the payment form with expected-in-full today", () => {
    const v = lineView(LINE_ROW);
    expect(v.lineValues).toMatchObject({ gross: "11400.00", rate: "12", paymentLagDays: "60" });
    expect(v.paymentValues).toEqual({
      status: "received", received: "1368.00", fee: "0.00", receivedAt: "2026-10-11",
    });
    expect(v.paidLine).toBeNull();
  });

  it("a paid line shows what arrived, and the payment form starts from it", () => {
    const v = lineView({
      ...LINE_ROW,
      status: "disputed",
      received_commission_cents: "130000",
      processing_fee_cents: "1200",
      received_at: "2027-02-21",
      can_remove: false,
    });
    expect(v.paidLine).toBe("Received $1,300 on Feb 21, 2027, after a $12 fee.");
    expect(v.paymentValues).toEqual({
      status: "disputed", received: "1300.00", fee: "12.00", receivedAt: "2027-02-21",
    });
  });

  it("says why there is no date yet, by which anchor is missing", () => {
    expect(lineView({ ...LINE_ROW, expected_payment_date: null }).expectationLine)
      .toBe("No date yet: the trip has no end date.");
    expect(lineView({ ...LINE_ROW, payment_terms: "at_booking", expected_payment_date: null }).expectationLine)
      .toBe("No date yet: the trip has not been booked.");
  });

  it("does not link an archived trip", () => {
    expect(lineView({ ...LINE_ROW, trip_archived: true }).tripHref).toBeNull();
  });
});

describe("loadCommissionLine", () => {
  it("tells not-found from a failed read", async () => {
    mocks.callAgentRead.mockResolvedValueOnce({ ok: true, rows: [] });
    expect(await loadCommissionLine("c1")).toEqual({ ok: false, reason: "not-found" });
    mocks.callAgentRead.mockResolvedValueOnce({ ok: false, kind: "unavailable" });
    expect(await loadCommissionLine("c1")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("searchTripsForLine", () => {
  it("searches every live stage — a cancelled trip can owe a lost line", async () => {
    mocks.callAgentRead.mockResolvedValueOnce({ ok: true, rows: [] });
    await searchTripsForLine("kyoto");
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_trip_roster", expect.objectContaining({
      p_status: ["inquiry", "proposal", "booked", "in_progress", "completed", "cancelled"],
      p_search: "kyoto",
    }));
  });
});

describe("loadAddLineForm", () => {
  it("builds the prefill from the trip's components, by supplier", async () => {
    mocks.callAgentRead.mockImplementation((read: string) => Promise.resolve({
      ok: true,
      rows: read === "agent_trip_overview"
        ? [{ trip_id: "t1", title: "Kyoto", client_display_name: "Maya Carter" }]
        : read === "agent_trip_components"
          ? [
              { supplier_id: "s1", cost_cents: "100000", commission_pct: 12 },
              { supplier_id: null, cost_cents: "900000", commission_pct: 10 },
            ]
          : [{ supplier_id: "s1", name: "Sandals Resorts", kind: "resort", default_commission_pct: 12,
               commission_payment_terms: "after_travel", commission_payment_lag_days: 30 }],
    }));
    const result = await loadAddLineForm("t1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form.prefill).toEqual({ s1: { grossCents: 100000, rate: 12 } });
    expect(result.form.suppliers[0].suppliers[0]).toMatchObject({
      paymentTerms: "after_travel", paymentLagDays: 30,
    });
  });

  it("is not-found for a trip the overview does not return", async () => {
    mocks.callAgentRead.mockImplementation(() => Promise.resolve({ ok: true, rows: [] }));
    expect(await loadAddLineForm("nope")).toEqual({ ok: false, reason: "not-found" });
  });
});
