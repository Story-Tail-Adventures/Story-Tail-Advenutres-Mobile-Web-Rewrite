import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import OutlinedInput from "@mui/material/OutlinedInput";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import {
  deleteMilestoneAction,
  setMilestoneStatusAction,
} from "@/app/(agent)/agent/trips/[tripId]/payments/actions";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SCHEDULE_COPY } from "@/lib/agent/content";
import { MILESTONE_STATUSES, centsToDollars } from "@/lib/agent/payments";
import type { TripPaymentRow } from "@/lib/agent/tripDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { OutlinedNativeSelect } from "@/components/mui/OutlinedNativeSelect";

/**
 * §3.4.15's schedule rows.
 *
 * THE STATUS CONTROL IS A SELECT PLUS A SUBMIT, not four buttons and not a checkbox. The
 * Screen Inventory's Primary elements line says "paid Y/N", and `payment_milestone_status`
 * has four values — `waived` is not `scheduled` and an advisor has to be able to say so.
 * A checkbox would make two of the four unreachable.
 *
 * THE "AMOUNT THAT ARRIVED" FIELD SITS BESIDE IT because §9.5 says partial payments happen,
 * and blank means the whole amount. One form, so the status and the amount can never be
 * submitted apart — which is the same reason the SQL moves `status`, `paid_cents` and
 * `paid_at` together.
 *
 * A SERVER COMPONENT. Every control is a write that navigates; none needs state between
 * renders, so there is no client island here at all.
 *
 * AN MUI TABLE SINCE THE MUI PASS (step 2, PR 6), as the artboard (A3415_PaymentSchedule)
 * draws the schedule and as `SCHEDULE_COPY.colLabel` / `colStatus` were already waiting to
 * head it. It was a list of cards. Four columns: the payment (its label over the same
 * "Due … · Paid …" line it always carried), the amount (with the partial "on file" line
 * under it), the status form, and the row's Edit and Remove. Every form, name, value, id,
 * label and action is the one the card list posted. The row being edited keeps
 * `aria-current="true"` and the primary-container tint.
 */

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export function PaymentScheduleTable({
  tripId,
  payments,
  editingId,
}: {
  tripId: string;
  payments: TripPaymentRow[];
  editingId: string | null;
}) {
  if (payments.length === 0) {
    return (
      <Card>
        <CardContent sx={{ px: 2, py: 4, textAlign: "center", "&:last-child": { pb: 4 } }}>
          <Typography component="p" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {SCHEDULE_COPY.emptyTitle}
          </Typography>
          <Typography
            component="p"
            variant="body2"
            sx={{ mx: "auto", mt: 0.5, maxWidth: "44ch", color: "text.secondary" }}
          >
            {SCHEDULE_COPY.emptyBody}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{SCHEDULE_COPY.colLabel}</TableCell>
            <TableCell scope="col" align="right">{SCHEDULE_COPY.colAmount}</TableCell>
            <TableCell scope="col">{SCHEDULE_COPY.colStatus}</TableCell>
            {/* The actions column has no heading; its controls name themselves. */}
            <TableCell scope="col" />
          </TableRow>
        </TableHead>
        <TableBody>
          {payments.map((p) => {
            const isEditing = p.milestoneId === editingId;
            return (
              <TableRow
                key={p.milestoneId}
                hover={!isEditing}
                aria-current={isEditing ? "true" : undefined}
                sx={isEditing ? { bgcolor: "primary.container" } : undefined}
              >
                <TableCell sx={{ minWidth: 180 }}>
                  <Typography component="p" variant="body2" sx={{ fontWeight: 600 }}>
                    {p.label}
                  </Typography>
                  <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                    {[
                      p.dueLabel ? `${SCHEDULE_COPY.colDue} ${p.dueLabel}` : null,
                      // Only on a row that has actually been paid. A `paid_at` on anything else
                      // would be a date for a payment the row no longer records — which is why
                      // the write clears it.
                      p.status === "paid" && p.paidOnLabel ? `Paid ${p.paidOnLabel}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </Typography>
                </TableCell>

                <TableCell align="right" sx={{ fontFamily: "mono", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {p.amountLabel}
                  {/* Shown only when it differs from the amount: an advisor scanning the
                      schedule needs to spot a partial payment, and repeating the same figure
                      on every settled row buries it. */}
                  {p.status === "paid" && p.paidLabel !== p.amountLabel && (
                    <Typography component="span" variant="caption" sx={{ display: "block", fontWeight: 400, color: "text.secondary" }}>
                      {p.paidLabel} {SCHEDULE_COPY.colPaid.toLowerCase()}
                    </Typography>
                  )}
                </TableCell>

                {/* ── Status + what arrived ─────────────────────────────── */}
                <TableCell>
                  <Box
                    component="form"
                    action={setMilestoneStatusAction}
                    sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
                  >
                    <input type="hidden" name="tripId" value={tripId} />
                    <input type="hidden" name="milestoneId" value={p.milestoneId} />
                    <Box component="label" htmlFor={`status-${p.milestoneId}`} sx={VISUALLY_HIDDEN}>
                      {SCHEDULE_COPY.markLabel} — {p.label}
                    </Box>
                    {/* Through a client wrapper: NativeSelect reads its `input` element's
                        props, which a Server Component cannot hand it (this page 500'd). */}
                    <OutlinedNativeSelect
                      id={`status-${p.milestoneId}`}
                      name="status"
                      defaultValue={p.status}
                    >
                      {MILESTONE_STATUSES.map((s) => (
                        <option key={s.value} value={s.value} title={s.hint}>
                          {s.label}
                        </option>
                      ))}
                    </OutlinedNativeSelect>
                    <Box component="label" htmlFor={`paid-${p.milestoneId}`} sx={VISUALLY_HIDDEN}>
                      {SCHEDULE_COPY.markPaidAmount} — {p.label}
                    </Box>
                    <OutlinedInput
                      id={`paid-${p.milestoneId}`}
                      name="paidAmount"
                      // Prefilled only on a paid row, and only when it was partial. On anything
                      // else a prefilled figure would look like a payment already recorded.
                      defaultValue={
                        p.status === "paid" && p.paidLabel !== p.amountLabel
                          ? centsToDollars(p.edit.paidCents)
                          : ""
                      }
                      placeholder={SCHEDULE_COPY.colAmount}
                      size="small"
                      inputProps={{ inputMode: "decimal" }}
                      sx={{ width: 96, fontFamily: "mono" }}
                    />
                    <Button type="submit" variant="tonal" size="sm">
                      {SCHEDULE_COPY.markApply}
                    </Button>
                  </Box>
                </TableCell>

                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <MuiButton
                      component={NextLink}
                      href={`/agent/trips/${tripId}/payments?edit=${p.milestoneId}`}
                      variant="text"
                      size="small"
                      sx={BTN_SM}
                    >
                      {SCHEDULE_COPY.edit}
                      <Box component="span" sx={VISUALLY_HIDDEN}> {p.label}</Box>
                    </MuiButton>

                    <Box component="form" action={deleteMilestoneAction} sx={{ display: "inline-flex" }}>
                      <input type="hidden" name="tripId" value={tripId} />
                      <input type="hidden" name="milestoneId" value={p.milestoneId} />
                      <IconButton
                        type="submit"
                        size="small"
                        title={SCHEDULE_COPY.removeHint}
                        sx={{ width: 28, height: 28 }}
                      >
                        <Icon name="trash" size={13} />
                        <Box component="span" sx={VISUALLY_HIDDEN}>
                          {SCHEDULE_COPY.remove} {p.label} — {SCHEDULE_COPY.removeHint}
                        </Box>
                      </IconButton>
                    </Box>
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
