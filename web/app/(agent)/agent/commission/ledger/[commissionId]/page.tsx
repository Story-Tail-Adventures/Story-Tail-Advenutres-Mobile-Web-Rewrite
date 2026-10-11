import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiButton from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { CommissionLineForm } from "@/components/agent/CommissionLineForm";
import { CommissionPaymentForm } from "@/components/agent/CommissionPaymentForm";
import { CommissionRemoveButton } from "@/components/agent/CommissionRemoveButton";
import { EmptyState, ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { loadCommissionLine } from "@/lib/agent/commission";
import { editStatusOptions } from "@/lib/agent/commissionForm";
import { COMMISSION_COPY } from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";
import { loadSuppliers } from "@/lib/agent/tripBuilder";

/**
 * Screen 3.7.3 — Commission Detail / Edit. §4.4 Pattern C: the record on the left, its
 * actions on the right, as A373_CommissionDetail draws it.
 *
 * WHAT THE ARTBOARD DRAWS AND HOW EACH PIECE LANDED:
 *   * The eleven fields → `CommissionLineForm`, with Expected as a read-out rather than an
 *     input (the server computes it; see the form's header). Trip and client are not fields:
 *     a line belongs to the trip it was entered against, so they sit in the header and the
 *     trip is one click away.
 *   * "Mark received" → `CommissionPaymentForm`, the only way to received or disputed, with
 *     the gap shown live. Received date and amount live there, not in the edit form.
 *   * "Link Inteletravel row" → disabled with its reason until §3.7.6. The reference itself
 *     is still editable by hand in the form.
 *   * "Payment expectation" → from the line's terms: "Sandals Resorts · 60 days after travel.
 *     Expected around Oct 18, 2026." — or why there is no date yet.
 *   * Not drawn, added: "Remove line", only while the line may be removed (Gyasi, 2026-10-11).
 *
 * Web only, like every §3.7 write: §6.6 keeps forms in a browser.
 */

export const metadata = { title: "Commission line" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CommissionLinePage({
  params,
}: {
  params: Promise<{ commissionId: string }>;
}) {
  const { commissionId } = await params;

  // A malformed id would reach PostgREST as a 400 and read as "the ledger is down". It is a
  // bad link, so it gets the not-found answer without a round trip.
  const [result, suppliers] = UUID.test(commissionId)
    ? await Promise.all([loadCommissionLine(commissionId), loadSuppliers()])
    : [{ ok: false as const, reason: "not-found" as const }, []];

  if (!result.ok && result.reason === "not-found") {
    return (
      <Box sx={PAGE_SX}>
        <EmptyState
          icon="receipt"
          title={COMMISSION_COPY.lineNotFoundTitle}
          body={COMMISSION_COPY.lineNotFoundBody}
          action={{ label: COMMISSION_COPY.backToLedger, href: "/agent/commission/ledger" }}
        />
      </Box>
    );
  }
  if (!result.ok || !suppliers) return <ErrorState />;

  const line = result.line;

  return (
    <Box sx={PAGE_SX}>
      <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />

      <MuiButton
        component={NextLink}
        href="/agent/commission/ledger"
        variant="text"
        size="small"
        sx={{ mt: 2, px: 0, gap: 0.5 }}
      >
        <Icon name="arrow_left" size={14} /> {COMMISSION_COPY.backToLedger}
      </MuiButton>

      <Box component="header" sx={{ mt: 0.5, mb: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Typography component="h1" variant="h5" sx={{ m: 0, minWidth: 0 }}>
            {line.heading}
          </Typography>
          <StatusChip kind={line.statusChip} label={line.statusLabel} />
        </Box>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {line.clientName}
          {" · "}
          {line.tripHref ? (
            <MuiLink component={NextLink} href={line.tripHref} underline="hover">
              {COMMISSION_COPY.openTrip}
            </MuiLink>
          ) : (
            COMMISSION_COPY.archivedTripNote
          )}
        </Typography>
      </Box>

      <Box sx={GRID_SX}>
        <Card>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <CommissionLineForm
              mode={{ kind: "edit", tripId: line.tripId, commissionId: line.commissionId, version: line.version }}
              suppliers={suppliers}
              initial={line.lineValues}
              statusOptions={editStatusOptions(line.status)}
              currency={line.currency}
              cancelHref="/agent/commission/ledger"
            />
          </CardContent>
        </Card>

        <Stack component="aside" spacing={1.25}>
          <Card>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Typography component="h2" variant="subtitle1" sx={{ m: 0, mb: 1, fontWeight: 600 }}>
                {COMMISSION_COPY.markReceived}
              </Typography>
              {line.paidLine && (
                <Typography component="p" variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
                  {line.paidLine}
                </Typography>
              )}
              <CommissionPaymentForm
                commissionId={line.commissionId}
                tripId={line.tripId}
                version={line.version}
                today={line.today}
                expectedCents={line.expectedCents}
                currency={line.currency}
                initial={line.paymentValues}
              />
            </CardContent>
          </Card>

          {/* Disabled with its reason, visible — see CommissionHeader for why not a title. */}
          <Box>
            <Button
              type="button"
              variant="tonal"
              fullWidth
              disabled
              aria-describedby="link-inteletravel-reason"
            >
              <Icon name="link" size={12} /> {COMMISSION_COPY.linkInteletravel}
            </Button>
            <Typography id="link-inteletravel-reason" component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
              {COMMISSION_COPY.linkDeferred}
            </Typography>
          </Box>

          <Paper elevation={0} sx={{ p: 1.75, bgcolor: "tertiary.container", color: "tertiary.onContainer" }}>
            <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
              {COMMISSION_COPY.expectationTitle}
            </Typography>
            <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5 }}>
              {line.termsLine}. {line.expectationLine}
            </Typography>
          </Paper>

          {line.canRemove ? (
            <CommissionRemoveButton
              commissionId={line.commissionId}
              tripId={line.tripId}
              version={line.version}
            />
          ) : (
            <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
              {COMMISSION_COPY.removeNotAllowed}
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

/** The ledger's column, so moving between the two does not shift the page. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;

/** The artboard's `1fr 300px`, stacked below `md`. */
const GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 320px" },
  gap: 2.25,
  alignItems: "start",
  maxWidth: 1080,
} as const;
