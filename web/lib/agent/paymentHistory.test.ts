import { describe, expect, it } from "vitest";

import { historyWhen, shortLink, toPaymentHistory, type RawPaymentHistoryRow } from "./paymentHistory";

const row = (over: Partial<RawPaymentHistoryRow>): RawPaymentHistoryRow => ({
  event_id: "e1",
  occurred_at: "2026-05-02T21:05:00Z",
  event_type: "payment_milestone.link_set",
  milestone_id: "m1",
  milestone_label: "Final balance",
  actor_name: "Gyasi Story",
  metadata: {},
  ...over,
});

describe("shortLink", () => {
  it("is the site name plus the path", () => {
    expect(shortLink("https://www.sandals.com/pay/SRB-220119")).toBe("sandals.com/pay/SRB-220119");
    expect(shortLink("https://travefy.com/")).toBe("travefy.com");
    expect(shortLink(null)).toBeNull();
    expect(shortLink("http://sandals.com/x")).toBeNull();
  });
});

describe("historyWhen", () => {
  it("formats in the advisor's own zone", () => {
    expect(historyWhen("2026-05-02T21:05:00Z", "America/Chicago")).toBe("May 2 · 4:05 PM");
  });
  it("falls back to UTC on a zone name it does not know", () => {
    expect(historyWhen("2026-05-02T21:05:00Z", "Not/AZone")).toBe("May 2 · 9:05 PM");
  });
});

describe("toPaymentHistory", () => {
  const map = (r: RawPaymentHistoryRow) => toPaymentHistory([r], "UTC")[0];

  it("reads a link added, flagging a Travefy invoice", () => {
    const e = map(row({ metadata: { pay_url: "https://www.travefy.com/invoice/st-4471", host: "travefy.com" } }));
    expect(e.kind).toBe("added");
    expect(e.kindLabel).toBe("Link added");
    expect(e.detail).toBe("travefy.com/invoice/st-4471 (Travefy invoice)");
  });

  it("reads a link change as old → new", () => {
    const e = map(
      row({
        event_type: "payment_milestone.link_changed",
        metadata: {
          old_pay_url: "https://www.sandals.com/pay/SRB-220118",
          new_pay_url: "https://www.sandals.com/pay/SRB-220119",
        },
      }),
    );
    expect(e.kind).toBe("changed");
    expect(e.detail).toBe("sandals.com/pay/SRB-220118 → sandals.com/pay/SRB-220119");
  });

  it("reads a link removed from the old link", () => {
    const e = map(row({ event_type: "payment_milestone.link_removed", metadata: { old_pay_url: "https://viator.com/" } }));
    expect(e.kind).toBe("removed");
    expect(e.detail).toBe("viator.com");
  });

  it("reads a paid mark with its amount and confirmation number", () => {
    const e = map(
      row({
        event_type: "payment_milestone.marked_paid",
        metadata: { new_paid_cents: "150000", paid_reference: "SRB-220119-MID", status: "paid" },
      }),
    );
    expect(e.kind).toBe("paid");
    expect(e.chip).toBe("booked");
    expect(e.detail).toBe("$1,500 · conf. SRB-220119-MID");
  });

  it("reads the Edge Function's older status_changed rows by the status they landed on", () => {
    expect(map(row({ event_type: "payment_milestone.status_changed", metadata: { status: "paid", paid_cents: 80000 } })))
      .toMatchObject({ kind: "paid", detail: "$800" });
    expect(map(row({ event_type: "payment_milestone.status_changed", metadata: { status: "overdue" } })))
      .toMatchObject({ kind: "status", detail: "Overdue" });
  });

  it("reads a cleared payment as prior → new status", () => {
    const e = map(
      row({ event_type: "payment_milestone.payment_cleared", metadata: { prior_status: "paid", status: "scheduled" } }),
    );
    expect(e.kind).toBe("cleared");
    expect(e.detail).toBe("Paid → Scheduled");
  });

  it("never shows a blank name or label", () => {
    const e = map(row({ actor_name: null, milestone_label: null }));
    expect(e.who).toBe("System");
    expect(e.milestoneLabel).toBe("A removed payment");
  });
});
