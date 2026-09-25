/**
 * Screen 3.4.2's eight tabs.
 *
 * `?tab=` rather than nested routes — the same reasoning as Pipeline's `?stage=` and
 * Calendar's `?view=`/`?month=`: shareable, back-button-correct, server-rendered `<Link>`s,
 * no client state. Nested routes would either duplicate the Overview fetch on every tab or
 * add a shared-layout round trip for no benefit — every tab's data is a handful of rows.
 */

export const TRIP_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "components", label: "Components" },
  { id: "itinerary", label: "Itinerary" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "messages", label: "Messages" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
] as const;

export type TripDetailTabId = (typeof TRIP_DETAIL_TABS)[number]["id"];

/** An unknown or missing `?tab=` falls back to Overview, matching Pipeline's `?stage=` guard. */
export function validTripTab(raw: string | undefined): TripDetailTabId {
  return (TRIP_DETAIL_TABS as readonly { id: string }[]).some((t) => t.id === raw)
    ? (raw as TripDetailTabId)
    : "overview";
}
