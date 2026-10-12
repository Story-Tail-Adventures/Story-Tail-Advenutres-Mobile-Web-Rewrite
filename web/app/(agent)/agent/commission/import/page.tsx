import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { StatementHelp, StatementSteps } from "@/components/agent/StatementSteps";
import { StatementUploadForm } from "@/components/agent/StatementUploadForm";
import { ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { COMMISSION_COPY, STATEMENT_COPY } from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";
import { loadStatements } from "@/lib/agent/statements";

/**
 * Screen 3.7.5 — Inteletravel CSV Import, step 1. §4.4 Pattern G, web only.
 *
 * A375_CSVImport draws two cards side by side: Upload, and Map columns. Here the second card
 * waits until there is a file, because the columns are the FILE's: once uploaded, the
 * statement has its own page (`/import/<id>`) where both cards show, with the map filled in.
 * Uploading stores the file and its rows and changes nothing in the ledger.
 *
 * Below the cards, the statements already uploaded — the way back to one left in review,
 * and the record of the ones reconciled. Not in the artboard; without it a statement left
 * half done would be reachable only by uploading it again, which the duplicate check refuses.
 */

export const metadata = { title: "Import statement" };

export default async function ImportStatementPage() {
  const statements = await loadStatements();

  return (
    <Box sx={PAGE_SX}>
      <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />

      <Box component="header" sx={{ mt: 2.5, mb: 2, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {STATEMENT_COPY.importTitle}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {STATEMENT_COPY.importSubtitle}
          </Typography>
        </Box>
        <StatementHelp />
      </Box>

      <StatementSteps
        upload={<StatementUploadForm />}
        map={
          <Typography component="p" variant="body2" sx={{ mt: 1.25, color: "text.secondary" }}>
            {STATEMENT_COPY.step2Waiting}
          </Typography>
        }
      />

      <Card sx={{ mt: 2.5, maxWidth: 1080 }}>
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Typography component="h2" variant="subtitle1" sx={{ m: 0, mb: 1, fontWeight: 600 }}>
            {STATEMENT_COPY.pastTitle}
          </Typography>
          {!statements ? (
            <ErrorState />
          ) : statements.length === 0 ? (
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {STATEMENT_COPY.pastEmpty}
            </Typography>
          ) : (
            <List disablePadding aria-label={STATEMENT_COPY.pastTableLabel}>
              {statements.map((s) => (
                <ListItem key={s.importId} disablePadding>
                  <ListItemButton
                    component={NextLink}
                    href={s.href}
                    sx={{ borderRadius: 1, display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Box sx={{ minWidth: 0, flex: "1 1 220px" }}>
                      <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 600 }}>
                        {s.label}
                      </Typography>
                      <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                        {[s.label === s.filename ? null : s.filename, s.rowsLabel, s.uploadedLabel].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                    <StatusChip kind={s.statusChip} label={s.statusLabel} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
