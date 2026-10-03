import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { AGENT_COPY } from "@/lib/agent/content";
import { refundStatusLabel } from "@/lib/agent/cancelTrip";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";
import { tripTypeLabel } from "@/lib/trips/tripType";

/** `.t-label` on MUI's caption: the field's name above its value. */
const LABEL_SX = {
  display: "block",
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: "0.4px",
  color: "text.secondary",
} as const;

/** The legacy `.card.p-3.5` (14px) on CardContent, with MUI's last-child rule cancelled. */
const CARD_PAD_SX = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;

/** Two columns on a phone, four from `sm` up — the legacy `grid-cols-2 sm:grid-cols-4`. */
const GRID_SX = {
  display: "grid",
  gap: 1.5,
  gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Typography component="div" variant="caption" sx={LABEL_SX}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ mt: 0.25 }}>
        {value}
      </Typography>
    </div>
  );
}

/**
 * The prototype's 4-column "at a glance" grid. No "Booking source" field — the prototype
 * draws one and no such column exists on `trip` anywhere in the schema; see
 * `agent_trip_overview`'s doc comment.
 *
 * ON MUI (step 2 of the migration): the same card and grid on MUI Card / CardContent and a
 * Box grid with plain sx, so this stays a Server Component.
 */
export function AtAGlanceGrid({ overview }: { overview: TripDetailOverview }) {
  const dates =
    overview.startLabel && overview.endLabel
      ? `${overview.startLabel} – ${overview.endLabel}`
      : (overview.startLabel ?? overview.endLabel ?? AGENT_COPY.glanceNotSet);

  return (
    <Card>
      <CardContent sx={CARD_PAD_SX}>
        <Box sx={GRID_SX}>
          <Field label={AGENT_COPY.glanceTripType} value={tripTypeLabel(overview.tripType)} />
          <Field
            label={AGENT_COPY.glanceDestination}
            value={
              overview.destinations.length > 0
                ? overview.destinations.join(", ")
                : AGENT_COPY.glanceNotSet
            }
          />
          <Field
            label={AGENT_COPY.glanceTravelers}
            value={`${overview.travelerCount} ${overview.travelerCount === 1 ? "traveler" : "travelers"}`}
          />
          <Field label={AGENT_COPY.glanceDates} value={dates} />
          <Field
            label={AGENT_COPY.glanceCardOnFile}
            value={overview.cardOnFile ?? AGENT_COPY.glanceNoCard}
          />
          <Field
            label={AGENT_COPY.glanceLastActivity}
            value={overview.lastActivityLabel ?? AGENT_COPY.glanceNoActivity}
          />
          {overview.cancellationReason && (
            <Field label={AGENT_COPY.glanceCancellationReason} value={overview.cancellationReason} />
          )}
          {/* The LABEL, not the stored value. `refund_status` became a four-value vocabulary
              in 20261001100000 and it renders "pending" raw without this. `refundStatusLabel`
              returns null for anything outside the vocabulary rather than echoing it, so a
              row still carrying pre-vocabulary free text falls through to the detail line
              below instead of putting a sentence where a status belongs. */}
          {refundStatusLabel(overview.refundStatus) && (
            <Field
              label={AGENT_COPY.glanceRefundStatus}
              value={refundStatusLabel(overview.refundStatus) as string}
            />
          )}
          {/* The specifics behind the state: an amount, a date, a credit with an expiry.
              Separate from the status because "partial" cannot carry any of those, and this
              sentence is what the traveler reads on §2.2.10. */}
          {overview.refundDetail && (
            <Field label={AGENT_COPY.glanceRefundDetail} value={overview.refundDetail} />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
