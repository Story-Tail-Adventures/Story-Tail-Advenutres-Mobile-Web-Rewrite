import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY } from "@/lib/agent/content";
import type { TripDocumentRow } from "@/lib/agent/tripDetail";

const KIND_LABEL: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  insurance_cert: "Insurance certificate",
  supplier_confirmation: "Supplier confirmation",
  receipt: "Receipt",
  photo: "Photo",
  pdf_proposal: "Proposal PDF",
  pdf_itinerary: "Itinerary PDF",
  other: "Other",
};

export function TripDocumentsList({ documents }: { documents: TripDocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {AGENT_COPY.tripDocumentsEmpty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {documents.map((d) => (
        <div key={d.documentId} className="card flex items-center gap-3 px-3.5 py-2.5">
          <Icon name="passport" size={16} className="shrink-0 text-[var(--md-on-surface-variant)]" />
          <div className="min-w-0 flex-1">
            <p className="t-title-s truncate text-[13px]">{d.filename}</p>
            <p className="t-body-s text-[var(--md-on-surface-variant)]">
              {KIND_LABEL[d.kind] ?? d.kind} · {d.sizeLabel}
              {d.createdLabel ? ` · ${d.createdLabel}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
