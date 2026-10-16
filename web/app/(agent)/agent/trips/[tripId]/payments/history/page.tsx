import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { PAYMENTS_COPY } from "@/lib/agent/content";
import { isUuid } from "@/lib/agent/messageQuery";
import { loadTripOverview, loadTripPaymentHistory, loadTripPayments } from "@/lib/agent/tripDetail";

/**
 * Screen 3.6.6 Payment History (artboard A366_PaymentHistory, ruled 2026-10-16). P1, web only.
 *
 * A read-only record, per trip, of every paid mark and every pay link added, changed or
 * removed, read from `audit_event` through `agent_trip_payment_history`. No new table, and
 * nothing here can be edited. A client's "I've paid" lives in the message thread, not here.
 *
 * `?m=<milestoneId>` filters to one payment, so a filtered view is a link. The chips come
 * from the trip's current milestones; a deleted milestone's events still show under "All
 * payments", labelled from the event itself.
 */

export const metadata = { title: "Payment history" };

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1100, px: { xs: 2, md: 4 }, py: 3 } as const;

export default async function PaymentHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { tripId } = await params;
  const { m } = await searchParams;
  const filter = isUuid(m) ? m.toLowerCase() : null;

  const [result, history, payments] = await Promise.all([
    loadTripOverview(tripId),
    loadTripPaymentHistory(tripId),
    loadTripPayments(tripId),
  ]);

  if (!result.ok && result.reason === "not-found") return <TripNotFound />;
  if (!result.ok || !history) return <ErrorState />;

  const overview = result.overview;
  const base = `/agent/trips/${tripId}/payments`;
  const rows = filter ? history.filter((h) => h.milestoneId?.toLowerCase() === filter) : history;

  return (
    <Box sx={PAGE_SX}>
      <Box sx={{ mt: 2.5, display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            {PAYMENTS_COPY.historyTitle} · {overview.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {PAYMENTS_COPY.historySubtitle}
          </Typography>
        </Box>
        <MuiButton
          component={NextLink}
          href={base}
          variant="outlined"
          size="small"
          sx={{ minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" }}
        >
          <Icon name="arrow_left" size={12} /> {PAYMENTS_COPY.historyBack}
        </MuiButton>
      </Box>

      {payments && payments.length > 0 && (
        <Box component="nav" aria-label={PAYMENTS_COPY.historyPayment} sx={{ mt: 2, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          <Chip
            component={NextLink}
            href={`${base}/history`}
            clickable
            label={PAYMENTS_COPY.historyAll}
            color={filter === null ? "secondary" : "default"}
            variant={filter === null ? "filled" : "outlined"}
            aria-current={filter === null ? "page" : undefined}
          />
          {payments.map((p) => {
            const on = filter === p.milestoneId.toLowerCase();
            return (
              <Chip
                key={p.milestoneId}
                component={NextLink}
                href={`${base}/history?m=${p.milestoneId}`}
                clickable
                label={p.label}
                color={on ? "secondary" : "default"}
                variant={on ? "filled" : "outlined"}
                aria-current={on ? "page" : undefined}
              />
            );
          })}
        </Box>
      )}

      <Card sx={{ mt: 1.25, overflowX: "auto" }}>
        {rows.length === 0 ? (
          <CardContent sx={{ px: 2, py: 4, textAlign: "center", "&:last-child": { pb: 4 } }}>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {PAYMENTS_COPY.historyEmpty}
            </Typography>
          </CardContent>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell scope="col">{PAYMENTS_COPY.historyWhen}</TableCell>
                <TableCell scope="col">{PAYMENTS_COPY.historyWhat}</TableCell>
                <TableCell scope="col">{PAYMENTS_COPY.historyPayment}</TableCell>
                <TableCell scope="col">{PAYMENTS_COPY.historyDetails}</TableCell>
                <TableCell scope="col">{PAYMENTS_COPY.historyBy}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.eventId} hover>
                  <TableCell sx={{ fontWeight: 500, whiteSpace: "nowrap" }}>{r.whenLabel}</TableCell>
                  <TableCell>
                    <StatusChip kind={r.chip} label={r.kindLabel} />
                  </TableCell>
                  <TableCell>{r.milestoneLabel}</TableCell>
                  <TableCell sx={{ fontFamily: "mono", fontSize: 12, color: "text.secondary", overflowWrap: "anywhere" }}>
                    {r.detail}
                  </TableCell>
                  <TableCell>{r.who}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Typography component="p" variant="caption" sx={{ display: "block", mt: 1.25, color: "text.secondary" }}>
        {PAYMENTS_COPY.historyFoot}
      </Typography>
    </Box>
  );
}
