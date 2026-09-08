import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { DOCUMENT_MESSAGES, groupDocuments } from "@/lib/trips/documents";
import { loadTripDocuments } from "@/lib/trips/queries";
import { DOCUMENTS } from "./content";
import { DocumentRow } from "./DocumentRow";

export const metadata: Metadata = { title: "Documents" };

/**
 * Screen 2.2.6 Trip Document Library — docs/Screen-Inventory.md §2.2.6, §4.4 Pattern B
 * ("web is a grid, mobile is a list"), and
 * design/source-prototype/screens/client-trip.jsx (C226_TripDocuments) +
 * client-trip-mobile.jsx (M226_TripDocuments). P1.
 *
 * THE GRID/LIST SPLIT IS PATTERN B, and it is the reason this renders one row component at
 * both sizes rather than two components: the desktop artboard's three-up grid and the mobile
 * artboard's stacked list are the SAME card at different column counts. `md:grid-cols-2
 * web:grid-cols-3` gets there with no second implementation, and the card divider becomes a
 * card border once the rows stop being adjacent.
 *
 * TWO NAMED PRIMARY ELEMENTS ARE NOT BUILT, both deliberately:
 *
 *   - The upload CTA renders disabled. `trip-document` will sign a PUT, but the file picker,
 *     the progress state and the confirm step that replaces the placeholder
 *     `checksum_sha256` amount to the separate Document Upload screen §2.2.6 lists among its
 *     related screens. Disabled with a reason beats a button that does nothing.
 *   - Per-document "share" is gone rather than disabled. The plan settled the share question
 *     as PDF-only, with the secure link deferred to §2.8, so there is no share of a single
 *     document to offer — and a disabled control implies one is coming next week.
 *
 * The desktop artboard's Grid/List toggle is also absent: it toggled between two renderings
 * of five rows. Pattern B already gives the responsive answer, and a per-viewer preference
 * needs somewhere to live.
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const library = await loadTripDocuments(tripId);

  // RLS makes "not yours" and "does not exist" the same answer, so this is a 404 rather than
  // an empty library belonging to somebody else.
  if (!library) notFound();

  const groups = groupDocuments(library.documents);

  return (
    <div className="pb-10">
      <header className="border-b border-outline-variant bg-surface px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-4xl">
          <Link
            href={`/trips/${tripId}`}
            className="t-body-s inline-flex items-center gap-1 text-on-surface-variant"
          >
            <Icon name="arrow_left" size={14} /> {DOCUMENTS.back}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="t-headline">{DOCUMENTS.title}</h1>
              <p className="t-body-s text-on-surface-variant">
                {DOCUMENTS.subtitle(library.tripTitle)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-orange btn-sm shrink-0"
              disabled
              aria-disabled="true"
              title={DOCUMENTS.uploadDeferred}
            >
              <Icon name="upload" size={14} /> {DOCUMENTS.uploadCta}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
        {groups.length === 0 ? (
          <EmptyState
            icon="passport"
            title={DOCUMENT_MESSAGES.emptyTitle}
            body={DOCUMENT_MESSAGES.emptyBody}
            action={{ label: DOCUMENTS.back, href: `/trips/${tripId}` }}
          />
        ) : (
          <>
            <p className="t-body-s text-on-surface-variant">
              {DOCUMENTS.countLabel(library.documents.length)}
            </p>

            <div className="mt-4 flex flex-col gap-6">
              {groups.map((group) => (
                <section key={group.id}>
                  <h2 className="t-title-s mb-2">{group.label}</h2>

                  {/* One card per group on mobile — the artboard's divided list — becoming
                      separate cards in a grid from tablet up. `gap-0` below md is what keeps
                      the rows sharing a single card edge instead of stacking bordered boxes
                      with air between them. */}
                  <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-xl border border-outline-variant bg-surface md:grid-cols-2 md:gap-2.5 md:border-0 md:bg-transparent web:grid-cols-3">
                    {group.documents.map((doc, index) => (
                      <div
                        key={doc.id}
                        className="md:rounded-xl md:border md:border-outline-variant md:bg-surface"
                      >
                        <DocumentRow document={doc} first={index === 0} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
