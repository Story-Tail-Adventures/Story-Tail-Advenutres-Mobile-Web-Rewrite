import { PAYMENTS_COPY } from "@/lib/agent/content";
import { formatTripMoney } from "@/lib/trips/money";
import { paySiteName } from "@/lib/trips/payLink";

/**
 * §3.6.6 Payment History's view model (ruled 2026-10-16). P1, web only.
 *
 * SERVER-FREE, like `payments.ts`: the mapping is pure so the tests can pin every event
 * shape, and the loader in `tripDetail.ts` only fetches.
 *
 * Read from `audit_event` rows that `agent_set_milestone_pay_url` and
 * `agent_set_milestone_paid` write (supabase/migrations/20261021120000_supplier_pay_links.sql),
 * plus the `payment_milestone.status_changed` rows the Edge Function wrote before 2026-10-16.
 * `paid_note` never reaches audit metadata, so nothing here can show it.
 */

export type PaymentHistoryKind =
  | "paid"
  | "waived"
  | "cleared"
  | "status"
  | "added"
  | "changed"
  | "removed";

export type PaymentHistoryEntry = {
  eventId: string;
  whenLabel: string;
  kind: PaymentHistoryKind;
  kindLabel: string;
  /** The StatusChip palette kind (Design-System §4.3), as the A366 artboard maps them. */
  chip: string;
  milestoneId: string | null;
  milestoneLabel: string;
  detail: string;
  who: string;
};

export type RawPaymentHistoryRow = {
  event_id: string;
  occurred_at: string;
  event_type: string;
  milestone_id: string | null;
  milestone_label: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown> | null;
};

const KIND: Record<PaymentHistoryKind, { label: string; chip: string }> = {
  paid: { label: PAYMENTS_COPY.historyKindPaid, chip: "booked" },
  waived: { label: PAYMENTS_COPY.historyKindWaived, chip: "past" },
  cleared: { label: PAYMENTS_COPY.historyKindCleared, chip: "due" },
  status: { label: PAYMENTS_COPY.historyKindStatus, chip: "past" },
  added: { label: PAYMENTS_COPY.historyKindAdded, chip: "traveling" },
  changed: { label: PAYMENTS_COPY.historyKindChanged, chip: "proposal" },
  removed: { label: PAYMENTS_COPY.historyKindRemoved, chip: "past" },
};

const STATUS_WORD: Record<string, string> = {
  scheduled: "Scheduled",
  paid: "Paid",
  overdue: "Overdue",
  waived: "Waived",
};

function text(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** "sandals.com/pay/SRB-220119": the site name plus the path, so two links on one site differ. */
export function shortLink(url: string | null): string | null {
  const site = paySiteName(url);
  if (!site || !url) return null;
  const path = new URL(url).pathname.replace(/\/+$/, "");
  return `${site}${path}`;
}

function isTravefy(url: string | null): boolean {
  const site = paySiteName(url);
  return site !== null && (site === "travefy.com" || site.endsWith(".travefy.com"));
}

function moneyText(cents: string | null): string | null {
  if (cents === null || !/^\d+$/.test(cents)) return null;
  // The business is USD only, and the audit row carries no currency.
  return formatTripMoney(Number(cents), "USD");
}

/** "May 2 · 4:05 PM" in the advisor's own zone. Falls back to UTC on a bad zone name. */
export function historyWhen(timestamp: string, timeZone: string): string {
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) return timestamp;
  const format = (zone: string) =>
    `${new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }).format(at)} · ${new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at).replace(/\u202f/g, " ")}`;
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

function classify(row: RawPaymentHistoryRow): PaymentHistoryKind {
  const status = text(row.metadata, "status");
  switch (row.event_type) {
    case "payment_milestone.link_set":
      return "added";
    case "payment_milestone.link_changed":
      return "changed";
    case "payment_milestone.link_removed":
      return "removed";
    case "payment_milestone.marked_paid":
      return "paid";
    case "payment_milestone.marked_waived":
      return "waived";
    case "payment_milestone.payment_cleared":
      return "cleared";
    default:
      // The Edge Function's rows from before 2026-10-16 were all `status_changed`, with the
      // status the row landed on. Read them by that status so old paid marks still say so.
      if (status === "paid") return "paid";
      if (status === "waived") return "waived";
      return "status";
  }
}

function detailFor(kind: PaymentHistoryKind, meta: Record<string, unknown> | null): string {
  switch (kind) {
    case "added": {
      const url = text(meta, "pay_url");
      const link = shortLink(url) ?? text(meta, "host") ?? "";
      return isTravefy(url) ? `${link} ${PAYMENTS_COPY.historyTravefy}` : link;
    }
    case "changed": {
      const from = shortLink(text(meta, "old_pay_url")) ?? text(meta, "old_host") ?? "";
      const to = shortLink(text(meta, "new_pay_url")) ?? text(meta, "new_host") ?? "";
      return `${from} → ${to}`;
    }
    case "removed":
      return shortLink(text(meta, "old_pay_url")) ?? text(meta, "old_host") ?? "";
    case "paid": {
      const amount = moneyText(text(meta, "new_paid_cents") ?? text(meta, "paid_cents"));
      const ref = text(meta, "paid_reference");
      return [amount, ref ? PAYMENTS_COPY.historyConf(ref) : null].filter(Boolean).join(" · ");
    }
    case "waived":
      return STATUS_WORD.waived;
    case "cleared":
    case "status": {
      const prior = text(meta, "prior_status");
      const status = text(meta, "status");
      const to = status ? (STATUS_WORD[status] ?? status) : "";
      return prior ? `${STATUS_WORD[prior] ?? prior} → ${to}` : to;
    }
  }
}

export function toPaymentHistory(rows: readonly RawPaymentHistoryRow[], timeZone: string): PaymentHistoryEntry[] {
  return rows.map((row) => {
    const kind = classify(row);
    return {
      eventId: row.event_id,
      whenLabel: historyWhen(row.occurred_at, timeZone),
      kind,
      kindLabel: KIND[kind].label,
      chip: KIND[kind].chip,
      milestoneId: row.milestone_id,
      milestoneLabel: row.milestone_label ?? PAYMENTS_COPY.historyDeleted,
      detail: detailFor(kind, row.metadata),
      who: row.actor_name ?? PAYMENTS_COPY.historyUnknownActor,
    };
  });
}
