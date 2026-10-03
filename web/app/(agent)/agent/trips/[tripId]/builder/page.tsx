import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { TripBuilderCanvas } from "@/components/agent/TripBuilderCanvas";
import { TripBuilderRail } from "@/components/agent/TripBuilderRail";
import { TripComponentSheet } from "@/components/agent/TripComponentSheet";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import {
  centsToDollars,
  componentKindFromParam,
  emptyComponent,
  isComponentKind,
  type ComponentKind,
  type ComponentValues,
} from "@/lib/agent/components";
import { BUILDER_COPY } from "@/lib/agent/content";
import { loadSuppliers } from "@/lib/agent/tripBuilder";
import {
  loadTripComponents,
  loadTripOverview,
  type TripComponentRow,
} from "@/lib/agent/tripDetail";

/**
 * Screen 3.4.4 — Trip Builder Workspace, with §3.4.5 – §3.4.12 inside it.
 *
 * ONE ROUTE, THE SHEET IN THE URL. `?add=<kind>` opens a blank sheet, `?edit=<id>` opens a
 * filled one, neither opens nothing — the same shape `?tab=` has on §3.4.2, and for the
 * same reasons: the back button closes the sheet, a link can point straight at it, and the
 * whole page renders on the server.
 *
 * THREE COLUMNS AT `xl`, TWO AT `lg`, ONE BELOW. The prototype draws 260px / 1fr / 320px
 * and never folds. Pattern C puts the side rails behind a breakpoint; on a laptop the
 * canvas would otherwise be about 500px wide with a form beside it. Below `xl` the add
 * rail becomes a strip across the top rather than a column, so the canvas keeps the width.
 *
 * NO `<AgentViews />`, for the reason §3.4.2's page records: that strip belongs to the
 * Worklist destination, and rendering it here puts a second tab row above the trip with no
 * active state, every link leading away from the trip just opened.
 */

export const metadata = { title: "Trip builder" };

/** The legacy `.t-label` (12px/500) on MUI's caption, for the header's dt row. */
const DT_SX = { fontWeight: 500, color: "text.secondary" } as const;

/** The row being edited, as the form wants it. */
function editValues(row: TripComponentRow): ComponentValues {
  const e = row.edit;
  const detail: Record<string, string> = {};
  for (const [key, value] of Object.entries(e.detail)) {
    // `payload` is jsonb with no schema in Postgres (Data-Model §23), so what comes back is
    // whatever was last written. A boolean becomes the "on" a checkbox posts; anything else
    // is shown as text rather than as "[object Object]".
    if (value === true) detail[key] = "on";
    else if (value === false || value === null || value === undefined) continue;
    else detail[key] = String(value);
  }

  return {
    componentId: row.componentId,
    // The DB's `component_kind` is the seven this form knows, but the cast is not free —
    // an enum value added in a migration and not here would render a sheet with no fields.
    // `custom` shows the shared columns and a notes box, which is the honest fallback.
    kind: isComponentKind(e.kind) ? e.kind : "custom",
    displayName: e.displayName,
    supplierId: e.supplierId ?? "",
    location: e.location ?? "",
    startDate: e.startDate ?? "",
    endDate: e.endDate ?? "",
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
    confirmationNumber: e.confirmationNumber ?? "",
    cost: centsToDollars(e.costCents),
    commissionPct: e.commissionPct === null ? "" : String(e.commissionPct),
    // A ZERO COMMISSION WITH NO RATE BEHIND IT COMES BACK BLANK, and this is not cosmetic.
    // `commission_cents` is NOT NULL DEFAULT 0, so a component nobody entered a commission
    // for stores 0 — and 0 rendered as "0.00" is an amount the advisor typed as far as
    // `resolveCommissionCents` is concerned. It would win over the rate, on every edit,
    // forever: the "leave it blank and the rate fills it in" rule the sheet states out loud
    // could never once fire on a component that already exists.
    //
    // Only when there is no rate to work one out from, so a deliberate zero set ALONGSIDE a
    // rate — an advisor recording that this one booking pays nothing — survives the round
    // trip as the zero they meant.
    commission:
      e.commissionCents === "0" && !e.commissionPct ? "" : centsToDollars(e.commissionCents),
    detail,
  };
}

export default async function TripBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ add?: string; edit?: string; seeded?: string }>;
}) {
  const { tripId } = await params;
  const { add, edit, seeded } = await searchParams;

  const [result, components, suppliers] = await Promise.all([
    loadTripOverview(tripId),
    loadTripComponents(tripId),
    loadSuppliers(),
  ]);

  // A TRIP THAT IS NOT THERE IS NOT AN ERROR — `agent_trip_overview` answers zero rows for
  // "no such trip" and "not yours" alike, deliberately. Same three-armed handling §3.4.2's
  // page carries, and for the same reason: `ErrorState` sends the advisor to /dashboard,
  // which is the traveler's route.
  if (!result.ok && result.reason === "not-found") return <TripNotFound />;
  if (!result.ok || !components || !suppliers) return <ErrorState />;

  const overview = result.overview;

  const editingRow = edit ? components.find((c) => c.componentId === edit) : undefined;
  // An `?edit=` naming a component that is not on this trip falls through to no sheet
  // rather than to a blank one. It means a stale link or a piece somebody removed, and
  // opening an empty "add" over it would invite the advisor to type it back in.
  const addKind: ComponentKind | null = editingRow ? null : componentKindFromParam(add);
  const sheetKind = editingRow ? editValues(editingRow).kind : addKind;

  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 }}>
      {/* §3.4.13's seeding receipt.
          A FAILED APPLY USED TO BE INVISIBLE HERE. `createTripAction` deliberately does not
          fail the create when the pattern does not apply — the trip is real and losing it
          to recover from a seeding problem is the worse trade — so the builder was showing
          "0 pieces / Nothing in it yet", which is character for character what "Start from
          scratch" produces. Two different things reading identically, one of them a
          failure. The outcome rides in `?seeded=` so this can tell them apart. */}
      {seeded !== undefined &&
        (seeded === "failed" ? (
          <Box sx={{ mt: 2.5 }}>
            <Alert tone="error" role="status">
              {BUILDER_COPY.seedFailed}
            </Alert>
          </Box>
        ) : (
          <Paper elevation={0} role="status" sx={{ mt: 2.5, px: 1.5, py: 1, bgcolor: "surface.2" }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {BUILDER_COPY.seedApplied(Number(seeded) || 0)}
            </Typography>
          </Paper>
        ))}

      <Card component="header" sx={{ mt: 2.5 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            <MuiLink
              component={NextLink}
              href={`/agent/trips/${tripId}`}
              underline="hover"
              color="inherit"
            >
              {BUILDER_COPY.backToTrip}
            </MuiLink>{" "}
            · {overview.clientName}
          </Typography>
          <Typography component="h1" variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
            {overview.title}
          </Typography>

          <Box
            component="dl"
            sx={{ m: 0, mt: 1.5, display: "flex", flexWrap: "wrap", columnGap: 4, rowGap: 1 }}
          >
            <div>
              <Typography component="dt" variant="caption" sx={DT_SX}>
                {BUILDER_COPY.totalLabel}
              </Typography>
              <Typography
                component="dd"
                variant="subtitle1"
                sx={{ m: 0, fontWeight: 600, fontFamily: "mono" }}
              >
                {overview.totalValueLabel}
              </Typography>
            </div>
            <div>
              <Typography component="dt" variant="caption" sx={DT_SX}>
                {BUILDER_COPY.commissionLabel}
              </Typography>
              <Typography
                component="dd"
                variant="subtitle1"
                sx={{ m: 0, fontWeight: 600, fontFamily: "mono" }}
              >
                {overview.totalCommissionLabel}
              </Typography>
            </div>
            <div>
              <Typography component="dt" variant="caption" sx={DT_SX}>
                {BUILDER_COPY.componentsHeading}
              </Typography>
              <Typography component="dd" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
                {components.length}{" "}
                {components.length === 1 ? BUILDER_COPY.countLabelOne : BUILDER_COPY.countLabel}
              </Typography>
            </div>
          </Box>
          <Typography
            component="p"
            variant="caption"
            sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 1, color: "text.secondary" }}
          >
            <Icon name="info" size={12} />
            {BUILDER_COPY.totalHint}
          </Typography>
        </CardContent>
      </Card>

      <Box
        sx={{
          mt: 2,
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 360px", xl: "240px minmax(0, 1fr) 360px" },
        }}
      >
        <Box sx={{ gridColumn: { lg: "span 2", xl: "auto" } }}>
          <TripBuilderRail tripId={tripId} tripTitle={overview.title} />
        </Box>

        <Box component="section">
          <Typography component="h2" variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            {BUILDER_COPY.componentsHeading}
          </Typography>
          <TripBuilderCanvas
            tripId={tripId}
            components={components}
            editingId={editingRow?.componentId ?? null}
          />
        </Box>

        {/* The third column exists only when a sheet is open. An empty 360px rail beside a
            canvas is a panel the advisor has to learn to ignore. */}
        {sheetKind && (
          <TripComponentSheet
            tripId={tripId}
            kind={sheetKind}
            suppliers={suppliers}
            initial={editingRow ? editValues(editingRow) : emptyComponent(sheetKind)}
          />
        )}
      </Box>
    </Box>
  );
}
