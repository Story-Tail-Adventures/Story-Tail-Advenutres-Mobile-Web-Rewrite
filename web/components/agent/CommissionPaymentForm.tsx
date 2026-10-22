"use client";

import { startTransition, useActionState, useState } from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";

import { recordPaymentAction } from "@/app/(agent)/agent/commission/ledger/actions";
import { MoneyInput } from "@/components/agent/CommissionLineForm";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { fieldLabelSx } from "@/components/ui/Field";
import {
  previewGapCents,
  type PaymentFormState,
  type PaymentValues,
} from "@/lib/agent/commissionForm";
import { COMMISSION_COPY, commissionGapLine } from "@/lib/agent/content";
import { formatTripMoney } from "@/lib/trips/money";

/**
 * 3.7.3's "Mark received" — the ONLY way a line reaches received or disputed.
 *
 * THE GAP IS SHOWN AS IT IS TYPED: expected − fee − received, the expression §3.7.6
 * reconciles on. Zero is settled; a shortfall the fee does not explain is the thing to chase,
 * so the form SUGGESTS Disputed when there is one — until the advisor picks a status
 * themselves, after which it stops second-guessing them. A payment can land short for a
 * reason Gyasi already knows about; the suggestion is a nudge, not a rule.
 *
 * The date defaults to the advisor's today and cannot be later — the SERVER decides that, in
 * the advisor's zone, so a tab left open past midnight is not refused the real today.
 *
 * THE FORM IS NOT ALLOWED TO RESET, for the reason CommissionLineForm gives — and here it was
 * worse: MUI's Radio takes its default from the first render, so after a refused save the
 * DOM showed Received while state said Disputed, and the next save recorded a short payment
 * as received in full. Submit is intercepted and dispatched in a transition instead.
 */
export function CommissionPaymentForm({
  commissionId,
  tripId,
  version,
  today,
  expectedCents,
  currency,
  initial,
}: {
  commissionId: string;
  tripId: string;
  version: number;
  today: string;
  expectedCents: number;
  currency: string;
  initial: PaymentValues;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    recordPaymentAction,
    {},
  );
  const values = state.values ?? initial;
  const err = (name: keyof PaymentValues) => state.fieldErrors?.[name];

  const [received, setReceived] = useState(values.received);
  const [fee, setFee] = useState(values.fee);
  const [status, setStatus] = useState(values.status === "disputed" ? "disputed" : "received");
  const [statusChosen, setStatusChosen] = useState(false);

  const gap = previewGapCents(expectedCents, received, fee);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  function suggest(nextReceived: string, nextFee: string) {
    if (statusChosen) return;
    const g = previewGapCents(expectedCents, nextReceived, nextFee);
    if (g !== null) setStatus(g > 0 ? "disputed" : "received");
  }

  return (
    <Box component="form" action={formAction} onSubmit={onSubmit}>
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="version" value={version} />

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <MoneyInput
          id="pay-received"
          name="received"
          label={COMMISSION_COPY.receivedAmountLabel}
          error={err("received")}
          defaultValue={values.received}
          onChange={(v) => { setReceived(v); suggest(v, fee); }}
        />
        <MoneyInput
          id="pay-fee"
          name="fee"
          label={COMMISSION_COPY.feeLabel}
          hint={COMMISSION_COPY.feeHint}
          error={err("fee")}
          defaultValue={values.fee}
          onChange={(v) => { setFee(v); suggest(received, v); }}
        />

        {/* The live region is always in the DOM; only its words change. A region inserted
            with its content already in it is not reliably announced. */}
        <Typography
          component="p"
          variant="body2"
          role="status"
          sx={{ color: "text.primary", fontWeight: gap !== null && gap > 0 ? 600 : 400, minHeight: "1.5em" }}
        >
          {gap === null ? "" : commissionGapLine(gap, formatTripMoney(Math.abs(gap), currency))}
        </Typography>

        <DateField
          id="pay-received-at"
          name="receivedAt"
          label={COMMISSION_COPY.receivedOnLabel}
          defaultValue={values.receivedAt}
          max={today}
          required
          error={err("receivedAt")}
        />

        <FormControl>
          <FormLabel id="pay-status-label" sx={fieldLabelSx}>{COMMISSION_COPY.recordAsLabel}</FormLabel>
          <RadioGroup
            row
            name="status"
            aria-labelledby="pay-status-label"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setStatusChosen(true); }}
          >
            <FormControlLabel value="received" control={<Radio size="small" />} label={COMMISSION_COPY.recordReceived} />
            <FormControlLabel value="disputed" control={<Radio size="small" />} label={COMMISSION_COPY.recordDisputed} />
          </RadioGroup>
        </FormControl>
      </Box>

      <Box sx={{ mt: 1.5 }}>
        <Button type="submit" variant="filled" fullWidth disabled={pending}>
          {pending ? COMMISSION_COPY.saving : COMMISSION_COPY.savePayment}
        </Button>
      </Box>
    </Box>
  );
}
