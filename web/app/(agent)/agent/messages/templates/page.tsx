import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { MessageTemplateLibrary } from "@/components/agent/MessageTemplateLibrary";
import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { MESSAGE_TEMPLATE_COPY } from "@/lib/agent/content";
import { groupTemplates, loadMessageTemplates } from "@/lib/agent/messageTemplates";

/**
 * Screen 3.10.4 — Template Library (A3104_TemplateLibrary). WEB ONLY.
 *
 * UNDER MESSAGES, NOT AT /agent/templates, which is §3.4.13's trip templates. The artboard
 * draws it on the Messages tab, and the nav rail does not change (§6.4); the doors are the
 * inbox header's "Templates" and the picker's "Manage templates". The Messages frame shows this
 * page full width rather than beside the inbox list (`AgentMessagesFrame`).
 *
 * WHAT IS NOT HERE FROM THE ARTBOARD: "Used 42×". Messages store their words only, with no
 * link back to a template, so an honest count does not exist (Gyasi, 2026-10-14). Cards show
 * "Last edited" alone, which the artboard draws beside it.
 *
 * `?view=archived` is the archived list, with Restore.
 */
export const metadata = { title: "Message templates" };

const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export default async function MessageTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const archived = (await searchParams).view === "archived";
  const templates = await loadMessageTemplates(archived);
  if (!templates) return <RetryState />;

  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 1100, px: { xs: 2, md: 3 }, pt: 2.5, pb: 8 }}>
      <MuiLink component={NextLink} href="/agent/messages" underline="hover" variant="body2">
        {MESSAGE_TEMPLATE_COPY.backToMessages}
      </MuiLink>
      <Box
        component="header"
        sx={{ mt: 1, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0, flex: "1 1 320px" }}>
          <Typography id="templates-heading" tabIndex={-1} component="h1" variant="h5" sx={{ m: 0, fontWeight: 700, "&:focus": { outline: "none" } }}>
            {archived ? MESSAGE_TEMPLATE_COPY.archivedTitle : MESSAGE_TEMPLATE_COPY.title}
          </Typography>
          {!archived && (
            <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {MESSAGE_TEMPLATE_COPY.subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <MuiLink
            component={NextLink}
            href={archived ? "/agent/messages/templates" : "/agent/messages/templates?view=archived"}
            underline="hover"
            variant="body2"
          >
            {archived ? MESSAGE_TEMPLATE_COPY.viewLive : MESSAGE_TEMPLATE_COPY.viewArchived}
          </MuiLink>
          {!archived && (
            <MuiButton
              component={NextLink}
              href="/agent/messages/templates/new"
              variant="contained"
              color="brand"
              size="small"
              sx={BTN_SM}
            >
              <Icon name="plus" size={12} /> {MESSAGE_TEMPLATE_COPY.newTemplate}
            </MuiButton>
          )}
        </Box>
      </Box>

      <MessageTemplateLibrary
        groups={groupTemplates(templates)}
        archived={archived}
        headingId="templates-heading"
        empty={
          <EmptyState
            title={archived ? MESSAGE_TEMPLATE_COPY.emptyArchived : MESSAGE_TEMPLATE_COPY.title}
            body={archived ? MESSAGE_TEMPLATE_COPY.emptyArchivedBody : MESSAGE_TEMPLATE_COPY.emptyLibrary}
          />
        }
      />
    </Box>
  );
}
