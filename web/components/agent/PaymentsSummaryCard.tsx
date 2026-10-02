import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AGENT_COPY } from "@/lib/agent/content";
import type { TripPaymentRow } from "@/lib/agent/tripDetail";

/**
 * The prototype's "Payments" sidebar card — a status dot per milestone (green = paid, red =
 * everything else, since `payment_milestone.status` has no separate risk model beyond paid).
 *
 * Reused by the Payments tab with `full`, which renders every row rather than the sidebar's
 * top three — one read (`agent_trip_payments`), two renderings, rather than a second
 * accessor for a summary the tab already lists in full.
 *
 * The dot's colour is a palette path (`success.main` / `error.main`) rather than the inline
 * style it used to be, so it follows the scheme like everything else in the card.
 */
export function PaymentsSummaryCard({
  payments,
  full = false,
}: {
  payments: TripPaymentRow[];
  full?: boolean;
}) {
  const rows = full ? payments : payments.filter((p) => p.status !== "paid").slice(0, 3);

  // TWO EMPTY STATES, NOT ONE. The sidebar hides paid milestones, so `rows` empties both
  // when a trip has no schedule at all and when every milestone on it has been paid — and
  // those are opposite facts. Collapsing them told an advisor "No payments scheduled." on a
  // trip that had been paid for in full, which is the one reading of that card nobody could
  // act on. `payments` is the unfiltered set, so it is what decides which sentence applies.
  const emptyCopy =
    payments.length === 0 ? AGENT_COPY.tripPaymentsEmpty : AGENT_COPY.tripPaymentsAllSettled;

  return (
    <Card>
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Payments
        </Typography>
        {rows.length === 0 ? (
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {emptyCopy}
          </Typography>
        ) : (
          rows.map((p) => (
            <Stack key={p.milestoneId} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.75 }}>
              <Box
                aria-hidden="true"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: p.dot === "good" ? "success.main" : "error.main",
                }}
              />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {p.label} · {p.status === "paid" ? "Paid" : p.dueLabel ?? "No date"}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: "mono", fontWeight: 700, fontSize: 12 }}>
                {p.amountLabel}
              </Typography>
            </Stack>
          ))
        )}
      </CardContent>
    </Card>
  );
}
