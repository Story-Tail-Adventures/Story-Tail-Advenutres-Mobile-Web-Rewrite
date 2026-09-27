import Link from "next/link";

import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * The roster's paginator — the first one in this codebase.
 *
 * SERVER-RENDERED LINKS, not a client control, so it matches the filters above it: the page
 * is in the URL, the back button works, and the table stays a server component.
 *
 * IT CARRIES THE FILTERS FORWARD. A "Next" that dropped `q` and `tag` would page through a
 * different result set than the one on screen — the count would say 27 and the second page
 * would show strangers.
 *
 * THE CALLER BUILDS THE HREFS, and that is the whole reason this takes a function rather
 * than a query object. It used to own a `hrefFor` that hardcoded `/agent/clients` and the
 * client roster's own parameter names; reusing it for §3.4.1's trips typechecked perfectly
 * and would have paged the advisor off the screen they were on, silently dropping the stage
 * filter on the way. Which parameters a list uses is the list's knowledge, not this
 * component's.
 */

export function RosterPagination({
  hrefFor,
  page,
  pageCount,
  total,
  shown,
  pageSize = 25,
}: {
  /** Given a 1-based page, the URL for it — filters and all. */
  hrefFor: (page: number) => string;
  page: number;
  pageCount: number;
  total: number;
  shown: number;
  pageSize?: number;
}) {
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
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
          <Link href={hrefFor(page - 1)} className="btn btn-outlined btn-sm">
            {CLIENT_COPY.paginationPrev}
          </Link>
        ) : (
          <span className="btn btn-outlined btn-sm opacity-40" aria-disabled>
            {CLIENT_COPY.paginationPrev}
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className="btn btn-outlined btn-sm">
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
