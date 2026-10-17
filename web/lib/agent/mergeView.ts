/**
 * §3.9.7 / §3.3.11 Merge duplicate records. Rulings: docs/Screen-Inventory.md §3.9, "Merge
 * (PR 2), ruled now".
 *
 * ONE READ, `agent_client_merge_view`, which answers `{needsMfa}` and nothing else until the
 * session is aal2 (checked in the database from the verified JWT). Every default, the pinned
 * email and the sign-in plan come from the SQL (`client_merge_preview`), and the
 * `account-admin` Edge Function's `merge` op recomputes them under its locks, so nothing here
 * decides what the merge does. This file only turns values into words.
 *
 * PURE: no server imports, so the picker's client island can import it. The loader is
 * `merge.ts`.
 */

import { MERGE_COPY as C } from "@/lib/agent/content";

type Counts = {
  trips: number;
  conversations: number;
  notes: number;
  companions: number;
  documents: number;
  travelDocuments: number;
  commissions: number;
};

/** `client_merge_summary()`, as the SQL builds it. */
export type MergeSummaryRow = {
  clientId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: string;
  archived: boolean;
  version: number;
  address: string | null;
  counts: Counts;
  signIn: { accountId: string; email: string | null; locked: boolean } | null;
};

export type MergeFieldRow = {
  field: string;
  source: "client" | "preference";
  keepValue: unknown;
  retireValue: unknown;
  default: "keep" | "retire";
  pinned: boolean;
  same: boolean;
};

export type MergeViewRow = {
  needsMfa: boolean;
  agentHasFactor?: boolean;
  client?: MergeSummaryRow;
  candidates?: {
    clientId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    archived: boolean;
    trips: number;
    createdAt: string;
    reason: "email" | "phone" | "name" | "search";
  }[];
  preview?: {
    keep: MergeSummaryRow;
    retire: MergeSummaryRow;
    signInPlan: "none" | "keep" | "move" | "lock_retired";
    pinnedEmail: string | null;
    blocked: "kept_archived" | "companion_cap" | null;
    fields: MergeFieldRow[];
  } | null;
};

export type MergeSide = {
  clientId: string;
  name: string;
  firstName: string;
  version: number;
  line: string;
  signIn: string;
  archived: boolean;
};

export type MergeField = {
  field: string;
  label: string;
  keep: string;
  retire: string;
  pick: "keep" | "retire";
  pinned: boolean;
};

export type MergeCandidate = {
  clientId: string;
  name: string;
  email: string | null;
  line: string;
  reason: string;
  archived: boolean;
};

export type MergeView =
  | { kind: "needs-mfa"; agentHasFactor: boolean }
  | { kind: "pick"; client: MergeSide; candidates: MergeCandidate[] }
  | { kind: "not-mergeable"; client: MergeSide }
  | {
      kind: "preview";
      keep: MergeSide;
      retire: MergeSide;
      /** Only the details that differ; the rest are counted in `sameCount`. */
      fields: MergeField[];
      sameCount: number;
      /** "5 trips, 2 conversations, 1 note", or null when nothing is attached. */
      moves: string | null;
      plan: string | null;
      blocked: string | null;
    };

function joined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function side(s: MergeSummaryRow): MergeSide {
  return {
    clientId: s.clientId,
    name: `${s.firstName} ${s.lastName}`.trim(),
    firstName: s.firstName,
    version: s.version,
    line: C.summaryLine(s.counts.trips, joined(s.createdAt)),
    signIn: s.signIn?.email ? C.signsIn(s.signIn.email) : C.noSignIn,
    archived: s.archived,
  };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/** The confirm step's counts, in the ruling's words: "3 trips, 2 conversations, 5 notes". */
export function movesLine(counts: Counts): string | null {
  const parts = [
    counts.trips ? plural(counts.trips, "trip", "trips") : null,
    counts.conversations ? plural(counts.conversations, "conversation", "conversations") : null,
    counts.notes ? plural(counts.notes, "note", "notes") : null,
    counts.companions ? plural(counts.companions, "companion", "companions") : null,
    counts.documents ? plural(counts.documents, "document", "documents") : null,
    counts.travelDocuments ? plural(counts.travelDocuments, "travel document", "travel documents") : null,
  ].filter((p): p is string => p !== null);
  return parts.length ? parts.join(", ") : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * One value as the picker shows it. jsonb columns have no schema in Postgres, so every shape is
 * read defensively. A loyalty NUMBER is never shown, as on the Overview tab (`clientDetail.ts`):
 * it is an account credential, and the program name is what the advisor is choosing between.
 */
export function formatMergeValue(field: string, value: unknown, address: string | null): string {
  if (field === "mailing_address_id") return value ? address || C.blank : C.blank;
  if (value === null || value === undefined) return C.blank;
  if (field === "date_of_birth" && typeof value === "string") {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  if (field === "emergency_contact") {
    if (!isRecord(value) || typeof value.name !== "string") return C.blank;
    return [value.name, value.relationship, value.phone].filter((p) => typeof p === "string" && p).join(" · ");
  }
  if (field === "important_dates") {
    if (!Array.isArray(value)) return C.blank;
    const out = value
      .filter(isRecord)
      .map((d) => [d.label, d.date].filter((p) => typeof p === "string" && p).join(" "))
      .filter(Boolean);
    return out.length ? out.join(", ") : C.blank;
  }
  if (field === "loyalty_programs") {
    if (!Array.isArray(value)) return C.blank;
    const out = value.filter(isRecord).map((p) => (typeof p.program === "string" ? p.program : "")).filter(Boolean);
    return out.length ? out.join(", ") : C.blank;
  }
  if (Array.isArray(value)) {
    const out = value.filter((v) => typeof v === "string" && v.trim());
    return out.length ? out.join(", ") : C.blank;
  }
  if (typeof value === "string") return value.trim() ? value : C.blank;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // An object in a column with no known shape: nothing readable to show.
  return C.blank;
}

const REASONS: Record<string, string> = {
  email: C.reasonEmail,
  phone: C.reasonPhone,
  name: C.reasonName,
  search: C.reasonSearch,
};

const BLOCKED: Record<string, string> = {
  kept_archived: C.blockedArchived,
  companion_cap: C.blockedCompanions,
};

export function toMergeView(row: MergeViewRow, withOther: boolean): MergeView {
  if (row.needsMfa || !row.client) return { kind: "needs-mfa", agentHasFactor: Boolean(row.agentHasFactor) };
  const client = side(row.client);

  if (!withOther) {
    return {
      kind: "pick",
      client,
      candidates: (row.candidates ?? []).map((c) => ({
        clientId: c.clientId,
        name: `${c.firstName} ${c.lastName}`.trim(),
        email: c.email,
        line: C.summaryLine(c.trips, joined(c.createdAt)),
        reason: REASONS[c.reason] ?? C.reasonName,
        archived: c.archived,
      })),
    };
  }

  const p = row.preview;
  if (!p) return { kind: "not-mergeable", client };

  const keep = side(p.keep);
  const retire = side(p.retire);
  const shown = p.fields.filter((f) => !f.same);
  return {
    kind: "preview",
    keep,
    retire,
    fields: shown.map((f) => ({
      field: f.field,
      label: C.fields[f.field] ?? f.field,
      keep: formatMergeValue(f.field, f.keepValue, p.keep.address),
      retire: formatMergeValue(f.field, f.retireValue, p.retire.address),
      pick: f.default,
      pinned: f.pinned,
    })),
    sameCount: p.fields.length - shown.length,
    moves: movesLine(p.retire.counts),
    plan:
      p.signInPlan === "move"
        ? p.retire.signIn?.locked ? C.planMoveLocked(retire.firstName) : C.planMove(retire.firstName)
        : p.signInPlan === "lock_retired" ? C.planLock(keep.firstName)
        : null,
    blocked: p.blocked ? BLOCKED[p.blocked] ?? null : null,
  };
}

/** The confirm step's "record you'll have": each shown detail as it will end up. */
export function mergedValues(fields: MergeField[], picks: Record<string, "keep" | "retire">) {
  return fields.map((f) => {
    const pick = f.pinned ? f.pick : picks[f.field] ?? f.pick;
    return { label: f.label, value: pick === "retire" ? f.retire : f.keep };
  });
}

/** Only the flips: anything not named takes the SQL's default, which it recomputes itself. */
export function changedChoices(fields: MergeField[], picks: Record<string, "keep" | "retire">) {
  const out: Record<string, "keep" | "retire"> = {};
  for (const f of fields) {
    const pick = picks[f.field];
    if (!f.pinned && pick && pick !== f.pick) out[f.field] = pick;
  }
  return out;
}
