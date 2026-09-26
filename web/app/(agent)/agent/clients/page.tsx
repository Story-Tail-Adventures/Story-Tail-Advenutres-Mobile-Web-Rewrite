import { ClientRosterFilters } from "@/components/agent/ClientRosterFilters";
import { ClientRosterTable } from "@/components/agent/ClientRosterTable";
import { RosterPagination } from "@/components/agent/RosterPagination";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { AGENT_COPY, CLIENT_COPY, rosterSubtitle } from "@/lib/agent/content";
import { loadClientRoster, rosterQueryFromParams } from "@/lib/agent/clients";

/**
 * Screen 3.3.1 — Client List / Roster.
 *
 * THE FIRST SCREEN THAT READS THE BOOK OF BUSINESS. `client` carries exactly one RLS policy
 * and it keys on the TRAVELER's `platform_user.client_id`, so a direct read returns nothing
 * to the advisor whose book it is — and three of this screen's own columns (`status`,
 * `tags`, and the money) sit outside the `client` column grant, which binds the agent too
 * because an agent is also the Postgres role `authenticated`. Everything here arrives
 * through `agent_client_roster()`. See 20260926140000_agent_client_read_surface.sql.
 *
 * A SERVER COMPONENT THROUGHOUT, with no client island at all. The filters are a GET form,
 * the paginator is a pair of links, and the state that would otherwise live in React lives
 * in the URL — so a filtered roster is shareable and the back button means what it says.
 * §3.2.2 made the same call for `?stage=` and §3.4.2 for `?tab=`.
 *
 * NO `<AgentViews />`. That strip belongs to §3.2's three views of one section; rendering it
 * above a different section's own controls produced two identically-styled rows, one with no
 * active state — the reason §3.4.2 left it out too.
 *
 * WHAT THE PROTOTYPE DRAWS THAT IS NOT HERE, and why each one is absent rather than
 * disabled. The bulk-select checkbox column has no action behind it until §3.3.9 (bulk-tag)
 * and §3.10 (bulk-message). The "Filters" button opens a sheet the chips already make
 * unnecessary at this width. The "New client" CTA is §3.3.9. The first is cut on §6.4's
 * principle that a control doing nothing is worse than no control; the last is a real
 * planned screen, so it renders disabled with its reason the way quick-add does.
 */

export const metadata = { title: "Clients" };

export default async function AgentClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tag?: string | string[]; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = rosterQueryFromParams(params);
  const roster = await loadClientRoster(query);

  if (!roster) {
    return (
      <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
        <RetryState />
      </div>
    );
  }

  const filtered = query.search.length > 0 || query.tags.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="t-title-l m-0">{CLIENT_COPY.title}</h1>
          <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
            {rosterSubtitle(roster.summary.active, roster.summary.inMotion, roster.summary.inquiry)}
          </p>
        </div>
        {/* §3.3.9 is a real planned screen, so this promises something that will exist. */}
        <button
          type="button"
          disabled
          title={AGENT_COPY.quickAddClientDeferred}
          className="btn btn-orange btn-sm shrink-0 opacity-50"
        >
          New client
          <span className="sr-only"> — {AGENT_COPY.quickAddClientDeferred}</span>
        </button>
      </header>

      <ClientRosterFilters query={query} facets={roster.facets} />

      {roster.rows.length === 0 ? (
        <EmptyState
          icon="users"
          title={
            filtered
              ? CLIENT_COPY.emptyFilteredTitle
              : query.status === "archived"
                ? CLIENT_COPY.emptyArchivedTitle
                : CLIENT_COPY.emptyTitle
          }
          body={
            filtered
              ? CLIENT_COPY.emptyFilteredBody
              : query.status === "archived"
                ? CLIENT_COPY.emptyArchivedBody
                : CLIENT_COPY.emptyBody
          }
        />
      ) : (
        <>
          <ClientRosterTable rows={roster.rows} />
          {/* The note §3.2's currency rule requires: one figure, one currency, and the screen
              says where it left others out rather than letting a column imply a total. */}
          {roster.currencyNote && (
            <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">
              <span aria-hidden>* </span>
              {roster.currencyNote}
            </p>
          )}
          <RosterPagination
            query={query}
            page={roster.page}
            pageCount={roster.pageCount}
            total={roster.total}
            shown={roster.rows.length}
          />
        </>
      )}
    </div>
  );
}
