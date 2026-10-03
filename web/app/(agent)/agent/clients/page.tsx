import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { ClientRosterFilters } from "@/components/agent/ClientRosterFilters";
import { ClientBulkTagForm } from "@/components/agent/ClientBulkTag";
import { ClientRosterTable } from "@/components/agent/ClientRosterTable";
import { RosterPagination } from "@/components/agent/RosterPagination";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { CLIENT_COPY, rosterSubtitle } from "@/lib/agent/content";
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
 * A SERVER COMPONENT THROUGHOUT, save for the bulk-tag form — the one client island, which
 * holds the selection since the MUI pass (see `ClientBulkTag.tsx`). The filters are a GET
 * form, the paginator is a pair of links, and everything else that would otherwise live in
 * React lives in the URL — so a filtered roster is shareable and the back button means what
 * it says. §3.2.2 made the same call for `?stage=` and §3.4.2 for `?tab=`.
 *
 * NO `<AgentViews />`. That strip belongs to §3.2's three views of one section; rendering it
 * above a different section's own controls produced two identically-styled rows, one with no
 * active state — the reason §3.4.2 left it out too.
 *
 * WHAT THE PROTOTYPE DRAWS THAT IS NOT HERE. Only the "Filters" button, which opens a sheet
 * the chips already make unnecessary at this width. The bulk-select column and the "New
 * client" CTA were both cut on §6.4's principle that a control doing nothing is worse than
 * no control; both have something behind them now and both are back.
 */

export const metadata = { title: "Clients" };

/** The page column: `mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1336,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

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
      <Box sx={PAGE_SX}>
        <RetryState />
      </Box>
    );
  }

  const filtered = query.search.length > 0 || query.tags.length > 0;

  return (
    <Box sx={PAGE_SX}>
      <Box
        component="header"
        sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {CLIENT_COPY.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {rosterSubtitle(roster.summary.active, roster.summary.inMotion, roster.summary.inquiry)}
          </Typography>
        </Box>
        <MuiButton
          component={NextLink}
          href="/agent/clients/new"
          variant="contained"
          color="brand"
          size="small"
          sx={{ ...BTN_SM, flexShrink: 0 }}
        >
          <Icon name="plus" size={12} /> {CLIENT_COPY.newClientTitle}
        </MuiButton>
      </Box>

      <ClientRosterFilters query={query} facets={roster.facets} />

      {/* THE FORM WRAPS BOTH BRANCHES, not just the table, because its receipt has to
          outlive the rows. Removing a tag from every client on a `?tag=` filter empties the
          very list you were looking at — and with the form inside the non-empty branch, the
          sentence explaining why vanished with it, leaving "Nothing matches" over an
          unexplained blank. The bar itself stays hidden here: nothing is ticked, so there is
          no selection for it to show.

          The paginator stays outside. Its links would navigate away mid-selection, and a
          link inside a form is a different thing from a submit. */}
      <ClientBulkTagForm>
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
          </>
        )}
      </ClientBulkTagForm>

      {roster.rows.length > 0 && (
        <RosterPagination
          hrefFor={(p) => {
            const params = new URLSearchParams();
            if (query.status !== "active") params.set("status", query.status);
            if (query.search) params.set("q", query.search);
            for (const tag of query.tags) params.append("tag", tag);
            if (p > 1) params.set("page", String(p));
            const qs = params.toString();
            return qs ? `/agent/clients?${qs}` : "/agent/clients";
          }}
          page={roster.page}
          pageCount={roster.pageCount}
          total={roster.total}
          shown={roster.rows.length}
        />
      )}
    </Box>
  );
}
