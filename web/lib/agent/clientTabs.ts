/**
 * Screen 3.3.2's tabs.
 *
 * `?tab=` rather than nested routes — the same reasoning as Trip Detail's, Pipeline's
 * `?stage=` and Calendar's `?view=`: shareable, back-button-correct, server-rendered
 * `<Link>`s, no client state.
 *
 * SEVEN TABS, as `CRMShell` draws them. The seventh, "Account admin", was rendered disabled
 * until §3.9 (Login Support) was built on 2026-10-16; it is A391 plus 3.9.6's sign-ins,
 * behind an MFA gate the database enforces (`agent_client_account_admin`).
 */

export const CLIENT_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "trips", label: "Trips" },
  { id: "messages", label: "Messages" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
  { id: "account", label: "Account admin" },
] as const;

export type ClientDetailTabId = (typeof CLIENT_DETAIL_TABS)[number]["id"];

/** An unknown or missing `?tab=` falls back to Overview, matching every other tab guard. */
export function validClientTab(raw: string | undefined): ClientDetailTabId {
  return (CLIENT_DETAIL_TABS as readonly { id: string }[]).some((t) => t.id === raw)
    ? (raw as ClientDetailTabId)
    : "overview";
}
