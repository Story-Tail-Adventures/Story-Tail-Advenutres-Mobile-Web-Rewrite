import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { CancelTripDialog } from "@/components/agent/CancelTripDialog";
import { SaveAsTemplateDialog } from "@/components/agent/SaveAsTemplateDialog";
import { StageMenu } from "@/components/agent/StageMenu";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { AGENT_COPY } from "@/lib/agent/content";
import { PIPELINE_STAGES } from "@/lib/agent/queries";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.4.2's header: breadcrumb, title, status chip, and four actions.
 *
 * "BUILD" IS THE PRIMARY ACTION AND THE REST STILL WAIT. §3.4.4's own Screen-Inventory
 * entry names this header as one of its two entry points ("Trip Detail 'Edit components'"),
 * so the link lives here rather than buried in the Components tab — though that tab gets
 * one too, because that is where an advisor is standing when they decide to change
 * something. Duplicate (§3.4.13), Client preview (§3.5.6) and Send proposal (§3.5) render
 * disabled with a reason, matching `AgentNav.tsx`'s span-not-Link convention for an unbuilt
 * destination — never a silent no-op, never a link to a 404. The
 * status-change control reuses `StageMenu` verbatim rather than a bespoke "Mark booked"
 * button: it already offers every stage a trip can move to, which is a superset of what a
 * single fixed-target button would do, and it is the same write §3.2.2 already ships.
 */

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

function DisabledAction({ label, reason }: { label: string; reason: string }) {
  // The Button primitive keeps the tooltip alive on a disabled control (a titled wrapper),
  // which MUI's own `pointer-events: none` would otherwise swallow.
  return (
    <Button type="button" variant="outlined" size="sm" disabled title={reason}>
      {label}
      <Box component="span" sx={VISUALLY_HIDDEN}> — {reason}</Box>
    </Button>
  );
}

export function TripDetailHeader({ overview }: { overview: TripDetailOverview }) {
  // THE REAL DATES, not the `null`/`""` pair the other agent surfaces pass. Worklist and
  // Pipeline render a chip for a row that carries no milestone, so they opt out of the
  // payment override deliberately. This screen HAS the milestone, and the entry points that
  // link here already show the urgency — a hero that reads a flat "Booked" while the row you
  // clicked to reach it said the balance was due is the quieter of the two.
  const { chip, label } = tripStatusPresentation({
    status: overview.status as TripStatus,
    nextUnpaidDueDate: overview.nextUnpaidDueDate,
    today: overview.today,
  });

  return (
    <Card component="header" sx={{ mt: 2.5 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              <MuiLink component={NextLink} href="/agent" underline="hover" color="inherit">
                Worklist
              </MuiLink>{" "}
              · {overview.clientName}
            </Typography>
            <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
                {overview.title}
              </Typography>
              <StatusChip kind={chip} label={label} />
            </Box>
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
            <MuiButton
              component={NextLink}
              href={`/agent/trips/${overview.tripId}/builder`}
              variant="contained"
              color="brand"
              size="small"
              sx={BTN_SM}
            >
              {AGENT_COPY.openBuilder}
            </MuiButton>
            {/* §3.4.13 HONOURS THIS DEFERRAL RATHER THAN DELETING IT. "Duplicate" was
                disabled reading "Duplicating a trip arrives with §3.4.13, alongside the
                template library it shares the mechanism with" — repointed here during
                §3.4.4 for exactly this reason. Duplicating IS save the pattern, then New
                trip → start from a template: two real screens rather than a third verb
                needing its own client picker and date logic. */}
            <SaveAsTemplateDialog
              tripId={overview.tripId}
              tripTitle={overview.title}
              label={AGENT_COPY.saveAsTemplateLabel}
            />
            <DisabledAction label="Client preview" reason={AGENT_COPY.clientPreviewDeferred} />
            <DisabledAction label="Send proposal" reason={AGENT_COPY.sendProposalDeferred} />
            {/* §3.4.16. Last in the row and outlined rather than filled: it is the one action
                here with a consequence outside this screen, and it should not sit where the
                eye lands first. On a trip that is already cancelled it becomes "Save details",
                because the same dialog is how a refund that was pending becomes full. */}
            <CancelTripDialog overview={overview} />
          </Box>
        </Box>
        <Box sx={{ mt: 1.5, maxWidth: 320 }}>
          <StageMenu
            tripId={overview.tripId}
            status={overview.status}
            version={overview.version}
            stages={PIPELINE_STAGES}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
