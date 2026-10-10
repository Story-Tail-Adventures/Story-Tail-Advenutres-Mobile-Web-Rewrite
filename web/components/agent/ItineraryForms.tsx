"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  generateItineraryAction,
  saveActivityAction,
  saveDayAction,
  type GenerateState,
} from "@/app/(agent)/agent/trips/[tripId]/itinerary/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { ITINERARY_COPY } from "@/lib/agent/content";
import {
  BLOCKS,
  type ActivityValues,
  type DayValues,
  type ItineraryState,
} from "@/lib/agent/itinerary";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.4.14's three client islands: the generate button, the day form, the entry form.
 *
 * ONE FILE, THREE COMPONENTS, because all three are small `useActionState` wrappers and
 * splitting them would be three files of imports around one hook each. The page decides
 * which of the two forms is open from the URL.
 *
 * ON MUI (step 2 of the migration): the forms are Cards, every control is one of the
 * shared primitives (Field / DateField / SelectField / TextareaField, label above the
 * input), errors are the Alert primitive, and every `name` and `id` is the one the server
 * actions read.
 */

/** The legacy .btn box (40px, 24px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_MD = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** Two equal columns, as the time and phone / confirmation pairs were laid out. */
const GRID_2 = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 } as const;

/** JetBrains Mono on the input inside a Field — the confirmation number. */
const MONO_INPUT = { "& .MuiInputBase-input": { fontFamily: "mono" } } as const;

/** The neutral note (surface-2 with an info glyph), as the artboard draws it. */
const NOTE_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 1.5,
  py: 1,
  bgcolor: "surface.2",
  color: "text.secondary",
} as const;

/**
 * The Key actions line's "Auto-generate".
 *
 * IT SAYS WHAT IT WILL DO BEFORE IT IS PRESSED. An advisor who has spent an hour writing
 * needs to know the button will not touch it beforehand, not after — so the hint is next to
 * the control rather than in a confirmation dialog it would learn to dismiss.
 *
 * AND IT REPORTS WHICH OF THREE THINGS HAPPENED. "Added what was missing", "already up to
 * date", and "the trip has no dates" are different facts, and a page that looked the same
 * in all three would make the advisor press it again to find out.
 */
export function GenerateItineraryButton({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generateItineraryAction,
    {},
  );

  return (
    <div>
      <Box
        component="form"
        action={formAction}
        sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}
      >
        <input type="hidden" name="tripId" value={tripId} />
        <Button type="submit" variant="orange" size="sm" disabled={pending}>
          {pending ? ITINERARY_COPY.generateWorking : ITINERARY_COPY.generateLabel}
        </Button>
        <Button variant="outlined" size="sm" disabled title={ITINERARY_COPY.previewDeferred}>
          {ITINERARY_COPY.previewLabel}
          <Box component="span" sx={VISUALLY_HIDDEN}> — {ITINERARY_COPY.previewDeferred}</Box>
        </Button>
      </Box>

      <Typography
        component="p"
        variant="caption"
        sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.75, color: "text.secondary" }}
      >
        <Icon name="info" size={12} />
        {ITINERARY_COPY.generateHint}
      </Typography>

      {state.message &&
        // `role="status"` rather than `alert`: two of the three outcomes are ordinary
        // information and an assertive announcement for "already up to date" would be
        // the screen shouting about nothing.
        (state.kind === "error" ? (
          <Box sx={{ mt: 0.75 }}>
            <Alert tone="error" role="status">
              {state.message}
            </Alert>
          </Box>
        ) : (
          <Paper elevation={0} role="status" sx={{ ...NOTE_SX, mt: 0.75 }}>
            <Typography variant="caption">{state.message}</Typography>
          </Paper>
        ))}
    </div>
  );
}

export function DayForm({ tripId, initial }: { tripId: string; initial: DayValues }) {
  const [state, formAction, pending] = useActionState<ItineraryState, FormData>(
    saveDayAction,
    {},
  );
  const values = state.dayValues ?? initial;
  const isEdit = values.dayId !== "";

  return (
    <Card component="form" action={formAction} sx={{ p: 2 }}>
      <input type="hidden" name="tripId" value={tripId} />
      {isEdit && <input type="hidden" name="dayId" value={values.dayId} />}

      <Typography component="h2" variant="h5" sx={{ m: 0, mb: 1.5 }}>
        {isEdit ? ITINERARY_COPY.editDay : ITINERARY_COPY.addDay}
      </Typography>

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}

      <Stack spacing={1.5}>
        <DateField
          id="day-date"
          name="date"
          label={ITINERARY_COPY.dayDateLabel}
          defaultValue={values.date}
          error={state.fieldErrors?.date?.[0]}
        />

        <Field
          id="day-label"
          name="label"
          label={ITINERARY_COPY.dayLabelLabel}
          maxLength={120}
          defaultValue={values.label}
          placeholder={ITINERARY_COPY.dayLabelPlaceholder}
          hint={ITINERARY_COPY.dayLabelHint}
        />

        <TextareaField
          id="day-summary"
          name="summary"
          label={ITINERARY_COPY.daySummaryLabel}
          rows={3}
          maxLength={4000}
          defaultValue={values.summary}
          hint={ITINERARY_COPY.daySummaryHint}
        />
      </Stack>

      <Buttons tripId={tripId} pending={pending} />
    </Card>
  );
}

export function ActivityForm({
  tripId,
  initial,
  days,
  fromBooking,
}: {
  tripId: string;
  initial: ActivityValues;
  days: { dayId: string; dayNumber: number; dateLabel: string | null }[];
  fromBooking: boolean;
}) {
  const [state, formAction, pending] = useActionState<ItineraryState, FormData>(
    saveActivityAction,
    {},
  );
  const values = state.activityValues ?? initial;
  const isEdit = values.activityId !== "";
  const err = (n: string) => state.fieldErrors?.[n]?.[0];

  return (
    <Card component="form" action={formAction} sx={{ p: 2 }}>
      <input type="hidden" name="tripId" value={tripId} />
      {isEdit && <input type="hidden" name="activityId" value={values.activityId} />}

      <Typography component="h2" variant="h5" sx={{ m: 0, mb: 1.5 }}>
        {isEdit ? ITINERARY_COPY.editActivity : ITINERARY_COPY.addActivity}
      </Typography>

      {/* An entry generated from a booking says so, because editing the prose here does
          NOT change the booking — and an advisor who assumed it did would go looking for
          the flight number they just corrected. */}
      {fromBooking && (
        <Paper elevation={0} sx={{ ...NOTE_SX, mb: 1.5 }}>
          <Icon name="info" size={12} />
          <Typography variant="caption">{ITINERARY_COPY.fromBookingHint}</Typography>
        </Paper>
      )}

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}

      <Stack spacing={1.5}>
        <SelectField
          id="act-day"
          name="dayId"
          label="Day"
          defaultValue={values.dayId}
          options={days.map((d) => ({
            value: d.dayId,
            label: `Day ${d.dayNumber}${d.dateLabel ? ` · ${d.dateLabel}` : ""}`,
          }))}
        />

        <Field
          id="act-title"
          name="title"
          label={ITINERARY_COPY.activityTitleLabel}
          required
          maxLength={200}
          defaultValue={values.title}
          placeholder={ITINERARY_COPY.activityTitlePlaceholder}
          error={err("title")}
        />

        <Box sx={GRID_2}>
          <Field
            id="act-start"
            name="startTime"
            type="time"
            label={ITINERARY_COPY.startsLabel}
            defaultValue={values.startTime}
          />
          <Field
            id="act-end"
            name="endTime"
            type="time"
            label={ITINERARY_COPY.endsLabel}
            defaultValue={values.endTime}
          />
        </Box>

        <SelectField
          id="act-block"
          name="block"
          label={ITINERARY_COPY.blockLabel}
          defaultValue={values.block}
          options={BLOCKS}
        />

        <TextareaField
          id="act-body"
          name="body"
          label={ITINERARY_COPY.activityBodyLabel}
          rows={4}
          maxLength={4000}
          defaultValue={values.body}
          hint={ITINERARY_COPY.activityBodyHint}
        />

        <TextareaField
          id="act-tip"
          name="gyasisTip"
          label={ITINERARY_COPY.tipLabel}
          rows={3}
          maxLength={2000}
          defaultValue={values.gyasisTip}
          hint={ITINERARY_COPY.tipHint}
        />

        <Field
          id="act-where"
          name="location"
          label={ITINERARY_COPY.whereLabel}
          maxLength={200}
          defaultValue={values.location}
        />

        <Field
          id="act-address"
          name="address"
          label={ITINERARY_COPY.addressLabel}
          maxLength={200}
          defaultValue={values.address}
        />

        <Box sx={GRID_2}>
          <Field
            id="act-phone"
            name="phone"
            label={ITINERARY_COPY.phoneLabel}
            maxLength={40}
            defaultValue={values.phone}
          />
          <Box sx={MONO_INPUT}>
            <Field
              id="act-conf"
              name="confirmationNumber"
              label={ITINERARY_COPY.confirmationLabel}
              maxLength={80}
              defaultValue={values.confirmationNumber}
            />
          </Box>
        </Box>
      </Stack>

      <Buttons tripId={tripId} pending={pending} />
    </Card>
  );
}

function Buttons({ tripId, pending }: { tripId: string; pending: boolean }) {
  return (
    <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
      <Button type="submit" variant="orange" disabled={pending}>
        {pending ? ITINERARY_COPY.saving : ITINERARY_COPY.save}
      </Button>
      <MuiButton
        component={NextLink}
        href={`/agent/trips/${tripId}/itinerary`}
        variant="outlined"
        color="secondary"
        sx={BTN_MD}
      >
        {ITINERARY_COPY.cancel}
      </MuiButton>
    </Box>
  );
}
