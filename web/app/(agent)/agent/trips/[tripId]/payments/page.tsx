import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import Paper from "@mui/material/Paper";

import { MarkPaidDialog } from "@/components/agent/MarkPaidDialog";
import { MilestoneForm } from "@/components/agent/MilestoneForm";
import { PayLinkDialog } from "@/components/agent/PayLinkDialog";
import { PaymentScheduleTable } from "@/components/agent/PaymentScheduleTable";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PAYMENTS_COPY, SCHEDULE_COPY } from "@/lib/agent/content";
import { newMessageHref } from "@/lib/agent/messageQuery";
import {
  centsToDollars,
  isMilestoneKind,
  nextUnpaidMilestone,
  type MilestoneValues,
} from "@/lib/agent/payments";
import { formatTripMoney } from "@/lib/trips/money";
import {
  loadTripOverview,
  loadTripPayments,
  type TripPaymentRow,
} from "@/lib/agent/tripDetail";
import { agentIdentity, localDate } from "@/lib/agent/queries";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.4.15 — Trip Payment Schedule.
 *
 * ITS OWN ROUTE, not an editor grafted onto §3.4.2's Payments tab, matching what §3.4.4 did
 * for components. The tab stays a read — it is one of eight on a screen about the whole
 * trip — and this is where the schedule is worked on. `?edit=<id>` opens a row in the form,
 * the same URL-as-state shape `?tab=` and `?add=` already use.
 *
 * "REMIND THE CLIENT" (the inventory's "trigger reminder", §3.10 Stage 2) is ONE button for
 * the schedule, about the next unpaid milestone: it opens the trip's thread with the template
 * picker on Payment reminder, filled from that milestone. With nothing left to pay it stays
 * off and says why. The cadence toggle is still not built: automatic reminders need a
 * scheduler that sends on the advisor's behalf, and email (Stage 4).
 *
 * §3.6 SUPPLIER PAYMENTS (ruled 2026-10-16) lives on this same page, as Screen-Inventory
 * §3.6.1 allows, so there is one list of milestones rather than two kept in step. The rows
 * gain a pay link column with Mark paid and Send link. Two more URL states join `?edit=`:
 * `?link=<id>` opens Add or edit pay link (3.6.1b) and `?paid=<id>` opens Mark Paid
 * (3.6.5). Payment History (3.6.6) is its own route, `./history`, read-only.
 */

export const metadata = { title: "Payments" };

/** The page column: `mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1100,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

/** Legacy `.card.p-4`: 16px inside the header card, MUI's last-child rule cancelled. */
const CARD_PAD = { p: 2, "&:last-child": { pb: 2 } } as const;

function editValues(row: TripPaymentRow): MilestoneValues {
  return {
    milestoneId: row.milestoneId,
    kind: isMilestoneKind(row.kind) ? row.kind : "deposit",
    label: row.label,
    amount: centsToDollars(row.edit.amountCents),
    dueDate: row.edit.dueDate ?? "",
  };
}

export default async function TripPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ edit?: string; link?: string; paid?: string }>;
}) {
  const { tripId } = await params;
  const { edit, link, paid } = await searchParams;

  const [result, payments, me] = await Promise.all([
    loadTripOverview(tripId),
    loadTripPayments(tripId),
    agentIdentity(),
  ]);

  // A trip that is not there is not an error — `agent_trip_overview` answers zero rows for
  // "no such trip" and "not yours" alike, deliberately.
  if (!result.ok && result.reason === "not-found") return <TripNotFound />;
  if (!result.ok || !payments) return <ErrorState />;

  const overview = result.overview;
  const editingRow = edit ? payments.find((p) => p.milestoneId === edit) : undefined;
  const linkRow = link ? payments.find((p) => p.milestoneId === link) : undefined;
  // Mark Paid is for a payment still open; a stale `?paid=` on a settled row opens nothing.
  const paidRow = paid
    ? payments.find((p) => p.milestoneId === paid && (p.status === "scheduled" || p.status === "overdue"))
    : undefined;
  const today = localDate(new Date().toISOString(), me.timeZone) ?? new Date().toISOString().slice(0, 10);
  const basePath = `/agent/trips/${tripId}/payments`;
  const summaryFor = (row: TripPaymentRow) => ({
    label: row.label,
    context: `${overview.title} · ${overview.clientName}`,
    amountLabel: row.amountLabel,
    dueLabel: row.dueLabel,
  });

  // Summed here rather than read off the trip, and the two answer different questions.
  // `trip.total_paid_cents` is what has been PAID and it is trigger-maintained from these
  // same rows; this is what the schedule EXPECTS, which nothing stores because a schedule
  // is allowed to be incomplete.
  const expectedCents = payments.reduce((sum, p) => sum + Number(p.edit.amountCents || 0), 0);
  const paidCents = payments.reduce((sum, p) => sum + Number(p.edit.paidCents || 0), 0);
  const currency = "USD";
  const remindAbout = nextUnpaidMilestone(payments);

  return (
    <Box sx={PAGE_SX}>
      <Card component="header" sx={{ mt: 2.5 }}>
        <CardContent sx={CARD_PAD}>
          <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
            <MuiLink
              component={NextLink}
              href={`/agent/trips/${tripId}`}
              underline="hover"
              color="inherit"
            >
              {SCHEDULE_COPY.backToTrip}
            </MuiLink>{" "}
            · {overview.clientName}
          </Typography>
          <Typography component="h1" variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
            {overview.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {SCHEDULE_COPY.subtitle}
          </Typography>

          <Box
            component="dl"
            sx={{ m: 0, mt: 1.5, display: "flex", flexWrap: "wrap", columnGap: 4, rowGap: 1 }}
          >
            <div>
              <Typography
                component="dt"
                variant="caption"
                sx={{ display: "block", fontWeight: 500, color: "text.secondary" }}
              >
                {SCHEDULE_COPY.totalExpected}
              </Typography>
              <Typography
                component="dd"
                variant="subtitle1"
                sx={{ m: 0, fontWeight: 600, fontFamily: "mono" }}
              >
                {formatTripMoney(expectedCents, currency, { whole: true })}
              </Typography>
            </div>
            <div>
              <Typography
                component="dt"
                variant="caption"
                sx={{ display: "block", fontWeight: 500, color: "text.secondary" }}
              >
                {SCHEDULE_COPY.totalPaid}
              </Typography>
              <Typography
                component="dd"
                variant="subtitle1"
                sx={{ m: 0, fontWeight: 600, fontFamily: "mono" }}
              >
                {formatTripMoney(paidCents, currency, { whole: true })}
              </Typography>
            </div>
            <div>
              <Typography
                component="dt"
                variant="caption"
                sx={{ display: "block", fontWeight: 500, color: "text.secondary" }}
              >
                {SCHEDULE_COPY.totalTrip}
              </Typography>
              <Typography
                component="dd"
                variant="subtitle1"
                sx={{ m: 0, fontWeight: 600, fontFamily: "mono" }}
              >
                {overview.totalValueLabel}
              </Typography>
            </div>
          </Box>
          <Typography
            component="p"
            variant="body2"
            sx={{ mt: 1, display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}
          >
            <Icon name="info" size={12} /> {SCHEDULE_COPY.totalsHint}
          </Typography>
        </CardContent>
      </Card>

      <Box
        sx={{
          mt: 2,
          display: "grid",
          gap: 2,
          // minmax(0, 1fr), as Tailwind's grid-cols-1 was: a bare 1fr track cannot shrink
          // below its content, so the schedule table pushed the page 298px past a phone.
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 340px" },
        }}
      >
        <Box component="section">
          <Box
            sx={{ mb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
          >
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
              {SCHEDULE_COPY.title}
            </Typography>
            <MuiButton
              component={NextLink}
              href={`${basePath}/history`}
              variant="outlined"
              size="small"
              sx={{ ml: "auto", minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" }}
            >
              <Icon name="clock" size={12} /> {PAYMENTS_COPY.history}
            </MuiButton>
            {remindAbout ? (
              <MuiButton
                component={NextLink}
                href={newMessageHref(overview.clientId, tripId, remindAbout.milestoneId)}
                variant="outlined"
                size="small"
                sx={{ minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" }}
              >
                <Icon name="send" size={12} /> {SCHEDULE_COPY.remindLabel}
              </MuiButton>
            ) : (
              <Button type="button" variant="outlined" size="sm" disabled title={SCHEDULE_COPY.remindNothing}>
                {SCHEDULE_COPY.remindLabel}
                <Box component="span" sx={VISUALLY_HIDDEN}>. {SCHEDULE_COPY.remindNothing}</Box>
              </Button>
            )}
          </Box>
          <PaymentScheduleTable
            tripId={tripId}
            clientId={overview.clientId}
            payments={payments}
            editingId={editingRow?.milestoneId ?? null}
          />

          <Paper
            elevation={0}
            sx={{
              mt: 1.75,
              p: 1.5,
              bgcolor: "secondary.container",
              color: "secondary.onContainer",
              display: "flex",
              gap: 1.25,
              alignItems: "center",
            }}
          >
            <Icon name="shield" size={16} />
            <Typography component="p" variant="caption">
              <b>{PAYMENTS_COPY.directNoteStrong}</b> {PAYMENTS_COPY.directNote}
            </Typography>
          </Paper>
        </Box>

        <MilestoneForm
          tripId={tripId}
          // `key` forces a fresh form when the row being edited changes. Without it React
          // keeps the mounted instance and its `useActionState` values, so clicking Edit on
          // a second row would show the first row's fields over the second row's id.
          key={editingRow?.milestoneId ?? "new"}
          initial={editingRow ? editValues(editingRow) : undefined}
        />
      </Box>

      {linkRow && (
        <PayLinkDialog
          key={`link-${linkRow.milestoneId}`}
          tripId={tripId}
          milestoneId={linkRow.milestoneId}
          label={linkRow.label}
          currentUrl={linkRow.payUrl}
          closeHref={basePath}
          summary={summaryFor(linkRow)}
        />
      )}
      {paidRow && (
        <MarkPaidDialog
          key={`paid-${paidRow.milestoneId}`}
          tripId={tripId}
          milestoneId={paidRow.milestoneId}
          label={paidRow.label}
          today={today}
          closeHref={basePath}
          summary={summaryFor(paidRow)}
          initial={{
            // What is still open on the row: the figure that most likely just landed.
            amount: centsToDollars(
              Math.max(Number(paidRow.edit.amountCents || 0) - Number(paidRow.edit.paidCents || 0), 0) ||
                Number(paidRow.edit.amountCents || 0),
            ),
            paidOn: today,
            reference: paidRow.paidReference ?? "",
            note: paidRow.paidNote ?? "",
          }}
        />
      )}
    </Box>
  );
}
