import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

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
 *
 * ON MUI (step 2 of the migration, PR 6), as the A336 artboard draws it: a Card per file in
 * a responsive grid, the kind badge a 36×44 rounded Avatar in the legacy tone for each kind
 * (burgundy PDF, orange image, ocean document), and the sensitive flag a 20px outlined Chip.
 * Plain sx, so this stays a Server Component.
 */

/** The legacy badge tones, as palette paths: PDF burgundy, IMG brand orange, DOC tertiary. */
const BADGE_TONE: Record<ClientDocumentRow["badge"], { bgcolor: string; color: string }> = {
  PDF: { bgcolor: "brandSource.burgundy", color: "common.white" },
  IMG: { bgcolor: "brand.main", color: "brand.contrastText" },
  DOC: { bgcolor: "tertiary.main", color: "tertiary.contrastText" },
};

/** `.chip.h-5.px-2.text-[10px]`: the 20px flag chip. */
const MINI_CHIP_SX = { height: 20, flexShrink: 0, fontSize: 10, "& .MuiChip-label": { px: 1 } } as const;

/** A single-line text that clips rather than wraps, as the legacy `truncate` did. */
const TRUNCATE = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function ClientDocumentsTab({ documents }: { documents: ClientDocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {CLIENT_COPY.documentsEmpty}
      </Typography>
    );
  }

  return (
    <Box
      component="ul"
      sx={{
        m: 0,
        p: 0,
        listStyle: "none",
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          xl: "repeat(3, minmax(0, 1fr))",
        },
      }}
    >
      {documents.map((d) => (
        <Card component="li" key={d.documentId}>
          <CardContent sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.25, "&:last-child": { pb: 1.5 } }}>
            <Avatar
              variant="rounded"
              aria-hidden="true"
              sx={{ width: 36, height: 44, flexShrink: 0, fontSize: 9, fontWeight: 800, ...BADGE_TONE[d.badge] }}
            >
              {d.badge}
            </Avatar>
            <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="span" variant="subtitle1" sx={{ ...TRUNCATE, fontWeight: 600, lineHeight: 1.3 }}>
                {d.filename}
              </Typography>
              <Typography component="span" variant="caption" sx={{ ...TRUNCATE, color: "text.secondary" }}>
                {[d.tripTitle, d.sizeLabel].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            {d.sensitive && (
              <Chip size="small" variant="outlined" label={CLIENT_COPY.documentSensitive} sx={MINI_CHIP_SX} />
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
