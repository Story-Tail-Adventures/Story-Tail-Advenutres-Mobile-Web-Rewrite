import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState } from "@/components/client/states";
import { loadAccountDocuments } from "@/lib/account/documents";
import { groupDocuments } from "@/lib/trips/documents";

import { DocumentRow } from "../trips/[tripId]/documents/DocumentRow";
import { DOCUMENTS_LIBRARY } from "./content";

export const metadata: Metadata = { title: "Documents" };

/** The 768px column (the legacy max-w-3xl) both the header and the body sit in. */
const COLUMN_SX = { mx: "auto", width: "100%", maxWidth: 768, p: { xs: 2, md: 3 } } as const;

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
      <Box component="header" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "surface.1" }}>
        <Box sx={COLUMN_SX}>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 1.5,
            }}
          >
            <Box>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
                {DOCUMENTS_LIBRARY.title}
              </Typography>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {DOCUMENTS_LIBRARY.subtitle}
              </Typography>
            </Box>
            <Button
              variant="orange"
              size="sm"
              disabled
              aria-disabled="true"
              title={DOCUMENTS_LIBRARY.uploadDeferred}
            >
              <Icon name="upload" size={14} /> {DOCUMENTS_LIBRARY.uploadCta}
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={COLUMN_SX}>
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
              <Box component="section" key={group.id} sx={{ mb: 2.5 }}>
                <Typography component="h2" variant="subtitle1" sx={{ mb: 1 }}>
                  {group.label}
                </Typography>
                <Card>
                  {group.documents.map((doc, index) => (
                    <DocumentRow key={doc.id} document={doc} first={index === 0} />
                  ))}
                </Card>
              </Box>
            ))}

            {/* The legacy card-flat: outlined on surface.2 (components/ui/Card). */}
            <Card variant="outlined" sx={{ mt: 3, display: "flex", gap: 1.5, p: 2, bgcolor: "surface.2" }}>
              <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
                <Icon name="lock" size={17} />
              </Box>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {DOCUMENTS_LIBRARY.privacyNote}
              </Typography>
            </Card>
          </>
        )}
      </Box>
    </div>
  );
}
