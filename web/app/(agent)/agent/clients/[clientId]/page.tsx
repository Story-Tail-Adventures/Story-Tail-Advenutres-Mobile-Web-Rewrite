import { ClientActivityTab } from "@/components/agent/ClientActivityTab";
import { ClientBackLink, ClientDetailHeader } from "@/components/agent/ClientDetailHeader";
import { ClientDetailTabs } from "@/components/agent/ClientDetailTabs";
import { ClientDocumentsTab } from "@/components/agent/ClientDocumentsTab";
import { ClientNotesTab } from "@/components/agent/ClientNotesTab";
import { ClientNotFound } from "@/components/agent/ClientNotFound";
import { ClientOverviewTab } from "@/components/agent/ClientOverviewTab";
import { ClientThreadsTab } from "@/components/agent/ClientThreadsTab";
import { ClientTripsTab } from "@/components/agent/ClientTripsTab";
import { RetryState } from "@/components/client/RetryState";
import { validClientTab } from "@/lib/agent/clientTabs";
import type { ClientOverview } from "@/lib/agent/clientDetail";
import {
  loadClientActivity,
  loadClientCompanions,
  loadClientDocuments,
  loadClientNotes,
  loadClientOverview,
  loadClientThreads,
  loadClientTrips,
} from "@/lib/agent/clientDetail";

/**
 * Screens 3.3.2 – 3.3.8 — Client Detail.
 *
 * ONE ROUTE, SIX TABS VIA `?tab=`, not six nested routes — see `clientTabs.ts`. The header
 * renders on every tab from `agent_client_overview` alone, which is also what the tab strip
 * reads its counts from, so the one read that every tab needs happens once.
 *
 * A SERVER COMPONENT THROUGHOUT except two client islands: `ClientDetailTabs` (it needs the
 * pathname and search params) and `ClientNotesTab` (the one write on this screen).
 *
 * PER-TAB FETCHING. Only the active tab's data is read — the same "fetch what this render
 * needs" discipline `loadWorklist`, `loadPipeline` and the §3.4.2 loaders follow. The
 * Overview tab is the one that reads twice, because the household is a list and the rest of
 * the tab is one row.
 *
 * NO `<AgentViews />`, for the reason §3.4.2 records: that strip belongs to §3.2's three
 * views of one section, and rendering it above a different section's own tabs produced two
 * identically-styled rows, one with no active state.
 *
 * THE PROTOTYPE'S 300px CLIENT RAIL IS NOT HERE. `CRMShell` draws the roster again down the
 * left of every detail screen. That is a desktop affordance for a screen that already has a
 * back link, and rebuilding the roster inside the detail means a second paginated read on
 * every tab — for a list the previous page already showed. §4.4's Pattern C asks for
 * "persistent left navigation", which the agent rail already is.
 */

export const metadata = { title: "Client" };

export default async function AgentClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { clientId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = validClientTab(tabParam);

  const result = await loadClientOverview(clientId);

  // A CLIENT THAT IS NOT THERE IS NOT AN ERROR. `agent_client_overview` answers zero rows
  // for a client that does not exist, one belonging to another advisor, and a merged
  // tombstone — deliberately indistinguishable so ids cannot be probed. Collapsing that
  // into the error state renders "something went wrong on our side" over a mistyped URL.
  if (!result.ok) {
    return result.reason === "not-found" ? <ClientNotFound /> : (
      <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
        <RetryState />
      </div>
    );
  }

  const client = result.overview;

  return (
    <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
      <ClientBackLink />
      <div className="mt-2.5">
        <ClientDetailHeader client={client} />
      </div>

      <ClientDetailTabs
        counts={{
          trips: client.tripCount,
          documents: client.documentCount,
          notes: client.noteCount,
        }}
      />

      <div className="mt-4">
        {tab === "overview" && <OverviewTab clientId={clientId} client={client} />}
        {tab === "trips" && <TripsTab clientId={clientId} />}
        {tab === "messages" && <MessagesTab clientId={clientId} />}
        {tab === "documents" && <DocumentsTab clientId={clientId} />}
        {tab === "notes" && <NotesTab clientId={clientId} />}
        {tab === "activity" && <ActivityTab clientId={clientId} />}
      </div>
    </div>
  );
}

/* ── Per-tab loaders. `null` from any of them means the READ failed, never "empty". ──── */

async function OverviewTab({
  clientId,
  client,
}: {
  clientId: string;
  client: ClientOverview;
}) {
  const companions = await loadClientCompanions(clientId);
  if (!companions) return <RetryState />;
  return <ClientOverviewTab client={client} companions={companions} />;
}

async function TripsTab({ clientId }: { clientId: string }) {
  const trips = await loadClientTrips(clientId);
  if (!trips) return <RetryState />;
  return <ClientTripsTab trips={trips} />;
}

async function MessagesTab({ clientId }: { clientId: string }) {
  const threads = await loadClientThreads(clientId);
  if (!threads) return <RetryState />;
  return <ClientThreadsTab threads={threads} />;
}

async function DocumentsTab({ clientId }: { clientId: string }) {
  const documents = await loadClientDocuments(clientId);
  if (!documents) return <RetryState />;
  return <ClientDocumentsTab documents={documents} />;
}

async function NotesTab({ clientId }: { clientId: string }) {
  const notes = await loadClientNotes(clientId);
  if (!notes) return <RetryState />;
  return <ClientNotesTab clientId={clientId} notes={notes} />;
}

async function ActivityTab({ clientId }: { clientId: string }) {
  const events = await loadClientActivity(clientId);
  if (!events) return <RetryState />;
  return <ClientActivityTab events={events} />;
}
