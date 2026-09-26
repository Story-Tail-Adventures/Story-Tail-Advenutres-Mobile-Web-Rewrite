import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientDocumentRow } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.6 — every document associated with the client, across trips.
 *
 * THE UNION IS THE POINT, and it lives in `agent_client_documents`: `document.client_id`
 * and `document.trip_id` are independently nullable, so a passport hangs off the client and
 * a booking confirmation off the trip. A tab reading one predicate shows half the folder.
 *
 * NO DOWNLOAD YET. `document.storage_key` is server-only and a signed URL is
 * `trip-document-url`'s job; wiring a client-scoped download is §3.3.6's own upload path.
 * The control renders disabled with its reason rather than as a link to nothing.
 *
 * `is_sensitive` IS SURFACED. A passport scan and a booking confirmation are not the same
 * kind of file, and the row says which is which before anyone shares one.
 */
const BADGE_TONE: Record<ClientDocumentRow["badge"], string> = {
  PDF: "bg-brand-burgundy",
  IMG: "bg-brand-orange",
  DOC: "bg-[var(--md-tertiary)]",
};

export function ClientDocumentsTab({ documents }: { documents: ClientDocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {CLIENT_COPY.documentsEmpty}
      </p>
    );
  }

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {documents.map((d) => (
        <li key={d.documentId} className="card flex items-center gap-2.5 p-3">
          <span
            className={`flex h-11 w-9 shrink-0 items-center justify-center rounded text-[9px] font-extrabold text-white ${BADGE_TONE[d.badge]}`}
          >
            {d.badge}
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title-s block truncate text-[12.5px]">{d.filename}</span>
            <span className="t-body-s block truncate text-[var(--md-on-surface-variant)]">
              {[d.tripTitle, d.sizeLabel].filter(Boolean).join(" · ")}
            </span>
          </span>
          {d.sensitive && (
            <span className="chip h-5 shrink-0 px-2 text-[10px]">
              {CLIENT_COPY.documentSensitive}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
