import {
  callAgentRead,
  type AgentClientRosterRow,
  type AgentClientSummaryRow,
} from "@/lib/agent/api";
import { agentIdentity, cents, money } from "@/lib/agent/queries";

/**
 * Screen 3.3.1's view models — the roster's own sibling to `queries.ts` and `tripDetail.ts`,
 * not folded into either.
 *
 * SAME THREE RULES AS ITS SIBLINGS: plain JSON-safe data out, formatting happens here
 * server-side in the agent's own time zone, and `null` from a loader means the READ failed.
 * An empty roster is a populated object with `rows: []`, never `null` — an agent with no
 * clients yet and an agent whose read fell over need different screens.
 */

/** The page size. Matches `agent_client_roster`'s own default so the two cannot drift. */
export const ROSTER_PAGE_SIZE = 25;

export type RosterStatusFilter = "active" | "archived";

export type RosterQuery = {
  status: RosterStatusFilter;
  tags: string[];
  search: string;
  page: number;
};

export type ClientRosterRow = {
  clientId: string;
  displayName: string;
  initials: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  archived: boolean;
  /** Already formatted, or null when there is nothing committed to report. */
  lifetimeLabel: string | null;
  /** How many currencies this row's figure left out. 0 or 1 means it left out none. */
  lifetimeCurrencyCount: number;
  tripCount: number;
  lastTripLabel: string | null;
  nextTripLabel: string | null;
  /** The client is travelling right now, which the roster says instead of a date. */
  nextTripIsNow: boolean;
  lastContactLabel: string | null;
};

export type TagFacet = { tag: string; count: number; selected: boolean };

export type ClientRoster = {
  rows: ClientRosterRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  summary: {
    active: number;
    inMotion: number;
    /**
     * Trips in `inquiry` status, which the copy may call leads. The FIELD is never named
     * `lead` on the agent side — the domain is specified and deliberately unbuilt
     * (Data-Model §11) and comes back by autocomplete the moment something carries its name.
     */
    inquiry: number;
    archived: number;
  };
  facets: TagFacet[];
  /** Set when at least one row's money figure excluded a currency. Null when none did. */
  currencyNote: string | null;
  query: RosterQuery;
};

/** "Aug 26" — the roster's date idiom, which pairs a trip's name with a month and year. */
function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const name = months[Number(m) - 1];
  if (!name || !y) return null;
  return `${name} ${y.slice(2)}`;
}

/**
 * "2h", "Tue", "Mar 14" — the prototype's three shapes, chosen by how far back it was.
 *
 * `asOf` is the agent's own today, computed in Postgres in `agent.time_zone`, because a
 * timestamp is serialised in UTC and slicing it gives the UTC date: a message sent at 19:30
 * in Chicago stores 00:30Z the next day and would be labelled tomorrow.
 */
function contactLabel(at: string | null, asOf: string): string | null {
  if (!at) return null;
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return null;
  const today = Date.parse(`${asOf}T00:00:00Z`);
  const thenDay = Date.parse(`${at.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(today) || !Number.isFinite(thenDay)) return null;

  const days = Math.round((today - thenDay) / 86_400_000);
  if (days <= 0) {
    const hours = Math.max(1, Math.round((Date.now() - then.getTime()) / 3_600_000));
    return hours < 24 ? `${hours}h` : "today";
  }
  if (days < 7) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][then.getUTCDay()] ?? null;
  }
  const [, m, d] = at.slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const name = months[Number(m) - 1];
  return name && d ? `${name} ${Number(d)}` : null;
}

function initialsOf(first: string, last: string): string {
  const a = first.trim().charAt(0);
  const b = last.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

/**
 * A trip cell: "Anniversary Week in Negril · Aug 26".
 *
 * A trip with no dates still gets its name — an `inquiry` has neither a start nor an end
 * (BRD §6.5 creates one from a quote request before anything is planned), and dropping the
 * row because the date is missing would hide the client most in need of a call.
 */
function tripLabel(title: string | null, iso: string | null): string | null {
  if (!title) return null;
  const when = monthYear(iso);
  return when ? `${title} · ${when}` : title;
}

export function rosterQueryFromParams(params: {
  status?: string;
  tag?: string | string[];
  q?: string;
  page?: string;
}): RosterQuery {
  const tagParam = params.tag;
  const tags = (Array.isArray(tagParam) ? tagParam : tagParam ? [tagParam] : [])
    .map((t) => t.trim())
    .filter(Boolean);

  const page = Number.parseInt(params.page ?? "1", 10);

  return {
    status: params.status === "archived" ? "archived" : "active",
    tags,
    search: (params.q ?? "").trim(),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/**
 * The roster and its header, in one round trip each.
 *
 * `null` means a read failed. Both reads are required: a roster with no header counts would
 * render chips claiming zero of everything over a table full of rows.
 */
export async function loadClientRoster(query: RosterQuery): Promise<ClientRoster | null> {
  const { timeZone } = await agentIdentity();
  void timeZone;

  const [rowsResult, summaryResult] = await Promise.all([
    callAgentRead<AgentClientRosterRow>("agent_client_roster", {
      p_status: [query.status],
      p_tags: query.tags.length > 0 ? query.tags : null,
      p_search: query.search.length > 0 ? query.search : null,
      p_limit: ROSTER_PAGE_SIZE,
      p_offset: (query.page - 1) * ROSTER_PAGE_SIZE,
    }),
    callAgentRead<AgentClientSummaryRow>("agent_client_roster_summary", {}),
  ]);

  if (!rowsResult.ok || !summaryResult.ok) return null;

  const summaryRow = summaryResult.rows[0];
  const raw = rowsResult.rows;

  // `total_count` rides on every row and is the count BEFORE the page window. With no rows
  // there is nothing to read it off, and zero is the right answer anyway.
  const total = raw[0]?.total_count ?? 0;
  const asOf = raw[0]?.as_of_date ?? new Date().toISOString().slice(0, 10);

  const rows: ClientRosterRow[] = raw.map((r) => ({
    clientId: r.client_id,
    displayName: r.display_name,
    initials: initialsOf(r.first_name, r.last_name),
    email: r.email,
    phone: r.phone,
    tags: r.tags ?? [],
    archived: r.archived_at !== null,
    // A client with nothing committed gets a dash, not "$0.00". The accessor returns a NULL
    // currency for exactly that case and `rls_agent_clients.sql` asserts it, because a
    // labelled zero claims they have spent nothing where the truth is that nothing has been
    // booked yet.
    lifetimeLabel:
      r.lifetime_currency === null || cents(r.lifetime_value_cents) === 0
        ? null
        : money(r.lifetime_value_cents, r.lifetime_currency),
    lifetimeCurrencyCount: r.lifetime_currency_count,
    tripCount: r.trip_count,
    lastTripLabel: tripLabel(r.last_trip_title, r.last_trip_end_date),
    nextTripLabel:
      r.next_trip_status === "in_progress"
        ? `Now · ${r.next_trip_destinations?.[0] ?? r.next_trip_title ?? ""}`.trim()
        : tripLabel(r.next_trip_title, r.next_trip_start_date),
    nextTripIsNow: r.next_trip_status === "in_progress",
    lastContactLabel: contactLabel(r.last_contact_at, asOf),
  }));

  // The note §3.2 settled the rule for: a money figure names one currency, and where it left
  // others out the screen says so rather than letting one column imply a total it is not.
  const multi = rows.filter((r) => r.lifetimeCurrencyCount > 1).length;
  const currencyNote =
    multi > 0
      ? multi === 1
        ? "One client banks in more than one currency. Their lifetime figure covers their most-used one."
        : `${multi} clients bank in more than one currency. Each lifetime figure covers that client's most-used one.`
      : null;

  const selected = new Set(query.tags);
  const facets: TagFacet[] = (summaryRow?.tag_facets ?? []).map((f) => ({
    tag: f.tag,
    count: f.count,
    selected: selected.has(f.tag),
  }));

  return {
    rows,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / ROSTER_PAGE_SIZE)),
    pageSize: ROSTER_PAGE_SIZE,
    summary: {
      active: summaryRow?.active_count ?? 0,
      inMotion: summaryRow?.in_motion_count ?? 0,
      inquiry: summaryRow?.inquiry_count ?? 0,
      archived: summaryRow?.archived_count ?? 0,
    },
    facets,
    currencyNote,
    query,
  };
}
