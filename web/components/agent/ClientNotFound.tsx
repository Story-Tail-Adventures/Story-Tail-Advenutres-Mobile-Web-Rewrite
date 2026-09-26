import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * What §3.3.2 renders for a client id that is not this advisor's, does not exist, or is a
 * merged tombstone. `agent_client_overview` answers zero rows for all three, deliberately
 * indistinguishable so ids cannot be probed.
 *
 * A SIBLING OF `TripNotFound`, and for the reasons its doc comment sets out at length:
 * neither `ErrorState` (whose copy is false on every count for a record that simply is not
 * there, and whose fallback action points at a traveler route) nor `notFound()` (whose
 * boundary re-renders the layout on the client, where React will not execute the inline
 * ThemeScript, so the whole page comes out light in a dark app).
 */
export function ClientNotFound() {
  return (
    <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
      <div className="card flex flex-col items-start gap-3 p-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
          <Icon name="users" size={18} />
        </span>
        <h1 className="t-title-l m-0">{CLIENT_COPY.notFoundTitle}</h1>
        <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
          {CLIENT_COPY.notFoundBody}
        </p>
        <Link href="/agent/clients" className="btn btn-tonal btn-sm mt-1">
          {CLIENT_COPY.notFoundAction}
        </Link>
      </div>
    </div>
  );
}
