import Link from "next/link";

import { ClientForm } from "@/components/agent/ClientForm";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import { loadClientRoster } from "@/lib/agent/clients";

/**
 * Screen 3.3.9 — Create Client. §4.4 Pattern A.
 *
 * THE TAG SUGGESTIONS ARE READ, NOT HARDCODED. The prototype offers five fixed chips
 * (Honeymoon, Family, VIP, Cruise, Returning); `client.tags` is free-form with no
 * vocabulary table, so the useful set is the one this advisor already uses. They come from
 * the same `tag_facets` the roster's filter chips do — one read, one source of truth, and a
 * new tag is still just typed.
 *
 * A failed suggestion read is NOT a failed page. The chips are a convenience; the field
 * below them takes anything, so an empty suggestion list costs a shortcut rather than the
 * screen.
 */

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  const roster = await loadClientRoster({ status: "active", tags: [], search: "", page: 1 });

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-8">
      <Link
        href="/agent/clients"
        className="t-body-s inline-flex items-center gap-1 text-[var(--md-on-surface-variant)] hover:underline"
      >
        <Icon name="arrow_left" size={13} />
        {CLIENT_COPY.backToRoster}
      </Link>

      <header className="mb-4 mt-2.5">
        <h1 className="t-title-l m-0">{CLIENT_COPY.newClientTitle}</h1>
        <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
          {CLIENT_COPY.newClientSub}
        </p>
      </header>

      <ClientForm mode="create" suggestedTags={roster?.facets.map((f) => f.tag) ?? []} />
    </div>
  );
}
