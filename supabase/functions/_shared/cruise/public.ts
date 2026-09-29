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

/**
 * A ship photo and the attribution that may not be separated from it.
 *
 * ONE OBJECT RATHER THAN FOUR FIELDS, and that is the whole point of the shape. The photos
 * are CC BY / CC BY-SA, so the credit is a licence condition rather than a nicety, and
 * `cruise_ship_image_attributed` already enforces the pair in Postgres. Nesting them carries
 * that guarantee up the stack: there is no way to spell a sailing that has a `url` and no
 * `credit`, so no JSX can render the photo bare. Same structural technique this file uses to
 * keep the fare off the card — the type simply has nowhere to put the unlawful thing.
 */
export interface ShipImage {
  url: string;
  /** Pre-rendered, and already carries the licence: "Kiran891 / Wikimedia Commons, CC BY-SA 4.0". */
  credit: string;
  /** Commons' LicenseShortName, structured, for a caller that wants it apart from the credit. */
  license: string | null;
  /** The Commons file page. What the credit line should link to. */
  sourceUrl: string | null;
}

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
  /** The ship's curated photo, or null. Never a bare URL — see `ShipImage`. */
  shipImage: ShipImage | null;
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
  "id, title, departure_date, duration_nights, destinations, cruise_line:cruise_line_id (name), " +
  "cruise_ship:ship_id (name, image_url, image_credit, image_license, image_source_url)";

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
  cruise_ship:
    | {
      name: string | null;
      image_url: string | null;
      image_credit: string | null;
      image_license: string | null;
      image_source_url: string | null;
    }
    | null;
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
    shipImage: mapShipImage(row.cruise_ship),
  };
}

/**
 * The photo, only if it is lawful to show.
 *
 * DROPS THE PHOTO WHEN THE CREDIT IS MISSING rather than serving it uncredited.
 * `cruise_ship_image_attributed` means that pair cannot be half-set today, so on the happy
 * path this branch is unreachable — which is the reason to write it. The constraint lives in
 * a migration someone can relax; the licence obligation does not go away when they do, and a
 * silently missing photo is the right failure for a breach that would otherwise be invisible.
 *
 * NO HOST CHECK HERE, deliberately. Hotel photography needs one at the mapper because it
 * arrives over the wire from a provider; these arrive by migration, so the equivalent layer
 * is `cruise_ship_image_host` on the column itself. `web/lib/public/cruises.ts` still repeats
 * it, for the reason that file gives: the custom next/image loader means whatever reaches
 * `<Image src>` is fetched by the visitor's browser from the origin we named.
 */
function mapShipImage(ship: SailingRow["cruise_ship"]): ShipImage | null {
  const url = ship?.image_url?.trim();
  const credit = ship?.image_credit?.trim();
  if (!url || !credit) return null;
  return {
    url,
    credit,
    license: ship?.image_license?.trim() || null,
    sourceUrl: ship?.image_source_url?.trim() || null,
  };
}
