"use client";

import Link from "next/link";
import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { saveMilestoneAction } from "@/app/(agent)/agent/trips/[tripId]/payments/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Field, fieldInputSx, fieldLabelSx } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/Select";
import { SCHEDULE_COPY } from "@/lib/agent/content";
import {
  MILESTONE_KINDS,
  emptyMilestone,
  type MilestoneValues,
  type ScheduleState,
} from "@/lib/agent/payments";

/**
 * §3.4.15's add/edit form — the schedule half only.
 *
 * NOTHING HERE POSTS `paid_cents` OR `status`. Those belong to the row's own status control
 * in `PaymentScheduleTable`, and keeping them out of this form is what makes a label edit
 * incapable of moving `trip.total_paid_cents` — the figure a traveler is shown as their
 * outstanding balance when they authorize a card. The separation runs SQL → route → action
 * → form, and this is its last layer.
 *
 * ON THE FORM PRIMITIVES (step 2 of the migration, PR 6): SelectField, Field and DateField
 * carry the label-above-input layout and the hint/error wiring, with the same ids and names
 * the action reads. The amount is the one field drawn by hand, from the same parts, because
 * its input is set in the mono face and the primitive takes no sx.
 */

/** The legacy `.btn` box on an MUI Button: 40px tall, 24px sides, 8px icon gap. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

export function MilestoneForm({
  tripId,
  initial,
}: {
  tripId: string;
  initial?: MilestoneValues;
}) {
  const [state, formAction, pending] = useActionState<ScheduleState, FormData>(
    saveMilestoneAction,
    {},
  );

  const values = state.values ?? initial ?? emptyMilestone();
  const isEdit = values.milestoneId !== "";
  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  const amountError = err("amount");

  return (
    <Card component="form" action={formAction}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <input type="hidden" name="tripId" value={tripId} />
        {isEdit && <input type="hidden" name="milestoneId" value={values.milestoneId} />}

        <Typography component="h2" variant="h5" sx={{ m: 0, mb: 1.5 }}>
          {isEdit ? SCHEDULE_COPY.editHeading : SCHEDULE_COPY.addHeading}
        </Typography>

        {state.formError && (
          <Box sx={{ mb: 1.5 }}>
            <Alert tone="error">{state.formError}</Alert>
          </Box>
        )}

        <Stack spacing={1.5}>
          <SelectField
            id="milestone-kind"
            name="kind"
            label={SCHEDULE_COPY.kindLabel}
            defaultValue={values.kind}
            options={MILESTONE_KINDS}
          />

          <Field
            id="milestone-label"
            name="label"
            label={SCHEDULE_COPY.labelLabel}
            required
            maxLength={120}
            defaultValue={values.label}
            placeholder={SCHEDULE_COPY.labelPlaceholder}
            error={err("label")}
          />

          {/* Field's structure, by hand: the amount input is set in the mono face. The hint
              shows while there is no error, the error replaces it, and `aria-describedby`
              points at whichever one is on screen — the same contract the primitive keeps. */}
          <FormControl fullWidth error={Boolean(amountError)}>
            <FormLabel htmlFor="milestone-amount" sx={fieldLabelSx}>
              {SCHEDULE_COPY.amountLabel}
            </FormLabel>
            <OutlinedInput
              id="milestone-amount"
              name="amount"
              defaultValue={values.amount}
              placeholder="0.00"
              size="small"
              sx={{ ...fieldInputSx, fontFamily: "mono" }}
              inputProps={{
                inputMode: "decimal",
                "aria-invalid": amountError ? true : undefined,
                "aria-describedby": amountError ? "milestone-amount-error" : "milestone-amount-hint",
              }}
            />
            {!amountError && (
              <FormHelperText id="milestone-amount-hint">{SCHEDULE_COPY.amountHint}</FormHelperText>
            )}
            {amountError && (
              <FormHelperText id="milestone-amount-error" role="alert">
                {amountError}
              </FormHelperText>
            )}
          </FormControl>

          <DateField
            id="milestone-due"
            name="dueDate"
            label={SCHEDULE_COPY.dueLabel}
            defaultValue={values.dueDate}
            hint={SCHEDULE_COPY.dueHint}
          />
        </Stack>

        <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Button type="submit" variant="orange" disabled={pending}>
            {pending ? SCHEDULE_COPY.saving : SCHEDULE_COPY.save}
          </Button>
          {isEdit && (
            <MuiButton
              component={Link}
              href={`/agent/trips/${tripId}/payments`}
              variant="outlined"
              color="secondary"
              sx={BTN}
            >
              {SCHEDULE_COPY.cancel}
            </MuiButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
