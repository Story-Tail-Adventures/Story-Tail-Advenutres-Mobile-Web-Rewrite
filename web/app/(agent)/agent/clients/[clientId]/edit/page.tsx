import Link from "next/link";

import { ClientForm } from "@/components/agent/ClientForm";
import { ClientNotFound } from "@/components/agent/ClientNotFound";
import { RetryState } from "@/components/client/RetryState";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import { loadClientRoster } from "@/lib/agent/clients";
import { loadClientForEdit } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.10 — Edit Client. §4.4 Pattern A, and the same form as 3.3.9: §3.3.10's own
 * Screen Inventory entry says "Same as Create Client".
 *
 * THE PREFILL COMES FROM THE OVERVIEW ACCESSOR, which is also where `version` comes from —
 * and the version is why this page cannot be a client component holding stale props. Two
 * tabs open on one client is exactly what `client.version` exists for, and the number has
 * to be read at the moment the form renders.
 *
 * The prototype puts Cancel and Save in the ScreenHeader here where Create puts them at the
 * card's foot. Both sit at the foot in the build: the form is long enough on a phone that a
 * header button scrolls away, and having the same form end two different ways is a
 * difference with nothing behind it.
 */

export const metadata = { title: "Edit client" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const [result, roster] = await Promise.all([
    loadClientForEdit(clientId),
    loadClientRoster({ status: "active", tags: [], search: "", page: 1 }),
  ]);

  if (!result.ok) {
    return result.reason === "not-found" ? <ClientNotFound /> : (
      <div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-8">
        <RetryState />
      </div>
    );
  }

  const c = result.values;

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-8">
      <Link
        href={`/agent/clients/${clientId}`}
        className="t-body-s inline-flex items-center gap-1 text-[var(--md-on-surface-variant)] hover:underline"
      >
        <Icon name="arrow_left" size={13} />
        {c.displayName}
      </Link>

      <header className="mb-4 mt-2.5">
        <h1 className="t-title-l m-0">
          {CLIENT_COPY.editClientTitle} · {c.displayName}
        </h1>
        <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
          {CLIENT_COPY.editClientSub}
        </p>
      </header>

      <ClientForm
        mode="edit"
        clientId={clientId}
        expectedVersion={c.version}
        suggestedTags={roster?.facets.map((f) => f.tag) ?? []}
        defaults={c}
      />
    </div>
  );
}
