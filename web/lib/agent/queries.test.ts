import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentInboxRow,
  AgentKpiRow,
  AgentPaymentRow,
  AgentRead,
  AgentTripRow,
} from "@/lib/agent/api";
import { AGENT_COPY } from "@/lib/agent/content";

/**
 * §3.2's three loaders.
 *
 * The module header names this file as the thing that holds its three rules; for a while it
 * named a file that did not exist, so every loader shipped untested while the comment said
 * otherwise. What is pinned here is what has already been wrong once:
 *
 *   MIXED CURRENCY. A column total that sums euros into dollars and then labels the result
 *   with the dominant code is the failure the read-surface migration calls "strictly worse
 *   than scoping none of them". The total is scoped and the exclusion is counted.
 *
 *   CANCELLED IS NOT A DEPARTURE. The board read filters archived trips and deliberately not
 *   cancelled ones, so every slice that means "who is travelling" has to say so itself.
 *
 *   NULL IS NOT ZERO. `commission_confidence_pct` and `inquiry_to_book_days` are NULL in
 *   exactly the cases the strip most needs to distinguish, and the generated types claim
 *   they are plain numbers.
 *
 *   THE AGENT'S ZONE. `last_message_at` is an instant, not a date. CI runs in UTC, so a test
 *   that does not name a zone cannot see this one at all.
 *
 *   PLAIN DATA. Every view model that could cross into a client component is walked for
 *   functions, `undefined`, `Date`, `Map` and `Set` — a JSON round-trip alone silently drops
 *   a function rather than failing.
 */

const mocks = vi.hoisted(() => ({
  callAgentRead: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { PIPELINE_STAGES, loadCalendar, loadPipeline, loadWorklist, localDate } from "./queries";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const KPI: AgentKpiRow = {
  agent_id: "0195a2c0-1a00-7000-8000-000000000001",
  as_of_date: "2026-09-21",
  currency: "USD",
  pipeline_value_cents: "1250000",
  booked_month_cents: "748000",
  commission_expected_cents: "94000",
  commission_weighted_cents: "61000",
  commission_confidence_pct: 65,
  inquiry_to_book_days: 12,
  inquiry_to_book_sample: 4,
  active_client_count: 7,
  active_trip_count: 3,
  new_inquiry_count: 2,
  unread_message_count: 1,
};

const TRIP: AgentTripRow = {
  trip_id: "0195a2c0-1a00-7000-8000-000000000041",
  client_id: "0195a2c0-1a00-7000-8000-000000000011",
  client_display_name: "Maya & Daniel Carter",
  title: "Cabo, Four Nights",
  trip_type: "leisure",
  status: "booked",
  status_changed_at: "2026-09-01T12:00:00+00:00",
  start_date: null,
  end_date: null,
  destinations: null,
  traveler_count: 2,
  total_value_cents: "500000",
  total_paid_cents: "0",
  total_commission_cents: "0",
  currency: "USD",
  notes: null,
  version: 1,
  proposal_sent_at: null,
  proposal_viewed_at: null,
  next_due_date: null,
  next_due_cents: null,
  next_due_currency: null,
  agent_unread_count: 0,
};

const PAYMENT: AgentPaymentRow = {
  milestone_id: "0195a2c0-1a00-7000-8000-000000000071",
  trip_id: TRIP.trip_id,
  trip_title: TRIP.title,
  client_id: TRIP.client_id,
  client_display_name: TRIP.client_display_name,
  kind: "supplier",
  label: "Final balance",
  amount_cents: "250000",
  paid_cents: "0",
  currency: "USD",
  due_date: "2026-09-25",
  status: "due",
  days_until: 4,
};

const MESSAGE: AgentInboxRow = {
  conversation_id: "0195a2c0-1a00-7000-8000-000000000091",
  client_id: TRIP.client_id,
  client_display_name: TRIP.client_display_name,
  trip_id: TRIP.trip_id,
  trip_title: TRIP.title,
  subject: null,
  last_message_at: "2026-09-21T15:00:00+00:00",
  last_message_preview: "Can we add a night?",
  agent_unread_count: 1,
};

const kpi = (over: Partial<AgentKpiRow> = {}): AgentKpiRow => ({ ...KPI, ...over });
const trip = (over: Partial<AgentTripRow> = {}): AgentTripRow => ({ ...TRIP, ...over });
const payment = (over: Partial<AgentPaymentRow> = {}): AgentPaymentRow => ({ ...PAYMENT, ...over });
const message = (over: Partial<AgentInboxRow> = {}): AgentInboxRow => ({ ...MESSAGE, ...over });

type Board = {
  agent_kpis?: AgentKpiRow[];
  agent_trip_board?: AgentTripRow[];
  agent_payments_due?: AgentPaymentRow[];
  agent_inbox?: AgentInboxRow[];
};

/** Every accessor answers; `failing` names the ones that come back unavailable instead. */
function reads(rows: Board, failing: AgentRead[] = []) {
  mocks.callAgentRead.mockImplementation(async (read: AgentRead) => {
    if (failing.includes(read)) return { ok: false, kind: "unavailable" };
    return { ok: true, rows: rows[read as keyof Board] ?? [] };
  });
}

/** `agentIdentity`'s one row. The time zone is the whole point of most of these tests. */
function identity(displayName = "Gyasi Story", timeZone = "America/Chicago") {
  mocks.createClient.mockResolvedValue({
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: { display_name: displayName, time_zone: timeZone }, error: null }) }),
    }),
  });
}

/**
 * Rule 1's real gate.
 *
 * `JSON.parse(JSON.stringify(x))` DROPS a function-valued key rather than throwing, and
 * `toEqual` then ignores an `undefined` property, so the round-trip alone can pass on a
 * model React's Flight serializer would reject. This walks the model instead and names the
 * path of anything that is not plain data.
 */
function notPlainData(value: unknown, path = "$"): string[] {
  if (value === null) return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => notPlainData(v, `${path}[${i}]`));
  switch (typeof value) {
    case "function":
    case "undefined":
    case "symbol":
    case "bigint":
      return [`${path}: ${typeof value}`];
    case "object": {
      if (value instanceof Date) return [`${path}: Date`];
      if (value instanceof Map || value instanceof Set) return [`${path}: ${value.constructor.name}`];
      return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        notPlainData(v, `${path}.${k}`),
      );
    }
    default:
      return [];
  }
}

function expectCrossesTheBoundary(vm: unknown) {
  expect(notPlainData(vm)).toEqual([]);
  expect(JSON.parse(JSON.stringify(vm))).toEqual(vm);
}

beforeEach(() => {
  identity();
  // `formatTripMoney` warns on any code outside its KNOWN list, which the EUR fixtures below
  // deliberately hit. Kept quiet here; the symbol it chooses is that module's business.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // NOT IN THE TEST BODY. `vi.setSystemTime` mocks Date for the whole FILE, and
  // `restoreAllMocks` does not undo it. While the reset sat as the last statement of the
  // test that set the clock, any assertion above it throwing left every later test in this
  // file running at a frozen 2026-09-22T00:30Z — silently, because nothing downstream
  // asserts on the current time today. The next time-dependent test added here would have
  // inherited it.
  vi.useRealTimers();
});

// ── The read/empty distinction the whole contract rests on ────────────────────

describe("a failed read is not an empty book", () => {
  it("returns null when any accessor is unavailable", async () => {
    reads({ agent_kpis: [kpi()] }, ["agent_trip_board"]);
    expect(await loadWorklist()).toBeNull();

    reads({ agent_kpis: [kpi()] }, ["agent_kpis"]);
    expect(await loadPipeline()).toBeNull();

    reads({ agent_kpis: [kpi()] }, ["agent_payments_due"]);
    expect(await loadCalendar()).toBeNull();
  });

  it("returns null when there is no KPI row at all, which means not an agent", async () => {
    reads({ agent_kpis: [] });
    expect(await loadWorklist()).toBeNull();
    expect(await loadPipeline()).toBeNull();
  });

  it("returns a populated object with empty sections for an empty book", async () => {
    reads({ agent_kpis: [kpi({ active_trip_count: 0, new_inquiry_count: 0, currency: null })] });

    const worklist = await loadWorklist();
    expect(worklist).not.toBeNull();
    expect(worklist?.proposalsAwaiting).toEqual([]);
    expect(worklist?.departingSoon).toEqual([]);
    expect(worklist?.needsYouCount).toBe(0);
  });
});

// ── C2: a column total sums its whole column ─────────────────────────────────
//
// This block used to assert that a total never MIXED currencies: each column summed only
// the cards in the agent's most-used currency and reported how many it set aside. Since
// 20260930100000 `trip_currency_usd` means every card is USD, so there is nothing to set
// aside and `excludedCount` is gone. What is still worth pinning is that the total covers
// the whole column and that the five stages come back in order.

describe("pipeline column totals", () => {
  it("sums every card in the column", async () => {
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [
        trip({ trip_id: "a", status: "proposal", total_value_cents: "1000000" }),
        trip({ trip_id: "b", status: "proposal", total_value_cents: "4000000" }),
      ],
    });

    const proposal = (await loadPipeline())?.columns.find((c) => c.status === "proposal");
    expect(proposal?.totalLabel).toBe("$50,000");
    expect(proposal?.count).toBe(2);
    expect(proposal?.cards).toHaveLength(2);
  });

  it("labels the total with the currency the accessor reported", async () => {
    // Not hard-coded to USD in the view model: `k.currency` is what the accessor said its
    // figures are denominated in, and the label follows it. A NULL there means the book
    // reached no money figure, and `money()` renders that as USD rather than throwing.
    reads({
      agent_kpis: [kpi({ currency: null })],
      agent_trip_board: [trip({ trip_id: "a", status: "booked", total_value_cents: "300000" })],
    });
    const booked = (await loadPipeline())?.columns.find((c) => c.status === "booked");
    expect(booked?.totalLabel).toBe("$3,000");
  });

  it("gives the five stages in order, each with its own cards", async () => {
    // A BOARD WITH CARDS IN IT. Against an empty board a per-column assertion passes for
    // essentially any expression put there, so every stage gets a card and the totals are
    // real answers rather than zeros that agree by accident.
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: PIPELINE_STAGES.map((st) =>
        trip({ trip_id: `t-${st.status}`, status: st.status, total_value_cents: "100000" }),
      ),
    });
    const pipeline = await loadPipeline();

    expect(pipeline?.columns.map((c) => c.status)).toEqual([
      "inquiry",
      "proposal",
      "booked",
      "in_progress",
      "completed",
    ]);
    expect(pipeline?.columns.every((c) => c.cards.length > 0)).toBe(true);
    expect(pipeline?.columns.map((c) => c.totalLabel)).toEqual([
      "$1,000",
      "$1,000",
      "$1,000",
      "$1,000",
      "$1,000",
    ]);
  });

  it("keeps cancelled off the board and counted beneath it", async () => {
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [
        trip({ trip_id: "live", status: "booked" }),
        trip({ trip_id: "gone", status: "cancelled" }),
      ],
    });

    const pipeline = await loadPipeline();
    expect(pipeline?.cancelledCount).toBe(1);
    expect(pipeline?.columns.flatMap((c) => c.cards.map((card) => card.tripId))).toEqual(["live"]);
  });
});

// ── C3: cancelled is a status, not a stage of travelling ──────────────────────

describe("cancelled trips", () => {
  it("are not travellers in the next 30 days", async () => {
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [
        trip({ trip_id: "going", status: "booked", start_date: "2026-09-29" }),
        trip({ trip_id: "cancelled", status: "cancelled", start_date: "2026-09-29" }),
        trip({ trip_id: "far-off", status: "booked", start_date: "2026-12-01" }),
      ],
    });

    const worklist = await loadWorklist();
    expect(worklist?.departingSoon.map((t) => t.tripId)).toEqual(["going"]);
  });

  it("draw neither a departure nor a return on the calendar", async () => {
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [
        trip({ trip_id: "going", status: "booked", start_date: "2026-09-29", end_date: "2026-10-03" }),
        trip({ trip_id: "cancelled", status: "cancelled", start_date: "2026-09-29", end_date: "2026-10-03" }),
      ],
    });

    const calendar = await loadCalendar();
    expect(calendar?.events.map((e) => e.id).sort()).toEqual(["dep-going", "ret-going"]);
  });

  it("draw no payment event either, on the read that does not know they are cancelled", async () => {
    // THIS TEST USED TO PIN THE HOLE. It asserted `["payment"]` and called the leftover
    // "their own read", which locked in a month grid that dropped a cancelled trip's
    // departure and return chips and kept its payment chip.
    //
    // `agent_payments_due` returns no trip status — it filters `archived_at` and the
    // milestone status, nothing else — so the loader cross-references the board read it is
    // already making. FAILS IF: `cancelledTripIds`'s `t.status === "cancelled"` becomes
    // `t.status !== "cancelled"` — one character, and the set holds every live trip
    // instead.
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [trip({ trip_id: "cancelled", status: "cancelled", start_date: "2026-09-29" })],
      agent_payments_due: [payment({ trip_id: "cancelled" })],
    });

    const calendar = await loadCalendar();
    expect(calendar?.events).toEqual([]);
  });

  it("keep a payment whose trip is not on the board at all — the filter fails open", async () => {
    // Both reads filter only `archived_at`, so a payment with no matching board row should
    // not happen. If it does, dropping the row on a guess is the worse error: a supplier
    // balance that vanishes is money nobody chases. FAILS IF: the filter inverts to keep
    // only the trips it recognises.
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [trip({ trip_id: "cancelled", status: "cancelled" })],
      agent_payments_due: [payment({ milestone_id: "orphan", trip_id: "not-on-the-board" })],
    });

    const calendar = await loadCalendar();
    expect(calendar?.events.map((e) => e.id)).toEqual(["pay-orphan"]);
  });

  it("are not a payment to settle, and do not inflate the count that leads the screen", async () => {
    // "Payments to settle" told the advisor to pay a supplier for a trip nobody is taking,
    // and `needsYouCount` — the first number on the worklist — counted it. FAILS IF:
    // `loadWorklist`'s `.filter((p) => !cancelled.has(p.trip_id))` drops its `!`, which
    // keeps exactly the wrong half.
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [
        trip({ trip_id: "live", status: "booked" }),
        trip({ trip_id: "gone", status: "cancelled" }),
      ],
      agent_payments_due: [
        payment({ milestone_id: "m-live", trip_id: "live" }),
        payment({ milestone_id: "m-gone", trip_id: "gone" }),
      ],
    });

    const worklist = await loadWorklist();
    expect(worklist?.paymentsDue.map((p) => p.milestoneId)).toEqual(["m-live"]);
    // One payment, no proposals, no inquiries. A stale milestone counted here is the count
    // at the top of the screen being wrong.
    expect(worklist?.needsYouCount).toBe(1);
  });

  it("do not stop an inquiry or a proposal from being a traveller", async () => {
    // Deliberate: a requested date is still a date, and the section means "who is
    // travelling", not "who has paid". Only cancelled is definitively not happening.
    reads({
      agent_kpis: [kpi()],
      agent_trip_board: [
        trip({ trip_id: "inq", status: "inquiry", start_date: "2026-09-30" }),
        trip({ trip_id: "prop", status: "proposal", start_date: "2026-10-02" }),
      ],
    });

    const worklist = await loadWorklist();
    expect(worklist?.departingSoon.map((t) => t.tripId)).toEqual(["inq", "prop"]);
  });
});

// ── F28: an instant is bucketed in the agent's zone, not UTC ──────────────────

describe("recent-message dates", () => {
  it("labels a late-evening Chicago message with the day it was sent there", async () => {
    // 19:30 on the 21st in Chicago is 00:30Z on the 22nd. Slicing the UTC string labelled
    // this "Sep 22" — a date that has not happened where he is reading it.
    reads({
      agent_kpis: [kpi()],
      agent_inbox: [message({ last_message_at: "2026-09-22T00:30:00+00:00" })],
    });
    identity("Gyasi Story", "America/Chicago");

    expect((await loadWorklist())?.recentMessages[0].timeLabel).toBe("Sep 21");
  });

  it("skews the other way for a zone ahead of UTC, and gets that right too", async () => {
    reads({
      agent_kpis: [kpi()],
      agent_inbox: [message({ last_message_at: "2026-09-20T23:30:00+00:00" })],
    });
    identity("Gyasi Story", "Asia/Tokyo");

    expect((await loadWorklist())?.recentMessages[0].timeLabel).toBe("Sep 21");
  });

  it("uses the same zone the greeting does", async () => {
    vi.setSystemTime(new Date("2026-09-22T00:30:00Z"));
    reads({
      agent_kpis: [kpi()],
      agent_inbox: [message({ last_message_at: "2026-09-22T00:30:00+00:00" })],
    });
    identity("Gyasi Story", "America/Chicago");

    const worklist = await loadWorklist();
    // 19:30 in Chicago: Evening, and the message is from today, not tomorrow.
    // FAILS IF: `partOfDayIn`'s `timeZone` argument is dropped, so the greeting reads the
    // server's UTC clock (00:30 → "Morning") while the message keeps the agent's zone.
    // The clock is reset in `afterEach`, not here — see the note there.
    expect(worklist?.partOfDay).toBe("Evening");
    expect(worklist?.recentMessages[0].timeLabel).toBe("Sep 21");
  });
});

describe("localDate", () => {
  it("crosses the date line in both directions", () => {
    expect(localDate("2026-09-22T00:30:00+00:00", "America/Chicago")).toBe("2026-09-21");
    expect(localDate("2026-09-20T23:30:00+00:00", "Asia/Tokyo")).toBe("2026-09-21");
    expect(localDate("2026-09-21T12:00:00+00:00", "UTC")).toBe("2026-09-21");
  });

  it("handles the DST boundary an offset table would get wrong", () => {
    // Chicago is CDT (−05:00) in September and CST (−06:00) in December. Both of these are
    // 23:30 local on the 15th; a fixed offset gets one of them wrong.
    expect(localDate("2026-09-16T04:30:00+00:00", "America/Chicago")).toBe("2026-09-15");
    expect(localDate("2026-12-16T05:30:00+00:00", "America/Chicago")).toBe("2026-12-15");
  });

  it("falls back to the UTC date rather than throwing on an unrecognised zone", () => {
    // Same trade as partOfDayIn: a wrong label beats a server component that does not render.
    expect(localDate("2026-09-22T00:30:00+00:00", "Mars/Olympus_Mons")).toBe("2026-09-22");
  });

  it("returns null for something that is not a timestamp", () => {
    expect(localDate("not a date", "America/Chicago")).toBeNull();
  });
});

// ── Rule 3: NULL is not zero ──────────────────────────────────────────────────

describe("the KPI strip tells an absence from a zero", () => {
  it("renders no confidence line when commission_confidence_pct is NULL", async () => {
    reads({ agent_kpis: [kpi({ commission_confidence_pct: null })] });
    const strip = (await loadWorklist())?.kpis ?? [];

    expect(strip.find((t) => t.id === "commission")?.sub).toBeNull();
    // Nowhere else on the strip either. A fabricated "0% confidence" is a claim where an
    // absence is the truth.
    expect(strip.map((t) => t.sub).join(" ")).not.toMatch(/0%/);
  });

  it("renders a real 0% when the figure genuinely is zero", async () => {
    reads({ agent_kpis: [kpi({ commission_confidence_pct: 0 })] });
    const commission = (await loadWorklist())?.kpis.find((t) => t.id === "commission");

    expect(commission?.sub).toBe("0% confidence");
  });

  it("says why the cycle time is missing rather than showing 0 d", async () => {
    reads({ agent_kpis: [kpi({ inquiry_to_book_days: null, inquiry_to_book_sample: 0 })] });
    const cycle = (await loadWorklist())?.kpis.find((t) => t.id === "cycle");

    expect(cycle?.value).toBeNull();
    expect(cycle?.unavailable).toBe(AGENT_COPY.cycleTimeUnavailable);
    expect(cycle?.sub).toBeNull();
  });

  it("shows a genuine zero-day cycle time as a value, not as an absence", async () => {
    reads({ agent_kpis: [kpi({ inquiry_to_book_days: 0, inquiry_to_book_sample: 1 })] });
    const cycle = (await loadWorklist())?.kpis.find((t) => t.id === "cycle");

    expect(cycle?.value).toBe("0 d");
    expect(cycle?.unavailable).toBeNull();
    expect(cycle?.sub).toBe("over 1 trip");
  });

  it("formats money against USD when there is no dominant currency to name", async () => {
    reads({ agent_kpis: [kpi({ currency: null, pipeline_value_cents: "1250000" })] });
    const pipeline = (await loadWorklist())?.kpis.find((t) => t.id === "pipeline");

    expect(pipeline?.value).toBe("$12,500");
  });
});

// ── Rule 1: everything that could cross the boundary is plain data ────────────

describe("the view models are plain data", () => {
  it("survives a JSON round trip, with no function, Date, Map or undefined anywhere", async () => {
    reads({
      agent_kpis: [kpi({ commission_confidence_pct: null, inquiry_to_book_days: null })],
      agent_trip_board: [
        trip({ trip_id: "p", status: "proposal", proposal_sent_at: "2026-09-10T12:00:00+00:00", start_date: "2026-09-29", end_date: "2026-10-03" }),
        trip({ trip_id: "i", status: "inquiry" }),
        trip({ trip_id: "x", status: "cancelled", start_date: "2026-09-29" }),
      ],
      agent_payments_due: [payment(), payment({ milestone_id: "m2", due_date: null, days_until: null })],
      agent_inbox: [message(), message({ conversation_id: "c2", last_message_preview: null })],
    });

    const worklist = await loadWorklist();
    const pipeline = await loadPipeline();
    const calendar = await loadCalendar();

    expect(worklist).not.toBeNull();
    expect(pipeline).not.toBeNull();
    expect(calendar).not.toBeNull();

    expectCrossesTheBoundary(worklist);
    expectCrossesTheBoundary(pipeline);
    expectCrossesTheBoundary(calendar);
  });

  it("catches the shapes a bare round trip would let through", () => {
    // The guard above is only worth having if it fails on these.
    expect(notPlainData({ nights: (n: number) => `${n} nights` })).toEqual(["$.nights: function"]);
    expect(notPlainData({ startedAt: new Date() })).toEqual(["$.startedAt: Date"]);
    expect(notPlainData({ byDate: new Map() })).toEqual(["$.byDate: Map"]);
    expect(notPlainData({ dueLabel: undefined })).toEqual(["$.dueLabel: undefined"]);
    expect(notPlainData({ cards: [{ id: "a" }, { fn: () => 1 }] })).toEqual(["$.cards[1].fn: function"]);
  });
});
