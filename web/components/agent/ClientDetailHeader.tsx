import Link from "next/link";

import { Avatar } from "@/components/public/Avatar";
import { ClientArchiveDialog } from "@/components/agent/ClientArchiveDialog";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientOverview } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.2's header card — the gradient band the prototype draws above the tabs.
 *
 * THREE ACTIONS, ALL DISABLED, AND EACH NAMES ITS OWN SECTION. The prototype draws Message,
 * Call and "New trip" as live buttons. Messaging is §3.10, creating a trip is §3.4.3, and
 * neither is built — so they render disabled with their reasons, the treatment §3.4.2's
 * header established for the same three-button row. Call is the exception that is NOT
 * disabled: a `tel:` link needs no section behind it, and a phone number the advisor can
 * tap is the whole point of opening this screen on a phone.
 *
 * THE STATUS PILL IS ONE, NOT TWO. The prototype draws "Active" beside "Trip in motion",
 * which reads as two states of the same thing. `client.status` is the record's lifecycle
 * (active / archived / merged_into); whether a trip is in flight is a count, and it is in
 * the mini-stats where the other counts live.
 */
export function ClientDetailHeader({ client }: { client: ClientOverview }) {
  return (
    <header className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3.5 bg-gradient-to-br from-[var(--md-primary-container)] to-[var(--md-secondary-container)] p-5">
        <Avatar initials={client.initials} size={64} tone="brand" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="t-title-l m-0 text-[var(--md-on-primary-container)]">
              {client.displayName}
            </h1>
            {client.archived && (
              <span className="chip-status cancelled">{CLIENT_COPY.filterArchived}</span>
            )}
            {client.tags.map((t) => (
              <span key={t} className="chip h-5 px-2 text-[10.5px]">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12.5px] font-medium text-[var(--md-on-primary-container)]">
            {client.email && <span>{client.email}</span>}
            {client.phone && <span>{client.phone}</span>}
            {client.addressLine && <span>{client.addressLine}</span>}
            <span>Since {client.sinceLabel}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            disabled
            title={CLIENT_COPY.messageClientDeferred}
            className="btn btn-tonal btn-sm opacity-50"
          >
            <Icon name="message" size={12} />
            <span className="sr-only">{CLIENT_COPY.messageClientDeferred}</span>
          </button>
          {/* Not disabled: a tel: link needs no section behind it. */}
          {client.phone ? (
            <a href={`tel:${client.phone.replace(/[^+\d]/g, "")}`} className="btn btn-tonal btn-sm">
              <Icon name="phone" size={12} />
              <span className="sr-only">Call {client.displayName}</span>
            </a>
          ) : null}
          <button
            type="button"
            disabled
            title={CLIENT_COPY.newTripForClientDeferred}
            className="btn btn-filled btn-sm opacity-50"
          >
            <Icon name="plus" size={12} /> New trip
            <span className="sr-only"> — {CLIENT_COPY.newTripForClientDeferred}</span>
          </button>
          {/* §3.3.12, both directions. The dialog picks its own verb from `archived`. */}
          <ClientArchiveDialog
            clientId={client.clientId}
            displayName={client.displayName}
            version={client.version}
            archived={client.archived}
          />
          {/* §3.3.11 is DEFERRED to §3.9, where it also lives as 3.9.7 — the riskiest write
              in the section, next to the account-admin tools it shares a screen with. */}
          <button
            type="button"
            disabled
            title={CLIENT_COPY.mergeDeferred}
            className="btn btn-text btn-sm opacity-50"
          >
            Merge
            <span className="sr-only"> — {CLIENT_COPY.mergeDeferred}</span>
          </button>
        </div>
      </div>

      {client.archived && (
        <p className="t-body-s m-0 border-t border-[var(--md-outline-variant)] px-5 py-2 text-[var(--md-on-surface-variant)]">
          {CLIENT_COPY.archivedBanner}
        </p>
      )}
    </header>
  );
}

/** The breadcrumb back to the roster. A real link, because the roster is a real route now. */
export function ClientBackLink() {
  return (
    <Link
      href="/agent/clients"
      className="t-body-s inline-flex items-center gap-1 text-[var(--md-on-surface-variant)] hover:underline"
    >
      <Icon name="arrow_left" size={13} />
      {CLIENT_COPY.backToRoster}
    </Link>
  );
}
