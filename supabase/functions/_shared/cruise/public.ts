/**
 * The public read of the cruise catalog — Screen Inventory 2.3.4 / 2.0.4 in Cruises mode.
 *
 * THIS ANSWERS THE QUESTION 20260909001124 DEFERRED "to the search work", and the answer is
 * the same shape as hotels for a different reason. That migration named two candidates: an
 * `anon` SELECT policy gated on a published flag, or a service-role read from a Next.js
 * server component. The second is barred outright — the service-role key must never appear
 * under `web/`. The first would work, but it means granting `anon` a seat at these tables
 * forever, and `supabase/tests/rls_cruise_catalog.sql` currently asserts something stronger
 * and more useful: that NOBODY gets through. Keeping that invariant is worth an extra hop.
 *
 * So the read runs here, on the service role, behind the same caller token the hotel search
 * uses, and the tables keep zero anon exposure.
 *
 * THE LEAD PRICE NEVER LEAVES THIS FILE. `cruise_sailing.lead_price_cents` exists and is
 * classified Internal (Data-Model §24.4), and Free-Travel-APIs §4.7 is explicit: launch
 * without a fare on the public surface, because it re-opens §1.3.4 and §9.2 and it goes
 * stale on a page nobody is watching. It is not selected, and `PublicSailing` has no field
 * for it — the same structural technique the hotel mapper uses for booking-site names.
 */
import type { Db } from "../db.ts";

/** What a public cruise card may show. No fare, by construction. */
export interface PublicSailing {
  id: string;
  title: string;
  line: string | null;
  ship: string | null;
  departureDate: string;
  nights: number | null;
  destinations: string[];
  /** Ports in call order, for the itinerary line. */
  ports: string[];
}

export interface SailingQuery {
  /** Free text matched against title, line, ship and destinations. */
  destination?: string;
  /** Earliest departure, `YYYY-MM-DD`. Defaults to today. */
  from?: string;
  /** Latest departure. */
  to?: string;
  minNights?: number;
  maxNights?: number;
  limit: number;
}

/**
 * Only the columns a card needs.
 *
 * Written out rather than `select("*")` for the same reason the mapper is an allow-list: a
 * column added by a later migration — a fare, a margin, a provider blob — would otherwise
 * arrive on a public page without anybody deciding it should. `provider_payload` in
 * particular is the raw upstream body and must never be served.
 */
const COLUMNS =
  "id, title, departure_date, duration_nights, destinations, cruise_line:cruise_line_id (name), cruise_ship:ship_id (name)";

export async function searchSailings(db: Db, query: SailingQuery): Promise<PublicSailing[]> {
  let q = db
    .from("cruise_sailing")
    .select(COLUMNS)
    // Archived rows are sailings the provider stopped listing. They stay for referential
    // integrity and must not be offered.
    .is("archived_at", null)
    .gte("departure_date", query.from ?? new Date().toISOString().slice(0, 10))
    .order("departure_date", { ascending: true })
    .limit(query.limit);

  if (query.to) q = q.lte("departure_date", query.to);
  if (query.minNights) q = q.gte("duration_nights", query.minNights);
  if (query.maxNights) q = q.lte("duration_nights", query.maxNights);

  if (query.destination) {
    // Matched across the sailing's own text and its destination array. The provider's
    // `destinations` is text[], so `cs` (contains) would need an exact element; `ilike` on
    // the title plus an array-overlap on a normalised needle is what actually finds
    // "caribbean" in a row titled "7 Night Eastern Caribbean".
    const needle = query.destination.replace(/[%_,]/g, " ").trim();
    if (needle) q = q.or(`title.ilike.%${needle}%,destinations.cs.{"${needle}"}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(`sailing search failed: ${error.message}`);

  const rows = (data ?? []) as unknown as SailingRow[];
  if (rows.length === 0) return [];

  const ports = await portsFor(db, rows.map((r) => r.id));
  return rows.map((row) => mapSailing(row, ports.get(row.id) ?? []));
}

interface SailingRow {
  id: string;
  title: string | null;
  departure_date: string;
  duration_nights: number | null;
  destinations: string[] | null;
  cruise_line: { name: string | null } | null;
  cruise_ship: { name: string | null } | null;
}

/**
 * Port calls for a page of sailings, in one query rather than one per row.
 *
 * `port_name` is denormalised onto the call by the sync, so this does not need to join
 * `cruise_port` — which matters because a port row may not exist for every call.
 */
async function portsFor(db: Db, sailingIds: string[]): Promise<Map<string, string[]>> {
  const { data, error } = await db
    .from("cruise_port_call")
    .select("sailing_id, port_name, sequence")
    .in("sailing_id", sailingIds)
    .order("sequence", { ascending: true });

  const out = new Map<string, string[]>();
  if (error || !data) return out;

  for (const call of data) {
    const name = typeof call.port_name === "string" ? call.port_name.trim() : "";
    if (!name) continue;
    const list = out.get(call.sailing_id) ?? [];
    // Consecutive duplicates are a real shape in cruise itineraries — an overnight in port
    // is two calls at the same place — and reading "Nassau · Nassau · Miami" looks broken.
    if (list[list.length - 1] !== name) list.push(name);
    out.set(call.sailing_id, list);
  }
  return out;
}

export function mapSailing(row: SailingRow, ports: string[]): PublicSailing {
  return {
    id: row.id,
    title: (row.title ?? "").trim() || "Cruise",
    line: row.cruise_line?.name?.trim() || null,
    ship: row.cruise_ship?.name?.trim() || null,
    departureDate: row.departure_date,
    nights: typeof row.duration_nights === "number" ? row.duration_nights : null,
    destinations: (row.destinations ?? []).filter((d): d is string => typeof d === "string").slice(0, 6),
    ports: ports.slice(0, 12),
  };
}
