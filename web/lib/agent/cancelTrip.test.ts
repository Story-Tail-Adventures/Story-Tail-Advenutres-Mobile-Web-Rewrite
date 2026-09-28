import { describe, expect, it } from "vitest";

import {
  cancelImpact,
  isRefundStatusValue,
  REFUND_STATUS_OPTIONS,
  refundStatusLabel,
} from "./cancelTrip";
import type { TripDetailOverview } from "./tripDetail";

/**
 * §3.4.16's impact list and refund vocabulary.
 *
 * The impact list is the part worth testing, and not because it is complicated. Two of the
 * four lines the prototype hardcodes are FALSE of this system, and a list of reassuring
 * sentences on a cancellation screen is exactly the kind of thing that ships unread. These
 * assertions are what stop the false ones coming back.
 */

const BASE: TripDetailOverview = {
  tripId: "t1",
  clientId: "c1",
  clientName: "Jordan Hayes",
  title: "Anniversary Week in Negril",
  tripType: "all_inclusive",
  status: "booked",
  startLabel: "Dec 4",
  endLabel: "Dec 11",
  destinations: ["Negril, Jamaica"],
  travelerCount: 6,
  totalValueLabel: "$12,845",
  totalPaidLabel: "$0",
  totalCommissionLabel: "$0",
  cancellationReason: null,
  refundStatus: null,
  refundDetail: null,
  notes: null,
  version: 3,
  cardOnFile: null,
  lastActivityLabel: null,
  componentCount: 0,
  manualComponentCount: 0,
  apiComponentCount: 0,
  today: "2026-09-28",
  nextUnpaidDueDate: null,
};

describe("the refund vocabulary", () => {
  it("is the four the database CHECK constrains, and no more", () => {
    // Mirrors `trip_refund_status_vocabulary` (20261001100000) and REFUND_STATUSES in
    // supabase/functions/_shared/trip.ts. Three copies of four strings; each side pins its
    // own, because SQL, Deno and the browser bundle cannot share one definition.
    expect(REFUND_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "none_expected",
      "pending",
      "partial",
      "full",
    ]);
  });

  it("does not contain an empty string — 'not stated' is NULL, not a fifth status", () => {
    // The dialog's placeholder option carries "" and the action drops it. If "" ever became
    // a member, "the advisor has not checked" and "the advisor checked and none is coming"
    // would collapse into one value, and the client's screen would show a confident "no
    // refund" for every trip cancelled before this shipped.
    // Widened deliberately: TypeScript already refuses `o.value === ""` against the literal
    // union, which is the stronger guarantee — but a compile error is not a test, and the
    // day somebody types the option list as `string[]` the compile-time proof evaporates
    // with nothing left running. This keeps a runtime assertion under that.
    const values: readonly string[] = REFUND_STATUS_OPTIONS.map((o) => o.value);
    expect(values.includes("")).toBe(false);
    expect(isRefundStatusValue("")).toBe(false);
  });

  it("labels a stored value, and refuses to echo one it does not know", () => {
    expect(refundStatusLabel("partial")).toBe("Partial");
    expect(refundStatusLabel(null)).toBeNull();
    // The prose the column held before it had a vocabulary. Echoing it would put the old
    // free text back on screen dressed as a label.
    expect(refundStatusLabel("Refunded $1,640 on Feb 12")).toBeNull();
  });
});

describe("the impact list", () => {
  it("says nothing at all for a trip with nothing attached", () => {
    expect(cancelImpact(BASE)).toEqual([]);
  });

  it("names the commission the forecast is about to lose", () => {
    const lines = cancelImpact({ ...BASE, totalCommissionLabel: "$1,318" });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toContain("$1,318");
    // True since 20260930140000: the forecast sums open trips, and cancelled is not one.
    expect(lines[0]?.text).toMatch(/forecast/i);
  });

  it("warns that cancelling does not move money", () => {
    const lines = cancelImpact({ ...BASE, totalPaidLabel: "$2,560" });
    expect(lines[0]?.tone).toBe("warn");
    expect(lines[0]?.text).toContain("$2,560");
    expect(lines[0]?.text).toMatch(/does not move money/i);
  });

  it("says the card authorization STAYS, which is the opposite of the prototype", () => {
    // agent-trip.jsx:588 draws "Card authorization will be revoked". Nothing revokes it —
    // there is no revoke path on the agent side at all, §3.6 owns that and is unbuilt.
    // Rendering the prototype's sentence would be a promise the code does not keep, on a
    // payment surface. FAILS IF anybody restores it.
    const lines = cancelImpact({ ...BASE, cardOnFile: "Visa ·8431" });
    const card = lines.find((l) => l.text.includes("8431"));
    expect(card?.text).toMatch(/stays authorized/i);
    expect(card?.text).not.toMatch(/will be revoked/i);
    expect(card?.tone).toBe("warn");
  });

  it("never invents a supplier cancellation fee", () => {
    // The prototype's "Sandals cancellation fee · $120 per policy" has nothing behind it:
    // no column in the schema stores a supplier cancellation fee. Omitted, not guessed.
    const lines = cancelImpact({
      ...BASE,
      totalPaidLabel: "$2,560",
      totalCommissionLabel: "$1,318",
      cardOnFile: "Visa ·8431",
      componentCount: 6,
    });
    for (const line of lines) {
      expect(line.text).not.toMatch(/cancellation fee/i);
    }
  });

  it("tells the advisor the suppliers have not been told", () => {
    const lines = cancelImpact({ ...BASE, componentCount: 6 });
    expect(lines[0]?.text).toMatch(/does not tell any supplier/i);
    expect(lines[0]?.text).toContain("6 booked items");
  });

  it("pluralises one booked item", () => {
    const lines = cancelImpact({ ...BASE, componentCount: 1 });
    expect(lines[0]?.text).toContain("1 booked item");
    expect(lines[0]?.text).not.toContain("items");
  });

  it("reads a formatted money label rather than re-parsing it as a number", () => {
    // `totalPaidLabel` has already been through formatTripMoney, so it carries a symbol and
    // separators. Number("$1,000") is NaN and parseInt("$1,000") is NaN too; a naive parse
    // would drop this line entirely. The check is "does any digit here mean something".
    expect(cancelImpact({ ...BASE, totalPaidLabel: "$1,000" })).toHaveLength(1);
    expect(cancelImpact({ ...BASE, totalPaidLabel: "$0" })).toHaveLength(0);
    expect(cancelImpact({ ...BASE, totalPaidLabel: "$0.00" })).toHaveLength(0);
    expect(cancelImpact({ ...BASE, totalPaidLabel: "—" })).toHaveLength(0);
  });
});
