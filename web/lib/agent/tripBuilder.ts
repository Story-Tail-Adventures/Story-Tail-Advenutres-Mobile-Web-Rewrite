import { callAgentRead, type AgentSupplierRow } from "@/lib/agent/api";

/**
 * §3.4.4's own loader — the one read the builder needs that §3.4.2 did not.
 *
 * Everything else the workspace renders already has a loader: `loadTripOverview` backs the
 * header and the totals, `loadTripComponents` backs the canvas AND (through
 * `TripComponentRow.edit`) the pre-filled sheet. This file is here for the supplier picker
 * and for the grouping the picker needs, not to duplicate either of those.
 *
 * SERVER-SIDE. `components.ts` is the server-free half and holds the field spec the client
 * form reads; this half touches `callAgentRead` and must never be imported by a
 * `"use client"` component.
 */

export type SupplierOption = {
  supplierId: string;
  name: string;
  /** The advisor-facing kind label, already humanised — "Cruise line", not "cruise_line". */
  kindLabel: string;
  /** Null when the supplier has no rate on file, which is different from a rate of zero. */
  defaultCommissionPct: number | null;
};

export type SupplierGroup = { kindLabel: string; suppliers: SupplierOption[] };

/**
 * `supplier_kind`'s eight values, spelled the way an advisor says them.
 *
 * A `Record` rather than a replace-underscores-and-capitalise helper, because "hotel_brand"
 * is "Hotel brand" but "cruise_line" is "Cruise line" and "other" is "Other" — and because
 * an enum value this map does not know should show up as itself rather than as a crash.
 */
const SUPPLIER_KIND_LABELS: Record<string, string> = {
  airline: "Airlines",
  hotel_brand: "Hotel brands",
  resort: "Resorts",
  cruise_line: "Cruise lines",
  tour_operator: "Tour operators",
  insurance: "Insurance",
  transfer: "Transfers",
  other: "Other",
};

function kindLabel(kind: string): string {
  return SUPPLIER_KIND_LABELS[kind] ?? kind;
}

/**
 * Every supplier on file, grouped by kind for the picker's `<optgroup>`s.
 *
 * GROUPED, NOT FILTERED. `agent_suppliers()` takes no kind — see the migration's comment:
 * filtering by `supplier_kind` makes a resort filed as `hotel_brand` unpickable on the one
 * sheet that needs it, and a kind nobody has on file yet opens an empty picker that reads
 * as a broken control. Grouping gets the scanning benefit and loses neither.
 *
 * `null` means the READ failed. An agency with no suppliers is an empty array, which is a
 * real state and one the sheet renders as "Not on file" alone.
 */
export async function loadSuppliers(): Promise<SupplierGroup[] | null> {
  const res = await callAgentRead<AgentSupplierRow>("agent_suppliers");
  if (!res.ok) return null;

  const groups: SupplierGroup[] = [];
  // The accessor already orders by kind then name, so one pass keeps that order rather
  // than imposing the label map's.
  for (const row of res.rows) {
    const label = kindLabel(row.kind);
    let group = groups.find((g) => g.kindLabel === label);
    if (!group) {
      group = { kindLabel: label, suppliers: [] };
      groups.push(group);
    }
    group.suppliers.push({
      supplierId: row.supplier_id,
      name: row.name,
      kindLabel: label,
      defaultCommissionPct: row.default_commission_pct,
    });
  }
  return groups;
}
