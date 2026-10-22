/**
 * Screen 3.10.1's filters, as a URL: parsed from search params, turned back into hrefs.
 *
 * SERVER-FREE, like `commissionFilters.ts`: the inbox list is a client component and imports
 * these to build its links, and anything reachable from `lib/supabase/server.ts` would drag
 * `next/headers` into the browser bundle.
 *
 * Every filter is a GET parameter, so a filtered inbox is a link: the worklist's "overdue"
 * row, Client Detail's "Messages", and Back all land on exactly what they named.
 */

export type InboxQuery = {
  archived: boolean;
  unread: boolean;
  overdue: boolean;
  clientId: string | null;
  tripId: string | null;
  /** Trimmed, at most 100 characters (the SQL cuts there too), or null. */
  search: string | null;
  page: number;
};

export type InboxParams = {
  view?: string;
  unread?: string;
  overdue?: string;
  client?: string;
  trip?: string;
  q?: string;
  page?: string;
};

export const EMPTY_INBOX_QUERY: InboxQuery = {
  archived: false,
  unread: false,
  overdue: false,
  clientId: null,
  tripId: null,
  search: null,
  page: 1,
};

/** Threads per page. The SQL caps a page at 200; the inbox asks for fewer. */
export const INBOX_PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 100_000;

/** A thread, client or trip id from a URL: checked before it reaches a read. */
export function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID.test(value);
}

const uuidOrNull = (value: string | undefined) => (isUuid(value) ? value.toLowerCase() : null);

export function inboxQueryFromParams(params: InboxParams): InboxQuery {
  const search = (params.q ?? "").trim().slice(0, 100);
  const page = Number.parseInt(params.page ?? "1", 10);
  return {
    archived: params.view === "archived",
    unread: params.unread === "1",
    overdue: params.overdue === "1",
    clientId: uuidOrNull(params.client),
    tripId: uuidOrNull(params.trip),
    search: search === "" ? null : search,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** The query as search params, defaults left out so a plain inbox is a plain URL. */
export function inboxSearch(query: InboxQuery): string {
  const p = new URLSearchParams();
  if (query.archived) p.set("view", "archived");
  if (query.unread) p.set("unread", "1");
  if (query.overdue) p.set("overdue", "1");
  if (query.clientId) p.set("client", query.clientId);
  if (query.tripId) p.set("trip", query.tripId);
  if (query.search) p.set("q", query.search);
  if (query.page > 1) p.set("page", String(query.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function inboxHref(query: InboxQuery): string {
  return `/agent/messages${inboxSearch(query)}`;
}

/** A thread, keeping the inbox's filters so the list beside it (and Back) stays put. */
export function threadHref(conversationId: string, query: InboxQuery = EMPTY_INBOX_QUERY): string {
  return `/agent/messages/${conversationId}${inboxSearch(query)}`;
}

/**
 * "Message client" from Client Detail or Trip Detail. With `remindMilestoneId` it is Trip
 * Detail's "Remind the client": the thread opens with the template picker on Payment reminder,
 * that milestone's payment fields filled.
 */
export function newMessageHref(clientId: string, tripId?: string | null, remindMilestoneId?: string | null): string {
  const p = new URLSearchParams({ client: clientId });
  if (tripId) p.set("trip", tripId);
  if (remindMilestoneId) p.set("remind", remindMilestoneId);
  return `/agent/messages/new?${p.toString()}`;
}

/** A thread opened to send a payment reminder (see `newMessageHref`). */
export function remindThreadHref(conversationId: string, milestoneId: string): string {
  return `${threadHref(conversationId)}?remind=${encodeURIComponent(milestoneId)}`;
}

/** Whether anything narrows the list, for the "no threads match" vs "inbox is empty" copy. */
export function isNarrowed(query: InboxQuery): boolean {
  return query.unread || query.overdue || query.clientId !== null || query.tripId !== null || query.search !== null;
}
