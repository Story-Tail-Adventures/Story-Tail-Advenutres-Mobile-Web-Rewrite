import Link from "next/link";

import { TripBuilderCanvas } from "@/components/agent/TripBuilderCanvas";
import { TripBuilderRail } from "@/components/agent/TripBuilderRail";
import { TripComponentSheet } from "@/components/agent/TripComponentSheet";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
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
    <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
      {/* §3.4.13's seeding receipt.
          A FAILED APPLY USED TO BE INVISIBLE HERE. `createTripAction` deliberately does not
          fail the create when the pattern does not apply — the trip is real and losing it
          to recover from a seeding problem is the worse trade — so the builder was showing
          "0 pieces / Nothing in it yet", which is character for character what "Start from
          scratch" produces. Two different things reading identically, one of them a
          failure. The outcome rides in `?seeded=` so this can tell them apart. */}
      {seeded !== undefined && (
        <p
          className={`t-body-s mt-5 rounded-xl px-3 py-2 ${
            seeded === "failed"
              ? "bg-[var(--md-error-container)] text-[var(--md-on-error-container)]"
              : "bg-[var(--md-surface-2)] text-[var(--md-on-surface-variant)]"
          }`}
          role="status"
        >
          {seeded === "failed"
            ? BUILDER_COPY.seedFailed
            : BUILDER_COPY.seedApplied(Number(seeded) || 0)}
        </p>
      )}

      <header className="card mt-5 p-4">
        <p className="t-body-s text-[var(--md-on-surface-variant)]">
          <Link href={`/agent/trips/${tripId}`} className="hover:underline">
            {BUILDER_COPY.backToTrip}
          </Link>{" "}
          · {overview.clientName}
        </p>
        <h1 className="t-headline mt-1 text-[22px] leading-tight">{overview.title}</h1>

        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="t-label text-[var(--md-on-surface-variant)]">
              {BUILDER_COPY.totalLabel}
            </dt>
            <dd className="t-title-s m-0 font-mono">{overview.totalValueLabel}</dd>
          </div>
          <div>
            <dt className="t-label text-[var(--md-on-surface-variant)]">
              {BUILDER_COPY.commissionLabel}
            </dt>
            <dd className="t-title-s m-0 font-mono">{overview.totalCommissionLabel}</dd>
          </div>
          <div>
            <dt className="t-label text-[var(--md-on-surface-variant)]">
              {BUILDER_COPY.componentsHeading}
            </dt>
            <dd className="t-title-s m-0">
              {components.length}{" "}
              {components.length === 1 ? BUILDER_COPY.countLabelOne : BUILDER_COPY.countLabel}
            </dd>
          </div>
        </dl>
        <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">
          <Icon name="info" size={12} /> {BUILDER_COPY.totalHint}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] xl:grid-cols-[240px_1fr_360px]">
        <div className="lg:col-span-2 xl:col-span-1">
          <TripBuilderRail tripId={tripId} tripTitle={overview.title} />
        </div>

        <section>
          <h2 className="t-title-s mb-2">{BUILDER_COPY.componentsHeading}</h2>
          <TripBuilderCanvas
            tripId={tripId}
            components={components}
            editingId={editingRow?.componentId ?? null}
          />
        </section>

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
      </div>
    </div>
  );
}
