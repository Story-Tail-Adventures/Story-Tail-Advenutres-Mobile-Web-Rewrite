import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientActivityEvent } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.8 — the audit trail for this client and their trips.
 *
 * SIGN-INS ARE NOT HERE, and the note at the foot says so rather than leaving a reader to
 * wonder. §3.3.8's own description names logins first and the prototype draws one, but they
 * live in `auth_event` and have their own screen — §3.9.6 Login Activity. Building them
 * here would put half of §3.9.6 under a different heading.
 *
 * `event_type` IS NOT COPY. The slug is turned into a sentence in the view model, with an
 * unrecognised type falling back to a humanised form of itself rather than being dropped —
 * a timeline whose whole job is that nothing is missing from it cannot silently skip a row.
 */
export function ClientActivityTab({ events }: { events: ClientActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {CLIENT_COPY.activityEmpty}
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {events.map((e) => (
          <li key={e.eventId} className="card flex items-center gap-2.5 px-3.5 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
              <Icon name={e.icon} size={13} />
            </span>
            <span className="t-body min-w-0 flex-1 truncate">
              {e.description}
              {e.actorName && (
                <span className="text-[var(--md-on-surface-variant)]"> · {e.actorName}</span>
              )}
            </span>
            <span className="t-body-s shrink-0 text-[var(--md-on-surface-variant)]">
              {e.whenLabel}
            </span>
          </li>
        ))}
      </ul>
      <p className="t-body-s mt-2.5 text-[var(--md-on-surface-variant)]">
        {CLIENT_COPY.activityNote}
      </p>
    </>
  );
}
