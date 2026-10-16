"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { TRIP_DETAIL } from "@/app/(client)/trips/[tripId]/content";
import { Icon } from "@/components/ui/Icon";
import { sendPaidNote, type PaidNoteState } from "@/lib/trips/actions";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { payButtonLabel, paySiteName } from "@/lib/trips/payLink";

/**
 * The pay block on a milestone that has a pay link (Screen-Inventory §2.2.3, ruled
 * 2026-10-16; the artboard's C22_PayLink in client-trip.jsx). P1.
 *
 * A calm button that opens the SUPPLIER's own site in a new tab, the site name read from the
 * link itself (lower case, no `www.`, punycode, so a look-alike host cannot pass), and who
 * gets the money. No countdowns and no red (Design-System §2).
 *
 * "I've paid" only posts a message in the trip thread for Gyasi to check, through the same
 * `trip-message` path as any message. It never changes the milestone.
 *
 * Renders nothing when the link is not a usable https link, so a bad value never shows as a
 * trustworthy-looking button. The caller decides the milestone is open (scheduled or overdue).
 */
export function PayLinkBlock({
  tripId,
  milestoneId,
  label,
  payUrl,
}: {
  tripId: string;
  milestoneId: string;
  label: string;
  payUrl: string;
}) {
  const [state, formAction, pending] = useActionState<PaidNoteState>(
    sendPaidNote.bind(null, tripId, milestoneId),
    { status: "idle" },
  );

  const site = paySiteName(payUrl);
  if (!site) return null;

  return (
    <Box>
      <MuiButton
        component="a"
        href={payUrl}
        target="_blank"
        rel="noopener noreferrer"
        variant="contained"
        size="small"
        fullWidth
        endIcon={<Icon name="external" size={12} />}
        sx={{ textTransform: "none", fontWeight: 600 }}
      >
        {payButtonLabel(label)}
        <Box component="span" sx={VISUALLY_HIDDEN}>
          {` ${TRIP_DETAIL.payOpensNewTab}`}
        </Box>
      </MuiButton>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.75, color: "text.secondary" }}>
        <Icon name="lock" size={12} />
        <Typography component="span" variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
          {site}
        </Typography>
      </Box>
      <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
        {TRIP_DETAIL.payDirect}
      </Typography>

      {state.status === "sent" ? (
        <Typography component="p" variant="caption" role="status" sx={{ display: "block", mt: 0.75, fontWeight: 500 }}>
          {TRIP_DETAIL.iPaidThanks}
        </Typography>
      ) : (
        <Box component="form" action={formAction} sx={{ mt: 0.5 }}>
          <MuiButton
            type="submit"
            variant="text"
            size="small"
            disabled={pending}
            sx={{ px: 0.5, minWidth: 0, textTransform: "none" }}
          >
            {TRIP_DETAIL.iPaid}
            {/* Several blocks can share a page; name the payment for a screen reader. */}
            <Box component="span" sx={VISUALLY_HIDDEN}>{` (${label})`}</Box>
          </MuiButton>
          {state.status === "error" && (
            <Typography component="p" variant="caption" role="alert" sx={{ display: "block", color: "error.main" }}>
              {state.message ?? TRIP_DETAIL.iPaidFailed}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
