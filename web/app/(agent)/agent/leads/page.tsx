import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import MuiButton from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { isLeadFilter, LEAD_COPY, LEAD_FILTERS, loadLeads, type LeadFilter } from "@/lib/agent/leads";

/**
 * Screen 3.8.1 Leads List (revived 2026-10-21, BRD §6.5; Data-Model §11). P2, web only.
 *
 * A SERVER COMPONENT THROUGHOUT. The status filter is a set of links (`?status=`), so a
 * filtered list is shareable and the back button means what it says, as on 3.3.1.
 *
 * NO SLA COLOUR. A new lead says how long it has waited, in grey ("Waiting 2 days"); the
 * promise is "Usually replies the same day", and §2's pace has no alarm in it (ruled
 * 2026-10-21). No bulk-archive either: §3.8.1 dropped it when it was reshaped.
 */

export const metadata = { title: "Leads" };

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

const FILTER_LABEL: Record<LeadFilter, string> = {
  open: LEAD_COPY.filterOpen,
  converted: LEAD_COPY.filterConverted,
  closed: LEAD_COPY.filterClosed,
  all: LEAD_COPY.filterAll,
};

function hrefFor(filter: LeadFilter): string {
  return filter === "open" ? "/agent/leads" : `/agent/leads?status=${filter}`;
}

export default async function AgentLeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const filter: LeadFilter = isLeadFilter(params.status) ? params.status : "open";
  const list = await loadLeads(filter);

  if (!list) {
    return (
      <Box sx={PAGE_SX}>
        <RetryState />
      </Box>
    );
  }

  return (
    <Box sx={PAGE_SX}>
      <Box component="header" sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {LEAD_COPY.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {LEAD_COPY.intro}
          </Typography>
        </Box>
        <MuiButton
          component={NextLink}
          href="/agent/leads/new"
          variant="contained"
          color="brand"
          size="small"
          sx={{ ...BTN_SM, flexShrink: 0 }}
        >
          <Icon name="plus" size={12} /> {LEAD_COPY.addLead}
        </MuiButton>
      </Box>

      <Stack component="nav" aria-label="Lead status" direction="row" useFlexGap spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
        {LEAD_FILTERS.map((f) => (
          <Chip
            key={f}
            component={NextLink}
            href={hrefFor(f)}
            clickable
            color={f === filter ? "primary" : "default"}
            variant={f === filter ? "filled" : "outlined"}
            aria-current={f === filter ? "page" : undefined}
            label={`${FILTER_LABEL[f]} · ${list.counts[f]}`}
          />
        ))}
      </Stack>

      {list.items.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={LEAD_COPY.title}
          body={filter === "open" ? LEAD_COPY.emptyOpen : LEAD_COPY.emptyOther}
        />
      ) : (
        <Card component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {list.items.map((l) => (
            <Box component="li" key={l.id} sx={{ "& + &": { borderTop: 1, borderColor: "divider" } }}>
              <ListItemButton
                component={NextLink}
                href={`/agent/leads/${l.id}`}
                sx={{ px: 2, py: 1.5, gap: 1.5, alignItems: "flex-start" }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography component="p" variant="subtitle2">
                    {l.name}
                  </Typography>
                  <Typography component="p" variant="body2" noWrap sx={{ color: "text.secondary" }}>
                    {l.preview}
                  </Typography>
                  <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                    {[l.sourceLabel, LEAD_COPY.messages(l.noteCount), l.dateLabel].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
                <Stack spacing={0.5} sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                  <StatusChip kind={l.statusKind} label={l.statusLabel} />
                  {l.waitLabel && (
                    <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                      {l.waitLabel}
                    </Typography>
                  )}
                </Stack>
              </ListItemButton>
            </Box>
          ))}
        </Card>
      )}
    </Box>
  );
}
