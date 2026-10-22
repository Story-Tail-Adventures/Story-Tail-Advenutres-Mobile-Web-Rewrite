import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { LeadActions } from "@/components/agent/LeadActions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { LEAD_COPY, loadLead } from "@/lib/agent/leads";
import { isUuid } from "@/lib/agent/messageQuery";

/**
 * Screen 3.8.2 Lead Detail (revived 2026-10-21, BRD §6.5; Data-Model §11). P2, web only.
 *
 * Everything about one lead: who, how they reached Gyasi, every note they sent with what they
 * were viewing, and the next step. No message thread: Reply opens the advisor's own email app
 * and the platform keeps no lead email (ruling 6). The actions are the one client island,
 * `LeadActions`.
 *
 * Somebody else's lead and no lead get the same page, as on 3.4.2, so ids cannot be probed.
 */

export const metadata = { title: "Lead" };

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 960, px: { xs: 2, md: 4 }, py: 3 } as const;
const LABEL_SX = { color: "text.secondary", minWidth: 120 } as const;

export default async function AgentLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { leadId } = await params;
  const { added } = await searchParams;
  const detail = isUuid(leadId) ? await loadLead(leadId) : "missing";

  if (detail === null) {
    return (
      <Box sx={PAGE_SX}>
        <RetryState />
      </Box>
    );
  }
  if (detail === "missing") {
    return (
      <Box sx={PAGE_SX}>
        <EmptyState
          icon="inbox"
          title={LEAD_COPY.notFoundTitle}
          body={LEAD_COPY.notFoundBody}
          action={{ label: LEAD_COPY.back, href: "/agent/leads" }}
        />
      </Box>
    );
  }

  const { lead } = detail;

  return (
    <Box sx={PAGE_SX}>
      <MuiLink
        component={NextLink}
        href="/agent/leads"
        variant="body2"
        underline="hover"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
      >
        <Icon name="arrow_left" size={13} />
        {LEAD_COPY.back}
      </MuiLink>

      <Box component="header" sx={{ mt: 1.5, mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          {detail.name}
        </Typography>
        <StatusChip kind={detail.statusKind} label={detail.statusLabel} />
      </Box>

      {added === "1" && (
        <Box sx={{ mb: 2 }}>
          <Alert tone="info">{LEAD_COPY.addedToExisting}</Alert>
        </Box>
      )}

      <LeadActions
        leadId={lead.id}
        status={lead.status}
        clientId={lead.client_id}
        replyHref={detail.replyHref}
        firstName={lead.first_name}
        lastName={lead.last_name}
        email={lead.email}
        phone={lead.phone}
      />

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          {LEAD_COPY.detailsTitle}
        </Typography>
        <Stack component="dl" spacing={0.75} sx={{ m: 0 }}>
          {[
            { label: LEAD_COPY.emailLabel, value: lead.email },
            { label: LEAD_COPY.phoneLabel, value: lead.phone },
            { label: LEAD_COPY.sourceLabel, value: detail.sourceLabel },
            { label: LEAD_COPY.campaignLabel, value: detail.campaign },
            ...detail.dates,
            {
              label: LEAD_COPY.closedLabel,
              value: detail.closeReasonLabel
                ? [detail.closeReasonLabel, lead.close_note].filter(Boolean).join(": ")
                : null,
            },
          ]
            .filter((row, i, rows) => row.value && rows.findIndex((r) => r.label === row.label && r.value) === i)
            .map((row) => (
              <Box key={row.label} sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                <Typography component="dt" variant="body2" sx={LABEL_SX}>
                  {row.label}
                </Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: "anywhere" }}>
                  {row.value}
                </Typography>
              </Box>
            ))}
        </Stack>
      </Card>

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          {LEAD_COPY.notesTitle}
        </Typography>
        <Stack spacing={2}>
          {detail.messages.map((m) => (
            <Box key={m.id} component="article">
              <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                {[m.dateLabel, m.byAgent ? LEAD_COPY.addedByYou : m.from].filter(Boolean).join(" · ")}
              </Typography>
              {m.about && (
                <Typography component="p" variant="subtitle2" sx={{ mt: 0.25 }}>
                  {LEAD_COPY.aboutPrefix}
                  {m.about}
                </Typography>
              )}
              <Typography component="p" variant="body1" sx={{ mt: 0.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {m.body}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Card>
    </Box>
  );
}
