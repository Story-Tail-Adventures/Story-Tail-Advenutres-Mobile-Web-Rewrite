import { describe, expect, it } from "vitest";

import { MERGE_COPY } from "@/lib/agent/content";
import {
  changedChoices,
  formatMergeValue,
  type MergeSummaryRow,
  type MergeViewRow,
  mergedValues,
  movesLine,
  toMergeView,
} from "@/lib/agent/mergeView";

/**
 * §3.9.7 / §3.3.11 (ruled 2026-10-16). The SQL decides every default and the sign-in plan; this
 * checks the words, and that only the advisor's flips are sent back.
 */

const ZERO = { trips: 0, conversations: 0, notes: 0, companions: 0, documents: 0, travelDocuments: 0, commissions: 0 };

function summary(over: Partial<MergeSummaryRow> = {}): MergeSummaryRow {
  return {
    clientId: "k",
    firstName: "Maya",
    lastName: "Carter",
    email: "maya@example.com",
    createdAt: "2024-03-05T12:00:00Z",
    archived: false,
    version: 3,
    address: null,
    counts: ZERO,
    signIn: null,
    ...over,
  };
}

const PREVIEW: MergeViewRow = {
  needsMfa: false,
  client: summary(),
  preview: {
    keep: summary({ counts: { ...ZERO, trips: 1 } }),
    retire: summary({
      clientId: "r",
      lastName: "Carter-Reyes",
      version: 7,
      address: "12 Rua Augusta, Lisbon",
      counts: { ...ZERO, trips: 3, conversations: 2, notes: 5 },
      signIn: { accountId: "a", email: "maya.r@example.com", locked: false },
    }),
    signInPlan: "move",
    pinnedEmail: "maya.r@example.com",
    blocked: null,
    fields: [
      { field: "last_name", source: "client", keepValue: "Carter", retireValue: "Carter-Reyes", default: "keep", pinned: false, same: false },
      { field: "email", source: "client", keepValue: "maya@example.com", retireValue: "maya.r@example.com", default: "retire", pinned: true, same: false },
      { field: "phone", source: "client", keepValue: "305-555-0100", retireValue: "305-555-0100", default: "keep", pinned: false, same: true },
      { field: "mailing_address_id", source: "client", keepValue: null, retireValue: "addr-1", default: "retire", pinned: false, same: false },
    ],
  },
};

describe("toMergeView", () => {
  it("before aal2 it is only the gate", () => {
    expect(toMergeView({ needsMfa: true, agentHasFactor: true }, true)).toEqual({ kind: "needs-mfa", agentHasFactor: true });
  });

  it("draws only the details that differ and counts the rest", () => {
    const v = toMergeView(PREVIEW, true);
    if (v.kind !== "preview") throw new Error(v.kind);
    expect(v.fields.map((f) => f.field)).toEqual(["last_name", "email", "mailing_address_id"]);
    expect(v.sameCount).toBe(1);
    expect(v.fields[2]).toMatchObject({ keep: MERGE_COPY.blank, retire: "12 Rua Augusta, Lisbon", pick: "retire" });
  });

  it("says what moves in the ruling's words, and what happens to the sign-in", () => {
    const v = toMergeView(PREVIEW, true);
    if (v.kind !== "preview") throw new Error(v.kind);
    expect(v.moves).toBe("3 trips, 2 conversations, 5 notes");
    expect(v.plan).toBe(MERGE_COPY.planMove("Maya"));
    expect(v.retire.signIn).toBe("Signs in as maya.r@example.com");
    expect(v.keep.line).toBe("1 trip · joined Mar 2024");
  });

  it("a pair the SQL will not merge is its own state", () => {
    expect(toMergeView({ ...PREVIEW, preview: null }, true).kind).toBe("not-mergeable");
  });

  it("names a block in words", () => {
    const v = toMergeView({ ...PREVIEW, preview: { ...PREVIEW.preview!, blocked: "companion_cap" } }, true);
    expect(v.kind === "preview" && v.blocked).toBe(MERGE_COPY.blockedCompanions);
  });
});

describe("choices", () => {
  const v = toMergeView(PREVIEW, true);
  if (v.kind !== "preview") throw new Error(v.kind);

  it("sends only the flips, and never the pinned email", () => {
    expect(changedChoices(v.fields, { last_name: "retire", email: "keep", mailing_address_id: "retire" })).toEqual({
      last_name: "retire",
    });
  });

  it("the record you'll have follows the picks, with the email fixed", () => {
    expect(mergedValues(v.fields, { last_name: "retire", email: "keep" })).toEqual([
      { label: "Last name", value: "Carter-Reyes" },
      { label: "Email", value: "maya.r@example.com" },
      { label: "Mailing address", value: "12 Rua Augusta, Lisbon" },
    ]);
  });
});

describe("formatMergeValue", () => {
  it("never shows a loyalty number", () => {
    expect(formatMergeValue("loyalty_programs", [{ program: "Delta SkyMiles", number: "9912345678" }], null)).toBe(
      "Delta SkyMiles",
    );
  });

  it("reads jsonb defensively", () => {
    expect(formatMergeValue("emergency_contact", { name: "Sam", relationship: "Spouse", phone: "305" }, null)).toBe(
      "Sam · Spouse · 305",
    );
    expect(formatMergeValue("emergency_contact", "nonsense", null)).toBe(MERGE_COPY.blank);
    expect(formatMergeValue("important_dates", [{ label: "Anniversary", date: "06-12" }, 4], null)).toBe("Anniversary 06-12");
    expect(formatMergeValue("tags", [], null)).toBe(MERGE_COPY.blank);
    expect(formatMergeValue("date_of_birth", "1988-04-02", null)).toBe("Apr 2, 1988");
  });

  it("the counts line drops what is not there", () => {
    expect(movesLine({ ...ZERO, trips: 1, travelDocuments: 2 })).toBe("1 trip, 2 travel documents");
    expect(movesLine(ZERO)).toBeNull();
  });
});
