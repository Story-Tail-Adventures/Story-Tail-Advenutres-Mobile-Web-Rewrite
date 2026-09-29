import Link from "next/link";

import { TemplateGrid } from "@/components/agent/TemplateGrid";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { TEMPLATE_COPY } from "@/lib/agent/content";
import { loadTemplates } from "@/lib/agent/templates";

/**
 * Screen 3.4.13 — Trip Template Library.
 *
 * NOT ON THE NAV RAIL. §6.4's amendment settled the prototype's seven entries as final and
 * `nav.ts` records that Templates and Settings stay off it deliberately. The Screen
 * Inventory entry lists nav "Templates" among the entry points, and that is the one thing
 * here it does not get: the reachable doors are the trips roster's header link, the
 * builder's "Save as template", and §3.4.3's "start from a template". Three real doors beat
 * an eighth rail entry that §6.4 already decided against.
 *
 * A SERVER COMPONENT with one client island. The island holds only dialog state — there is
 * no filter, no pagination and no selection here, because a library of patterns is a
 * handful of cards and inventing a paginator for six of them is the control §6.4's
 * amendment argues against.
 */

export const metadata = { title: "Trip templates" };

export default async function AgentTemplatesPage() {
  const library = await loadTemplates();

  if (!library) {
    // `RetryState`, not a bare `ErrorState`: that one falls back to a "Back to your trips"
    // link pointing at /dashboard, which is a TRAVELER route. Every agent page that got
    // this wrong sent an advisor to the wrong app.
    return <RetryState />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <header className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-headline text-[22px] leading-tight">{TEMPLATE_COPY.title}</h1>
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {TEMPLATE_COPY.sub}
          </p>
        </div>
        <Link href="/agent/trips" className="btn btn-outlined btn-sm">
          {/* Back to where templates are made and used. The prototype's "New template" CTA
              is NOT here: a template is saved FROM a trip, so the button belongs on the
              trip, and one here would open a form with nothing to snapshot. */}
          All trips
        </Link>
      </header>

      {library.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={TEMPLATE_COPY.emptyTitle} body={TEMPLATE_COPY.emptyBody} />
        </div>
      ) : (
        <TemplateGrid rows={library.rows} />
      )}
    </div>
  );
}
