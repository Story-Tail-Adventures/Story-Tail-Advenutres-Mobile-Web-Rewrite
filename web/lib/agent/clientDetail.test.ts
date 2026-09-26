import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.3.2 – §3.3.8's view models.
 *
 * WHAT THIS FILE PINS, and why each one is invisible until it is wrong:
 *
 *  1. THE THREE-ARMED OVERVIEW. "No such client" and "not yours" are one answer from the
 *     accessor, on purpose, and both must reach the screen as `not-found` rather than as an
 *     error — a mistyped URL is neither our fault nor retryable.
 *  2. NULL MEANS THE READ FAILED. An empty tab is an empty array. A client with no
 *     documents and a documents read that fell over need different screens.
 *  3. A NULL CURRENCY IS A DASH, NOT "$0.00".
 *  4. THE PROTOTYPE'S INVENTED FIELDS STAY DROPPED. There is no surprise flag on an
 *     important date, and a loyalty NUMBER is never rendered.
 *  5. PLAIN DATA, because every one of these crosses into a component.
 */

const mocks = vi.hoisted(() => ({ callAgentRead: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  loadClientActivity,
  loadClientCompanions,
  loadClientDocuments,
  loadClientNotes,
  loadClientOverview,
  loadClientThreads,
  loadClientTrips,
} from "./clientDetail";

const OVERVIEW = {
  client_id: "c1",
  display_name: "Belle Fitzwilliam-Castellanos",
  first_name: "Annabelle",
  last_name: "Fitzwilliam-Castellanos",
  preferred_name: "Belle",
  email: "annabelle.fc@example.com",
  phone: "+1-555-0194",
  date_of_birth: "1988-04-17",
  status: "active",
  tags: ["vip"],
  important_dates: [{ label: "Anniversary", date: "2026-09-14", recurring: true }],
  emergency_contact: { name: "Dominic", phone: "+1-555-0100", relationship: "spouse" },
  address_line1: "1400 Lakeview Terrace",
  address_line2: null,
  address_city: "Chicago",
  address_region: "IL",
  address_postal_code: "60640",
  address_country: "US",
  notes: "Prefers a villa.",
  version: 1,
  created_at: "2024-03-01T00:00:00Z",
  archived_at: null,
  preferred_destinations: ["Caribbean"],
  travel_styles: ["resort"],
  dietary_restrictions: ["pescatarian"],
  dietary_notes: "Shellfish is a hard no.",
  accessibility_needs: [],
  accessibility_notes: null,
  loyalty_programs: [{ program: "AAdvantage", number: "SECRET123", tier: "Platinum" }],
  budget_band: "premium",
  favorite_past_trips: "Turks.",
  lifetime_value_cents: "2480000",
  lifetime_currency: "USD",
  lifetime_currency_count: 1,
  commission_cents: "297600",
  trip_count: 1,
  active_trip_count: 1,
  note_count: 3,
  document_count: 0,
  last_contact_at: "2026-09-26T12:00:00Z",
  as_of_date: "2026-09-26",
};

function arrange(rows: unknown[]) {
  mocks.callAgentRead.mockResolvedValue({ ok: true, rows });
}
function fail() {
  mocks.callAgentRead.mockResolvedValue({ ok: false, kind: "unavailable" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }),
  });
});

describe("loadClientOverview", () => {
  it("distinguishes a failed read from a client that is not there", async () => {
    fail();
    expect(await loadClientOverview("c1")).toEqual({ ok: false, reason: "unavailable" });

    arrange([]);
    expect(await loadClientOverview("c1")).toEqual({ ok: false, reason: "not-found" });
  });

  it("formats the money and the since line", async () => {
    arrange([OVERVIEW]);
    const r = await loadClientOverview("c1");
    if (!r.ok) throw new Error("expected ok");
    expect(r.overview.lifetimeLabel).toContain("24,800");
    expect(r.overview.commissionLabel).toContain("2,976");
    expect(r.overview.sinceLabel).toBe("Mar 2024");
  });

  it("gives a client with nothing committed a dash rather than $0.00", async () => {
    arrange([{ ...OVERVIEW, lifetime_currency: null, lifetime_value_cents: "0", commission_cents: "0" }]);
    const r = await loadClientOverview("c1");
    if (!r.ok) throw new Error("expected ok");
    expect(r.overview.lifetimeLabel).toBeNull();
    expect(r.overview.commissionLabel).toBeNull();
  });

  it("builds initials from the NAME PARTS, not the display name", async () => {
    // `preferred_name` replaces the first name in display_name, so "Belle F-C" would give
    // BF where the record is Annabelle's.
    arrange([OVERVIEW]);
    const r = await loadClientOverview("c1");
    if (!r.ok) throw new Error("expected ok");
    expect(r.overview.initials).toBe("AF");
  });

  it("never exposes a loyalty NUMBER — the programme and tier are what a booking needs", async () => {
    arrange([OVERVIEW]);
    const r = await loadClientOverview("c1");
    if (!r.ok) throw new Error("expected ok");
    expect(r.overview.loyaltyPrograms).toEqual([{ program: "AAdvantage", tier: "Platinum" }]);
    expect(JSON.stringify(r.overview)).not.toContain("SECRET123");
  });

  it("keeps important dates to {label, date, recurring} — there is no surprise flag", async () => {
    arrange([
      {
        ...OVERVIEW,
        important_dates: [
          { label: "Anniversary", date: "2026-09-14", recurring: true, surprise: true },
          { nonsense: 1 },
          null,
        ],
      },
    ]);
    const r = await loadClientOverview("c1");
    if (!r.ok) throw new Error("expected ok");
    // The malformed entries cost their own rows, not the card.
    expect(r.overview.importantDates).toEqual([
      { label: "Anniversary", date: "2026-09-14", recurring: true },
    ]);
  });

  it("survives jsonb that is not an array at all", async () => {
    arrange([{ ...OVERVIEW, important_dates: null, loyalty_programs: null, emergency_contact: null }]);
    const r = await loadClientOverview("c1");
    if (!r.ok) throw new Error("expected ok");
    expect(r.overview.importantDates).toEqual([]);
    expect(r.overview.loyaltyPrograms).toEqual([]);
    expect(r.overview.emergencyContact).toBeNull();
  });

  it("assembles one address line and reports its absence honestly", async () => {
    arrange([OVERVIEW]);
    const a = await loadClientOverview("c1");
    if (!a.ok) throw new Error("expected ok");
    expect(a.overview.addressLine).toBe("1400 Lakeview Terrace, Chicago, IL 60640");

    arrange([{ ...OVERVIEW, address_line1: null, address_city: null, address_region: null }]);
    const b = await loadClientOverview("c1");
    if (!b.ok) throw new Error("expected ok");
    expect(b.overview.addressLine).toBeNull();
  });
});

describe("the six list loaders", () => {
  it("return null on a failed read and an empty array on an empty tab", async () => {
    for (const load of [
      loadClientCompanions, loadClientTrips, loadClientThreads,
      loadClientDocuments, loadClientNotes, loadClientActivity,
    ]) {
      fail();
      expect(await load("c1"), load.name).toBeNull();
      arrange([]);
      expect(await load("c1"), load.name).toEqual([]);
    }
  });
});

describe("loadClientTrips", () => {
  const TRIP = {
    trip_id: "t1",
    title: "Maldives, overwater",
    trip_type: "all_inclusive",
    status: "booked",
    start_date: "2027-04-24",
    end_date: "2027-05-04",
    destinations: ["Malé, Maldives"],
    traveler_count: 2,
    total_value_cents: "2480000",
    total_paid_cents: "620000",
    total_commission_cents: "297600",
    currency: "USD",
    as_of_date: "2026-09-26",
  };

  it("buckets by end_date, not by status — a stale 'booked' in the past is Past", async () => {
    arrange([
      TRIP,
      { ...TRIP, trip_id: "t2", end_date: "2025-01-13", start_date: "2025-01-06" },
      { ...TRIP, trip_id: "t3", status: "cancelled" },
    ]);
    const trips = await loadClientTrips("c1");
    expect(trips?.map((t) => t.bucket)).toEqual(["active", "past", "cancelled"]);
  });

  it("formats a date range three ways", async () => {
    arrange([
      { ...TRIP, start_date: "2026-08-12", end_date: "2026-08-19" },
      { ...TRIP, trip_id: "t2", start_date: "2026-08-28", end_date: "2026-09-03" },
      { ...TRIP, trip_id: "t3", start_date: "2026-12-28", end_date: "2027-01-03" },
      { ...TRIP, trip_id: "t4", start_date: null, end_date: null },
    ]);
    const trips = await loadClientTrips("c1");
    expect(trips?.map((t) => t.datesLabel)).toEqual([
      "Aug 12 – 19, 2026",
      "Aug 28 – Sep 3, 2026",
      "Dec 28, 2026 – Jan 3, 2027",
      null,
    ]);
  });

  it("derives the status chip server-side from the agent's own today", async () => {
    arrange([TRIP]);
    const trips = await loadClientTrips("c1");
    expect(trips?.[0]?.statusChip).toBeTruthy();
    expect(trips?.[0]?.statusLabel).toBeTruthy();
  });
});

describe("loadClientCompanions", () => {
  const C = {
    companion_id: "cp1",
    first_name: "Dominic",
    last_name: "Castellanos",
    relationship: "spouse",
    date_of_birth: "1990-11-03",
    passport_expiry: "2027-02-14",
    passport_country: "US",
    linked_client_id: null,
    invited: true,
  };

  it("flags a passport expiring inside six months and leaves a distant one alone", async () => {
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 3);
    const far = new Date();
    far.setFullYear(far.getFullYear() + 3);

    arrange([
      { ...C, passport_expiry: soon.toISOString().slice(0, 10) },
      { ...C, companion_id: "cp2", passport_expiry: far.toISOString().slice(0, 10) },
      { ...C, companion_id: "cp3", passport_expiry: null },
    ]);
    const list = await loadClientCompanions("c1");
    expect(list?.map((c) => c.passportExpiringSoon)).toEqual([true, false, false]);
  });
});

describe("loadClientNotes", () => {
  const N = {
    note_id: "n1",
    body: "Wants a villa.",
    author_name: "Gyasi Story",
    author_is_me: true,
    created_at: "2026-09-14T10:00:00Z",
    updated_at: "2026-09-14T10:00:00Z",
  };

  it("marks a note edited only when updated_at actually moved", async () => {
    arrange([N, { ...N, note_id: "n2", updated_at: "2026-09-20T10:00:00Z" }]);
    const notes = await loadClientNotes("c1");
    expect(notes?.map((n) => n.edited)).toEqual([false, true]);
  });

  it("falls back to a name rather than rendering a blank author", async () => {
    arrange([{ ...N, author_name: null }]);
    const notes = await loadClientNotes("c1");
    expect(notes?.[0]?.authorName).toBe("Unknown");
  });
});

describe("loadClientThreads", () => {
  const T = {
    conversation_id: "cv1",
    trip_id: "t1",
    trip_title: "Maldives, overwater",
    subject: null,
    last_message_at: "2026-09-26T12:00:00Z",
    last_message_preview: "Sounds good.",
    agent_unread_count: 2,
    message_count: 5,
  };

  it("falls back to the trip when a thread has no subject", async () => {
    // `conversation.subject` is nullable, and a blank row is worse than a borrowed name.
    arrange([T, { ...T, conversation_id: "cv2", subject: "  " }, { ...T, conversation_id: "cv3", subject: "Upgrade" }]);
    const threads = await loadClientThreads("c1");
    expect(threads?.map((t) => t.subject)).toEqual([
      "Maldives, overwater",
      "Maldives, overwater",
      "Upgrade",
    ]);
  });
});

describe("loadClientDocuments", () => {
  const D = {
    document_id: "d1",
    kind: "passport",
    filename: "passport.pdf",
    mime_type: "application/pdf",
    size_bytes: "1153434",
    is_sensitive: true,
    trip_id: null,
    trip_title: null,
    created_at: "2026-09-01T00:00:00Z",
  };

  it("picks a badge from the mime type, falling back to the extension", async () => {
    arrange([
      D,
      { ...D, document_id: "d2", mime_type: "image/jpeg", filename: "p.jpg" },
      { ...D, document_id: "d3", mime_type: "application/octet-stream", filename: "x.bin" },
      { ...D, document_id: "d4", mime_type: "application/octet-stream", filename: "y.PDF" },
    ]);
    const docs = await loadClientDocuments("c1");
    expect(docs?.map((d) => d.badge)).toEqual(["PDF", "IMG", "DOC", "PDF"]);
  });

  it("formats a size, and refuses to invent one", async () => {
    arrange([
      { ...D, size_bytes: "900" },
      { ...D, document_id: "d2", size_bytes: "1153434" },
      { ...D, document_id: "d3", size_bytes: "0" },
      { ...D, document_id: "d4", size_bytes: "not-a-number" },
    ]);
    const docs = await loadClientDocuments("c1");
    expect(docs?.map((d) => d.sizeLabel)).toEqual(["900 B", "1.1 MB", "—", "—"]);
  });
});

describe("loadClientActivity", () => {
  const E = {
    event_id: "e1",
    event_type: "client.updated",
    target_entity: "client",
    target_id: "c1",
    actor_name: "Gyasi Story",
    actor_role: "agent",
    metadata: {},
    created_at: "2026-09-23T10:00:00Z",
  };

  it("turns the slug into a sentence, and never drops an unknown one", async () => {
    arrange([
      E,
      { ...E, event_id: "e2", event_type: "client.tag_added", metadata: { tag: "vip" } },
      { ...E, event_id: "e3", event_type: "trip.status_changed", metadata: { to: "in_progress" } },
      { ...E, event_id: "e4", event_type: "something.entirely_new", metadata: null },
    ]);
    const events = await loadClientActivity("c1");
    expect(events?.map((e) => e.description)).toEqual([
      "Client record updated",
      'Tagged "vip"',
      "Trip moved to in progress",
      "Something entirely new",
    ]);
  });

  it("only uses icon names icon-paths.ts actually defines", async () => {
    const defined = ["user", "card", "message", "shield", "check"];
    arrange([
      E,
      { ...E, event_id: "e2", event_type: "trip.status_changed" },
      { ...E, event_id: "e3", event_type: "card_authorization.revoked" },
      { ...E, event_id: "e4", event_type: "wholly.unknown" },
    ]);
    const events = await loadClientActivity("c1");
    for (const e of events ?? []) expect(defined).toContain(e.icon);
  });
});

describe("plain data", () => {
  it("every view model is JSON-safe, because all of them cross into components", async () => {
    arrange([OVERVIEW]);
    const overview = await loadClientOverview("c1");
    expect(JSON.parse(JSON.stringify(overview))).toEqual(overview);

    const walk = (value: unknown, path: string): void => {
      if (value === undefined) throw new Error(`undefined at ${path}`);
      if (value === null || typeof value !== "object") {
        expect(typeof value, path).not.toBe("function");
        return;
      }
      expect(value instanceof Date, path).toBe(false);
      expect(value instanceof Map, path).toBe(false);
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(overview, "overview");
  });
});
