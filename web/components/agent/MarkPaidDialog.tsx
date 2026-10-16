"use client";

import { useActionState, useId } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";

import { markPaidAction } from "@/app/(agent)/agent/trips/[tripId]/payments/actions";
import { MilestoneSummary, type MilestoneSummaryProps } from "@/components/agent/MilestoneSummary";
import { Alert } from "@/components/ui/Alert";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TextareaField } from "@/components/ui/Textarea";
import { PAYMENTS_COPY } from "@/lib/agent/content";
import type { MarkPaidState, MarkPaidValues } from "@/lib/agent/payments";

/** The A36 modal paper: 580px, or the viewport less a 16px gutter on a phone. */
const PAPER_SX = { m: 2, width: "min(580px, calc(100vw - 2rem))", maxWidth: "none" } as const;

/**
 * §3.6.5 Mark Paid (artboard A365_MarkPaid, ruled 2026-10-16). P1, web only.
 *
 * Only the advisor marks a payment paid, once the supplier confirms it. A client's "I've
 * paid" is a message in the thread and never reaches this record. Writes through
 * `payment_paid`, the same path §3.4.15's status control uses, so it stays the only thing
 * that can move `trip.total_paid_cents`.
 *
 * URL AS STATE (`?paid=<id>`), like `?edit=`. NOT DRAWN: the artboard's "From the thread"
 * quote of the client's message. Finding which message was the "I've paid" one would mean
 * guessing at message text, and a wrong quote here is worse than none.
 */
export function MarkPaidDialog({
  tripId,
  milestoneId,
  label,
  initial,
  today,
  closeHref,
  summary,
}: {
  tripId: string;
  milestoneId: string;
  label: string;
  initial: MarkPaidValues;
  /** The advisor's own date, the latest a payment can have landed. */
  today: string;
  closeHref: string;
  summary: MilestoneSummaryProps;
}) {
  const router = useRouter();
  const titleId = useId();
  const [state, formAction, pending] = useActionState<MarkPaidState, FormData>(markPaidAction, {});
  const values = state.values ?? initial;
  const err = state.fieldErrors ?? {};

  return (
    <Dialog
      open
      onClose={(_event, reason) => {
        if (reason !== "backdropClick" && !pending) router.push(closeHref);
      }}
      maxWidth={false}
      aria-labelledby={titleId}
      slotProps={{ paper: { sx: PAPER_SX } }}
    >
      <DialogContent sx={{ p: 2.75 }}>
        <Box component="form" action={formAction}>
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="milestoneId" value={milestoneId} />

          <Typography id={titleId} component="h2" variant="h5" sx={{ m: 0 }}>
            {PAYMENTS_COPY.paidTitle(label)}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {PAYMENTS_COPY.paidBody}
          </Typography>
          <MilestoneSummary {...summary} />

          {state.formError && (
            <Box sx={{ mt: 1.5 }}>
              <Alert tone="error">{state.formError}</Alert>
            </Box>
          )}

          <Box
            sx={{
              mt: 1.5,
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
            }}
          >
            <Box sx={{ "& input": { fontFamily: "mono" } }}>
              <Field
                id="paid-amount"
                name="amount"
                inputMode="decimal"
                label={PAYMENTS_COPY.paidAmount}
                defaultValue={values.amount}
                error={err.amount}
              />
            </Box>
            <DateField
              id="paid-on"
              name="paidOn"
              label={PAYMENTS_COPY.paidDate}
              defaultValue={values.paidOn}
              max={today}
              required
              error={err.paidOn}
            />
            <Box sx={{ gridColumn: { sm: "span 2" }, "& input": { fontFamily: "mono" } }}>
              <Field
                id="paid-reference"
                name="reference"
                autoComplete="off"
                label={PAYMENTS_COPY.paidReference}
                defaultValue={values.reference}
                maxLength={100}
                error={err.reference}
              />
            </Box>
            <Box sx={{ gridColumn: { sm: "span 2" } }}>
              <TextareaField
                id="paid-note"
                name="note"
                rows={2}
                label={PAYMENTS_COPY.paidNote}
                defaultValue={values.note}
                maxLength={1000}
                hint={PAYMENTS_COPY.paidNoteHint}
                error={err.note}
              />
            </Box>
          </Box>
          <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            {PAYMENTS_COPY.paidOnlyYou}
          </Typography>

          <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1.25 }}>
            <MuiButton type="button" variant="text" disabled={pending} onClick={() => router.push(closeHref)}>
              {PAYMENTS_COPY.cancel}
            </MuiButton>
            <MuiButton
              type="submit"
              variant="contained"
              disabled={pending}
              startIcon={<Icon name="check" size={12} />}
              sx={{ ml: "auto" }}
            >
              {pending ? PAYMENTS_COPY.paidSaving : PAYMENTS_COPY.paidSave}
            </MuiButton>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
