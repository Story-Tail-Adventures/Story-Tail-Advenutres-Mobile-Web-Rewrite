import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { AgentInboxHeader } from "@/components/agent/AgentInboxHeader";
import { AgentInboxList } from "@/components/agent/AgentInboxList";
import NextLink from "@/components/mui/NextLink";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";
import { inboxHref, isNarrowed, threadHref, type InboxQuery } from "@/lib/agent/messageQuery";
import type { Inbox } from "@/lib/agent/messages";

/** The inbox's whole left column: header, list (or why it is empty), and paging. */
export function AgentInboxColumn({
  inbox,
  query,
  activeId = null,
  heading = "h1",
}: {
  inbox: Inbox;
  query: InboxQuery;
  activeId?: string | null;
  heading?: "h1" | "h2";
}) {
  // Paging beside an open thread keeps it open, as the filters do.
  const pageHref = (page: number) => (activeId ? threadHref(activeId, { ...query, page }) : inboxHref({ ...query, page }));
  const empty = query.archived
    ? AGENT_MESSAGES_COPY.emptyArchived
    : isNarrowed(query)
      ? AGENT_MESSAGES_COPY.emptyNarrowed
      : AGENT_MESSAGES_COPY.emptyInbox;

  return (
    <Box>
      <AgentInboxHeader
        query={query}
        headline={inbox.headline}
        archivedCount={inbox.archivedThreads}
        activeId={activeId}
        heading={heading}
      />
      {inbox.threads.length === 0 ? (
        <Typography component="p" variant="body2" sx={{ m: 0, px: 1.75, py: 2, color: "text.secondary" }}>
          {empty}
        </Typography>
      ) : (
        <AgentInboxList threads={inbox.threads} activeId={activeId} archivedView={query.archived} />
      )}
      {inbox.pageCount > 1 && (
        <Box component="nav" aria-label={AGENT_MESSAGES_COPY.pagesLabel} sx={{ display: "flex", justifyContent: "space-between", px: 1.75, py: 1.25 }}>
          {inbox.page > 1 ? (
            <MuiLink component={NextLink} href={pageHref(inbox.page - 1)} underline="hover" variant="body2">
              {AGENT_MESSAGES_COPY.newer}
            </MuiLink>
          ) : (
            <span />
          )}
          {inbox.page < inbox.pageCount && (
            <MuiLink component={NextLink} href={pageHref(inbox.page + 1)} underline="hover" variant="body2">
              {AGENT_MESSAGES_COPY.older}
            </MuiLink>
          )}
        </Box>
      )}
    </Box>
  );
}
