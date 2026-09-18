import type { Metadata } from "next";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState } from "@/components/client/states";
import { loadAccountDocuments } from "@/lib/account/documents";
import { groupDocuments } from "@/lib/trips/documents";

import { DocumentRow } from "../trips/[tripId]/documents/DocumentRow";
import { DOCUMENTS_LIBRARY } from "./content";

export const metadata: Metadata = { title: "Documents" };

/**
 * Screen Inventory 2.5.4 — Travel Documents, the ACCOUNT-WIDE library.
 * §4.4 Pattern B. Per-trip documents are §2.2.6, at /trips/[tripId]/documents.
 * Artboards: client-account.jsx `C254_TravelDocs`, client-account-mobile.jsx `M254_TravelDocs`.
 *
 * READ-ONLY. The read works; none of the three mutating actions has a door.
 *
 *  · UPLOAD IS DISABLED, and this is the section's biggest gap. `trip-document` is the ONLY
 *    insert into `document` anywhere in the repo and it hard-requires a `tripId`, keying the
 *    object under `trips/<tripId>/`. The MODEL is ready — `document.trip_id` is nullable and
 *    both read paths already handle a trip-less row — but the WRITE door is trip-only, so a
 *    passport that belongs to a person rather than to one trip cannot be created from
 *    anywhere. A trip picker is NOT the fix: the just-onboarded traveler this screen serves
 *    may have no trip to pick, and filing their passport under an arbitrary trip also drops
 *    it into that trip's §2.2.6 library. See the Screen Inventory note at 2.5.4 for what an
 *    account-scoped endpoint has to add.
 *  · "Send to Gyasi" replaces "share securely" and is deferred with it — `trip-message`
 *    already filters `attachmentDocumentIds` to documents the caller owns, so the path
 *    exists, but the control belongs with the upload work.
 *  · "Delete" is an ARCHIVE (`document.archived_at`) and has no function either. Rows are
 *    never removed: `card_use_event.receipt_document_id` and `commission_import.document_id`
 *    reference them.
 *
 * NO THUMBNAIL GRID, against the artboard. Storage is addressed by key, `storage_key` is
 * withheld, and `trip-document-url` signs ON DEMAND precisely so a five-minute URL for a
 * file nobody opened is not a false entry on the access trail. A grid would sign every
 * document and write an access record per document per page load. Same reasoning §2.2.11
 * used to leave its photographs unrendered.
 *
 * `DocumentRow` is imported from §2.2.6's folder rather than copied: it carries a
 * synchronous `window.open` (claimed while the gesture is still live, or the popup blocker
 * eats it) and the audit-on-sign reasoning, neither of which should exist twice. Promoting
 * it to components/client/ is the tidier home and is left as a follow-up so this change does
 * not move shipped §2.2 code.
 */
export default async function DocumentsPage() {
  const documents = await loadAccountDocuments();

  if (documents === null) return <ErrorState />;

  const groups = groupDocuments(documents);

  return (
    <div className="client-fill">
      <header className="border-b border-outline-variant bg-surface-1">
        <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="t-headline">{DOCUMENTS_LIBRARY.title}</h1>
              <p className="t-body-s text-on-surface-variant">{DOCUMENTS_LIBRARY.subtitle}</p>
            </div>
            <button
              type="button"
              className="btn btn-orange btn-sm shrink-0"
              disabled
              aria-disabled="true"
              title={DOCUMENTS_LIBRARY.uploadDeferred}
            >
              <Icon name="upload" size={14} /> {DOCUMENTS_LIBRARY.uploadCta}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        {groups.length === 0 ? (
          <EmptyState
            icon="passport"
            title={DOCUMENTS_LIBRARY.emptyTitle}
            body={DOCUMENTS_LIBRARY.emptyBody}
            action={{ label: DOCUMENTS_LIBRARY.emptyCta, href: "/dashboard" }}
          />
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.id} className="mb-5">
                <h2 className="t-title-s mb-2">{group.label}</h2>
                <Card className="overflow-hidden p-0">
                  {group.documents.map((doc, index) => (
                    <DocumentRow key={doc.id} document={doc} first={index === 0} />
                  ))}
                </Card>
              </section>
            ))}

            <Card variant="flat" className="mt-6 flex gap-3 p-4">
              <Icon name="lock" size={17} className="shrink-0 text-on-surface-variant" />
              <p className="t-body-s text-on-surface-variant">{DOCUMENTS_LIBRARY.privacyNote}</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
