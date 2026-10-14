import Form from "next/form";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";
import { EMPTY_INBOX_QUERY, inboxHref, threadHref, type InboxQuery } from "@/lib/agent/messageQuery";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * Screen 3.10.1's header (A3101's left column top): "Inbox", the counts, the filter chips,
 * and a search.
 *
 * EVERY CONTROL IS A LINK OR A GET FORM, so a filtered inbox is a URL and works before any
 * JavaScript (`next/form` makes the search a client-side navigation once it is loaded). The
 * artboard's chips are "Unread / By client / By trip / SLA past": "SLA past" is Overdue
 * (Gyasi's rule), and "By client" / "By trip" arrive as the filters Client Detail and Trip
 * Detail link in with, shown here as removable chips rather than two pickers nobody asked for.
 *
 * BESIDE AN OPEN THREAD, every filter keeps it open: narrowing the list is not closing what
 * the advisor is reading.
 */
export function AgentInboxHeader({
  query,
  headline,
  archivedCount,
  activeId = null,
  heading = "h1",
}: {
  query: InboxQuery;
  headline: string;
  archivedCount: number;
  activeId?: string | null;
  heading?: "h1" | "h2";
}) {
  const hrefFor = (q: InboxQuery) => (activeId ? threadHref(activeId, q) : inboxHref(q));
  const at = (patch: Partial<InboxQuery>) => hrefFor({ ...query, ...patch, page: 1 });
  const toggles = [
    { label: AGENT_MESSAGES_COPY.filterUnread, on: query.unread, href: at({ unread: !query.unread }) },
    { label: AGENT_MESSAGES_COPY.filterOverdue, on: query.overdue, href: at({ overdue: !query.overdue }) },
  ];
  const chipSx = { ...TAP_TARGET };

  return (
    <Box sx={{ px: 1.75, pt: 1.75, pb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography component={heading} variant="h5" sx={{ m: 0, fontWeight: 700, flex: 1 }}>
          {query.archived ? AGENT_MESSAGES_COPY.viewArchived : AGENT_MESSAGES_COPY.title}
        </Typography>
        <MuiLink component={NextLink} href={at({ archived: !query.archived })} underline="hover" variant="body2">
          {query.archived
            ? AGENT_MESSAGES_COPY.viewInbox
            : `${AGENT_MESSAGES_COPY.viewArchived}${archivedCount > 0 ? ` (${archivedCount.toLocaleString("en-US")})` : ""}`}
        </MuiLink>
      </Box>
      {!query.archived && (
        <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {headline}
        </Typography>
      )}

      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 1 }}>
        {toggles.map((t) => (
          <Chip
            key={t.label}
            component={NextLink}
            href={t.href}
            clickable
            size="small"
            label={t.label}
            variant={t.on ? "filled" : "outlined"}
            color={t.on ? "primary" : "default"}
            aria-current={t.on ? "true" : undefined}
            sx={chipSx}
          />
        ))}
        {query.clientId && (
          <Chip
            size="small"
            label={AGENT_MESSAGES_COPY.oneClient}
            component={NextLink}
            href={at({ clientId: null })}
            clickable
            aria-label={`${AGENT_MESSAGES_COPY.oneClient} · ${AGENT_MESSAGES_COPY.clearFilter}`}
            sx={chipSx}
          />
        )}
        {query.tripId && (
          <Chip
            size="small"
            label={AGENT_MESSAGES_COPY.oneTrip}
            component={NextLink}
            href={at({ tripId: null })}
            clickable
            aria-label={`${AGENT_MESSAGES_COPY.oneTrip} · ${AGENT_MESSAGES_COPY.clearFilter}`}
            sx={chipSx}
          />
        )}
      </Box>

      <Box
        component={Form}
        action={activeId ? `/agent/messages/${activeId}` : "/agent/messages"}
        role="search"
        sx={{ display: "flex", gap: 1, mt: 1.25, alignItems: "flex-end" }}
      >
        {query.archived && <input type="hidden" name="view" value="archived" />}
        {query.unread && <input type="hidden" name="unread" value="1" />}
        {query.overdue && <input type="hidden" name="overdue" value="1" />}
        {query.clientId && <input type="hidden" name="client" value={query.clientId} />}
        {query.tripId && <input type="hidden" name="trip" value={query.tripId} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Field
            id="inbox-search"
            name="q"
            type="search"
            label={AGENT_MESSAGES_COPY.searchLabel}
            placeholder={AGENT_MESSAGES_COPY.searchPlaceholder}
            defaultValue={query.search ?? ""}
            // The same form re-renders on a link-only navigation (a chip, "Show all"); keyed
            // so a typed search does not linger after the filters it belonged to went away.
            key={query.search ?? ""}
          />
        </Box>
        <Button type="submit" variant="outlined" size="sm">
          {AGENT_MESSAGES_COPY.searchSubmit}
        </Button>
      </Box>
      {query.search && (
        <MuiLink component={NextLink} href={at({ search: null })} underline="hover" variant="caption" sx={{ display: "inline-block", mt: 0.5 }}>
          {AGENT_MESSAGES_COPY.clearFilter}
        </MuiLink>
      )}
      {(query.clientId || query.tripId) && !query.search && (
        <MuiLink
          component={NextLink}
          href={hrefFor({ ...EMPTY_INBOX_QUERY, archived: query.archived })}
          underline="hover"
          variant="caption"
          sx={{ display: "inline-block", mt: 0.5 }}
        >
          {AGENT_MESSAGES_COPY.clearFilter}
        </MuiLink>
      )}
    </Box>
  );
}
