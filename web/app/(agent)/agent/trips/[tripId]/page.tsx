import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";

import NextLink from "@/components/mui/NextLink";
import { AtAGlanceGrid } from "@/components/agent/AtAGlanceGrid";
import { CostCommissionCard } from "@/components/agent/CostCommissionCard";
import { PaymentsSummaryCard } from "@/components/agent/PaymentsSummaryCard";
import { TripActivityTimeline } from "@/components/agent/TripActivityTimeline";
import { TripComponentsList } from "@/components/agent/TripComponentsList";
import { TripDetailHeader } from "@/components/agent/TripDetailHeader";
import { TripDetailTabs } from "@/components/agent/TripDetailTabs";
import { TripDocumentsList } from "@/components/agent/TripDocumentsList";
import { TripItineraryView } from "@/components/agent/TripItineraryView";
import { TripMessagesThread } from "@/components/agent/TripMessagesThread";
import { TripNotesEditor } from "@/components/agent/TripNotesEditor";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
import {
  loadTripActivity,
  loadTripComponents,
  loadTripDocuments,
  loadTripItinerary,
  loadTripMessages,
  loadTripOverview,
  loadTripPayments,
} from "@/lib/agent/tripDetail";
import { AGENT_COPY } from "@/lib/agent/content";
import { validTripTab } from "@/lib/agent/tripTabs";

/**
 * Screen 3.4.2 — Trip Detail (Agent View).
 *
 * ONE ROUTE, EIGHT TABS VIA `?tab=`, not eight nested routes — see `tripTabs.ts` and
 * `TripDetailTabs.tsx`. The header and the two sidebar cards render on every tab from
 * `agent_trip_overview` and `agent_trip_payments` alone, matching the prototype's `TripShell`,
 * which renders its sidebar unconditionally regardless of which body content is inside.
 *
 * COMPONENTS AND ITINERARY ARE SEPARATE TABS, EVEN THOUGH THE PROTOTYPE MERGES THEM. See
 * `agent_trip_components`'s doc comment — Screen-Inventory's text lists them as two tabs and
 * the doc hierarchy puts the text above the drawing.
 *
 * A server component throughout except two client islands: `TripDetailTabs` (pathname/search
 * params) and `TripNotesEditor` (the one write here beyond the stage-change menu already in
 * `TripDetailHeader`).
 */

export const metadata = { title: "Trip" };

/** The page column: `mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1336,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** The right-aligned "Edit …" link above a read-only tab body (`mb-2 flex justify-end`). */
const TAB_ACTION_SX = { mb: 1, display: "flex", justifyContent: "flex-end" } as const;

export default async function AgentTripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tripId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = validTripTab(tabParam);

  // Overview and payments back the header and the persistent sidebar on every tab; the rest
  // are fetched only for the tab actually being rendered — the same "fetch what this render
  // needs" discipline `loadWorklist`/`loadPipeline`/`loadCalendar` already follow.
  const [result, payments] = await Promise.all([loadTripOverview(tripId), loadTripPayments(tripId)]);

  // A TRIP THAT IS NOT THERE IS NOT AN ERROR. `agent_trip_overview` answers zero rows for
  // "no such trip" and "not yours" alike; both mean this URL has no page, and neither is a
  // fault on our side that retrying fixes. `ErrorState` claimed both and sent the advisor to
  // /dashboard — the traveler route — to recover. `TripNotFound` carries the reasoning for
  // why this is a plain render rather than `notFound()`.
  if (!result.ok && result.reason === "not-found") return <TripNotFound />;
  if (!result.ok || !payments) return <ErrorState />;

  const overview = result.overview;

  // NO `<AgentViews />` HERE, and the other three agent pages all have one. That strip is
  // §3.2's three views under the "Worklist" rail destination; Trip Detail is a different
  // destination ("Trips"). Rendering it put a second tab strip above the trip's own tabs,
  // styled identically from the same `.agent-views` class, with no active state — and every
  // one of its links navigated the agent away from the trip they had just opened.
  return (
    <Box sx={PAGE_SX}>
      <TripDetailHeader overview={overview} />
      <TripDetailTabs />

      <Box
        sx={{
          mt: 2,
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {tab === "overview" && <AtAGlanceGrid overview={overview} />}
          {tab === "components" && <TripComponentsTab tripId={tripId} />}
          {tab === "itinerary" && <TripItineraryTab tripId={tripId} />}
          {tab === "payments" && (
            <>
              {/* §3.4.15's entry point, the one the Screen Inventory calls "Trip Detail
                  'Payments'". The tab stays a READ — it is one of eight on a screen about
                  the whole trip — and the schedule is worked on at its own route, which is
                  the same split §3.4.4 made for components. */}
              <Box sx={TAB_ACTION_SX}>
                <MuiButton
                  component={NextLink}
                  href={`/agent/trips/${tripId}/payments`}
                  variant="outlined"
                  color="secondary"
                  size="small"
                  sx={BTN_SM}
                >
                  {AGENT_COPY.editSchedule}
                </MuiButton>
              </Box>
              <PaymentsSummaryCard payments={payments} full />
            </>
          )}
          {tab === "documents" && <TripDocumentsTab tripId={tripId} />}
          {tab === "messages" && <TripMessagesTab tripId={tripId} />}
          {tab === "notes" && (
            <TripNotesEditor
              tripId={tripId}
              initialNotes={overview.notes}
              initialVersion={overview.version}
            />
          )}
          {tab === "activity" && <TripActivityTab tripId={tripId} />}
        </Box>

        <Box component="aside" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <CostCommissionCard overview={overview} />
          <PaymentsSummaryCard payments={payments} />
        </Box>
      </Box>
    </Box>
  );
}

async function TripComponentsTab({ tripId }: { tripId: string }) {
  const components = await loadTripComponents(tripId);
  if (!components) return <ErrorState />;
  return (
    <>
      {/* §3.4.4's second entry point, the one the Screen Inventory calls "Trip Detail
          'Edit components'". The header carries the same link; this one is here because
          this tab is where an advisor is standing when they decide something is wrong. */}
      <Box sx={TAB_ACTION_SX}>
        <MuiButton
          component={NextLink}
          href={`/agent/trips/${tripId}/builder`}
          variant="outlined"
          color="secondary"
          size="small"
          sx={BTN_SM}
        >
          {AGENT_COPY.editComponents}
        </MuiButton>
      </Box>
      <TripComponentsList components={components} />
    </>
  );
}

async function TripItineraryTab({ tripId }: { tripId: string }) {
  const itinerary = await loadTripItinerary(tripId);
  if (!itinerary) return <ErrorState />;
  return (
    <>
      {/* §3.4.14's entry point, one of the two its Screen-Inventory entry names ("Trip
          Detail 'Itinerary'"; the other is the builder). This tab stays a READ — one of
          eight on a screen about the whole trip — and the writing happens at its own
          route, the same split §3.4.4 and §3.4.15 made. */}
      <Box sx={TAB_ACTION_SX}>
        <MuiButton
          component={NextLink}
          href={`/agent/trips/${tripId}/itinerary`}
          variant="outlined"
          color="secondary"
          size="small"
          sx={BTN_SM}
        >
          {AGENT_COPY.editItinerary}
        </MuiButton>
      </Box>
      <TripItineraryView itinerary={itinerary} />
    </>
  );
}

async function TripDocumentsTab({ tripId }: { tripId: string }) {
  const documents = await loadTripDocuments(tripId);
  if (!documents) return <ErrorState />;
  return <TripDocumentsList documents={documents} />;
}

async function TripMessagesTab({ tripId }: { tripId: string }) {
  const messages = await loadTripMessages(tripId);
  if (!messages) return <ErrorState />;
  return <TripMessagesThread messages={messages} />;
}

async function TripActivityTab({ tripId }: { tripId: string }) {
  const activity = await loadTripActivity(tripId);
  if (!activity) return <ErrorState />;
  return <TripActivityTimeline activity={activity} />;
}
