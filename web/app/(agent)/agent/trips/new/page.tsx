import Link from "next/link";

import { NewTripForm } from "@/components/agent/NewTripForm";
import { RetryState } from "@/components/client/RetryState";
import { NEW_TRIP_COPY, TRIP_COPY } from "@/lib/agent/content";
import { loadClientRoster } from "@/lib/agent/clients";

/**
 * Screen 3.4.3 — Create New Trip.
 *
 * THE WHOLE BOOK IS LOADED ONCE, here, and handed to the picker. `agent_client_roster`
 * pages at 25 by default; this asks for 500 in one read because the control is a
 * `<datalist>` the browser filters locally, and an advisor's book is tens rather than
 * thousands. When that stops being true the accessor already takes `p_search` and this
 * becomes a search-as-you-type without the form changing shape.
 *
 * ARCHIVED CLIENTS ARE NOT OFFERED. §3.3.12 archives a client to take them off the working
 * surfaces; starting a new trip for one would walk straight back past that decision.
 *
 * `?client=` PRE-SELECTS, which is what makes this reachable from §3.3.4's "New trip" and
 * from the client form's "Save & create trip" without the advisor re-picking somebody the
 * previous screen already knew.
 */

export const metadata = { title: "New trip" };

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const params = await searchParams;

  const roster = await loadClientRoster({
    status: "active",
    tags: [],
    search: "",
    page: 1,
  }, { pageSize: 500 });

  if (!roster) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-8">
        <RetryState />
      </div>
    );
  }

  const clients = roster.rows.map((r) => ({
    id: r.clientId,
    name: r.displayName,
    email: r.email,
  }));

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-8">
      <Link
        href="/agent/trips"
        className="t-body-s mb-3 inline-block text-[var(--md-on-surface-variant)] hover:underline"
      >
        ← {TRIP_COPY.title}
      </Link>

      <header className="mb-5">
        <h1 className="t-title-l m-0">{NEW_TRIP_COPY.title}</h1>
        <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
          {NEW_TRIP_COPY.subtitle}
        </p>
      </header>

      <NewTripForm clients={clients} presetClientId={params.client} />
    </div>
  );
}
