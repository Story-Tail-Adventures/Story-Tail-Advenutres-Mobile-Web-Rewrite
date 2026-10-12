import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { StatementConfirmButton } from "@/components/agent/StatementConfirmButton";
import { StatementMapForm } from "@/components/agent/StatementMapForm";
import { StatementRowsTable } from "@/components/agent/StatementRowsTable";
import { StatementSteps } from "@/components/agent/StatementSteps";
import { EmptyState, ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import {
  COMMISSION_COPY,
  STATEMENT_COPY,
  statementReconcileBody,
  statementReconciledLine,
  statementStillNeedYou,
  statementUploadedLine,
} from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";
import { loadStatement, loadStatementRows, statementHref } from "@/lib/agent/statements";

/**
 * One uploaded statement: 3.7.5's column map while it has none, 3.7.6's reconciliation once
 * it does. One URL for the statement whatever stage it is at, so the list and a bookmark
 * always land in the right place.
 *
 * WHILE MAPPING: the artboard's two cards — the upload done ("Uploaded: april.csv · 38 rows
 * found", with a way to start over) and the column map, filled in from the guess. `?step=map`
 * reopens the map on a statement in review ("Change columns"), with a warning that it clears
 * the decisions made.
 *
 * IN REVIEW / RECONCILED: A376_Reconciliation — the header, its "38 imported · 35 matched · 3
 * need you", "Mark as reconciled", and the table. Mark as reconciled is DISABLED WITH ITS
 * REASON while any row needs the advisor (§3.2.1's rule): reconciling is the moment every row
 * is accounted for, and the SQL refuses it anyway.
 */

export const metadata = { title: "Statement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { importId } = await params;
  const { step } = await searchParams;
  const views = <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />;

  const notFound = (
    <Box sx={PAGE_SX}>
      {views}
      <EmptyState
        icon="search"
        title={STATEMENT_COPY.notFoundTitle}
        body={STATEMENT_COPY.notFoundBody}
        action={{ label: STATEMENT_COPY.backToImport, href: "/agent/commission/import" }}
      />
    </Box>
  );
  if (!UUID.test(importId)) return notFound;

  const result = await loadStatement(importId);
  if (!result.ok && result.reason === "not-found") return notFound;
  if (!result.ok) return <ErrorState />;
  const s = result.statement;

  // ── Mapping (or remapping a statement in review) ────────────────────────────
  const remap = s.status === "review" && (Array.isArray(step) ? step[0] : step) === "map";
  if (s.status === "mapping" || remap) {
    return (
      <Box sx={PAGE_SX}>
        {views}
        <Box component="header" sx={{ mt: 2.5, mb: 2 }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {STATEMENT_COPY.importTitle}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {STATEMENT_COPY.importSubtitle}
          </Typography>
        </Box>
        <StatementSteps
          upload={
            <>
              <Box sx={{ mt: 1.25, p: 1.25, bgcolor: "surface.2", border: 1, borderColor: "divider", borderRadius: 1 }}>
                <Typography component="p" variant="caption" sx={{ color: "text.secondary", fontWeight: 500, overflowWrap: "anywhere" }}>
                  {statementUploadedLine(s.filename, s.totalRows)}
                </Typography>
              </Box>
              <Box sx={{ mt: 1.5 }}>
                {remap ? (
                  <MuiLink component={NextLink} href={statementHref(s.importId)} underline="hover" variant="body2">
                    {STATEMENT_COPY.backToStatement}
                  </MuiLink>
                ) : (
                  <StatementConfirmButton
                    kind="discard"
                    importId={s.importId}
                    version={s.version}
                    label={STATEMENT_COPY.useDifferentFile}
                    body={STATEMENT_COPY.discardBody}
                  />
                )}
              </Box>
            </>
          }
          map={
            <StatementMapForm
              importId={s.importId}
              version={s.version}
              headers={s.headers}
              samples={s.samples}
              initialSelections={s.selections}
              statementDate={s.statementDate}
              totalRows={s.totalRows}
              today={s.today}
              isRemap={remap}
            />
          }
        />
      </Box>
    );
  }

  // ── Review / reconciled ─────────────────────────────────────────────────────
  const rows = await loadStatementRows(s.importId, s.status === "reconciled");
  if (!rows) return <ErrorState />;
  const open = s.status === "review";

  return (
    <Box sx={PAGE_SX}>
      {views}
      <Box component="header" sx={{ mt: 2.5, mb: 2, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {s.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {s.subtitle}
          </Typography>
        </Box>
        {open && (
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
            <MuiLink component={NextLink} href={`${statementHref(s.importId)}?step=map`} underline="hover" variant="body2">
              {STATEMENT_COPY.changeColumns}
            </MuiLink>
            <StatementConfirmButton
              kind="discard"
              importId={s.importId}
              version={s.version}
              label={STATEMENT_COPY.discardLabel}
              body={STATEMENT_COPY.discardBody}
            />
            <StatementConfirmButton
              kind="reconcile"
              importId={s.importId}
              version={s.version}
              label={STATEMENT_COPY.markReconciled}
              body={statementReconcileBody(s.willPay, s.willCreate)}
              disabled={s.needYou > 0}
              describedBy={s.needYou > 0 ? "reconcile-reason" : undefined}
            />
          </Box>
        )}
      </Box>

      {open && s.needYou > 0 && (
        <Typography id="reconcile-reason" component="p" variant="caption" sx={{ display: "block", mt: -1, mb: 1.5, color: "text.secondary" }}>
          {statementStillNeedYou(s.needYou)}
        </Typography>
      )}
      {s.status === "reconciled" && s.reconciledOn && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="success">{statementReconciledLine(s.reconciledOn, s.willPay, s.willCreate)}</Alert>
        </Box>
      )}

      <StatementRowsTable rows={rows} open={open} />
    </Box>
  );
}

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
