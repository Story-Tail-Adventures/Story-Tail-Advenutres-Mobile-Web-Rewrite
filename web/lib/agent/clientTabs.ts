/**
 * Screen 3.3.2's tabs.
 *
 * `?tab=` rather than nested routes — the same reasoning as Trip Detail's, Pipeline's
 * `?stage=` and Calendar's `?view=`: shareable, back-button-correct, server-rendered
 * `<Link>`s, no client state.
 *
 * SIX TABS, WHERE THE PROTOTYPE DRAWS SEVEN. `CRMShell` renders a seventh called "Account
 * admin" and there is no artboard behind it — those screens are §3.9 (Login Support /
 * Account Administration), which is unbuilt. It is rendered here DISABLED with its reason
 * rather than cut, and the distinction is the one §3.2.1 settled: a disabled control
 * promises a thing that will exist, and §3.9 is a real planned section. Bulk-select on the
 * roster was cut instead, because nothing will ever consume it there.
 */

export const CLIENT_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "trips", label: "Trips" },
  { id: "messages", label: "Messages" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
] as const;

export type ClientDetailTabId = (typeof CLIENT_DETAIL_TABS)[number]["id"];

/** An unknown or missing `?tab=` falls back to Overview, matching every other tab guard. */
export function validClientTab(raw: string | undefined): ClientDetailTabId {
  return (CLIENT_DETAIL_TABS as readonly { id: string }[]).some((t) => t.id === raw)
    ? (raw as ClientDetailTabId)
    : "overview";
}
