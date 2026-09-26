import Link from "next/link";

import { CLIENT_COPY } from "@/lib/agent/content";
import type { RosterQuery } from "@/lib/agent/clients";

/**
 * The roster's paginator — the first one in this codebase.
 *
 * SERVER-RENDERED LINKS, not a client control, so it matches the filters above it: the page
 * is in the URL, the back button works, and the table stays a server component.
 *
 * IT CARRIES THE FILTERS FORWARD. A "Next" that dropped `q` and `tag` would page through a
 * different result set than the one on screen — the count would say 27 and the second page
 * would show strangers.
 */
function hrefFor(query: RosterQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.status !== "active") params.set("status", query.status);
  if (query.search) params.set("q", query.search);
  for (const tag of query.tags) params.append("tag", tag);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/agent/clients?${qs}` : "/agent/clients";
}

export function RosterPagination({
  query,
  page,
  pageCount,
  total,
  shown,
}: {
  query: RosterQuery;
  page: number;
  pageCount: number;
  total: number;
  shown: number;
}) {
  if (pageCount <= 1) return null;

  const first = (page - 1) * 25 + 1;
  const last = first + shown - 1;

  return (
    <nav
      aria-label="Roster pages"
      className="mt-3 flex items-center justify-between gap-3"
    >
      <p className="t-body-s text-[var(--md-on-surface-variant)]">
        {first}–{last} of {total}
      </p>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(query, page - 1)} className="btn btn-outlined btn-sm">
            {CLIENT_COPY.paginationPrev}
          </Link>
        ) : (
          <span className="btn btn-outlined btn-sm opacity-40" aria-disabled>
            {CLIENT_COPY.paginationPrev}
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(query, page + 1)} className="btn btn-outlined btn-sm">
            {CLIENT_COPY.paginationNext}
          </Link>
        ) : (
          <span className="btn btn-outlined btn-sm opacity-40" aria-disabled>
            {CLIENT_COPY.paginationNext}
          </span>
        )}
      </span>
    </nav>
  );
}
