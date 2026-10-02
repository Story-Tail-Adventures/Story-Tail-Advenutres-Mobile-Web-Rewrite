import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { UP_MD, UP_WEB } from "@/lib/mui/sx";
import { DOCUMENT_MESSAGES, groupDocuments } from "@/lib/trips/documents";
import { loadTripDocuments } from "@/lib/trips/queries";
import { BACK_LINK, HEADER_BAND, HEADLINE, PAD, TITLE_S } from "../sx";
import { DOCUMENTS } from "./content";
import { DocumentRow } from "./DocumentRow";

export const metadata: Metadata = { title: "Documents" };

/** `mx-auto w-full max-w-4xl` — the library is a little wider than the reading column. */
const LIBRARY_COL = { mx: "auto", width: "100%", maxWidth: 896 } as const;

/**
 * One card per group on mobile — the artboard's divided list — dissolving into a grid of
 * separate cards from tablet up (two across, three from `web`). The zero gap below `md` is
 * what keeps the rows sharing a single card edge instead of stacking boxes with air between
 * them; from `md` the Card's own paper, shadow and clipping go so the grid shows through.
 */
const GROUP_GRID = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 0,
  [UP_MD]: {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 1.25,
    overflow: "visible",
    bgcolor: "transparent",
    backgroundImage: "none",
    boxShadow: "none",
  },
  [UP_WEB]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
} as const;

/** A row's own card, which only exists from `md` up. */
const ROW_CARD = {
  [UP_MD]: { overflow: "hidden", borderRadius: 1, bgcolor: "background.paper", boxShadow: 1 },
} as const;

/**
 * Screen 2.2.6 Trip Document Library — docs/Screen-Inventory.md §2.2.6, §4.4 Pattern B
 * ("web is a grid, mobile is a list"), and
 * design/source-prototype/screens/client-trip.jsx (C226_TripDocuments) +
 * client-trip-mobile.jsx (M226_TripDocuments). P1.
 *
 * THE GRID/LIST SPLIT IS PATTERN B, and it is the reason this renders one row component at
 * both sizes rather than two components: the desktop artboard's three-up grid and the mobile
 * artboard's stacked list are the SAME card at different column counts. The two-column grid
 * from `md` and three from `web` get there with no second implementation, and the card
 * divider becomes a card border once the rows stop being adjacent.
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
    <Box sx={{ pb: 5 }}>
      <Box component="header" sx={HEADER_BAND}>
        <Box sx={LIBRARY_COL}>
          <MuiLink component={NextLink} href={`/trips/${tripId}`} underline="hover" sx={BACK_LINK}>
            <Icon name="arrow_left" size={14} /> {DOCUMENTS.back}
          </MuiLink>
          <Box
            sx={{
              mt: 0.75,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 1.5,
            }}
          >
            <Box>
              <Typography component="h1" variant="h5" sx={HEADLINE}>
                {DOCUMENTS.title}
              </Typography>
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {DOCUMENTS.subtitle(library.tripTitle)}
              </Typography>
            </Box>
            <Button
              variant="orange"
              size="sm"
              disabled
              aria-disabled="true"
              title={DOCUMENTS.uploadDeferred}
            >
              <Icon name="upload" size={14} /> {DOCUMENTS.uploadCta}
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...LIBRARY_COL, ...PAD }}>
        {groups.length === 0 ? (
          <EmptyState
            icon="passport"
            title={DOCUMENT_MESSAGES.emptyTitle}
            body={DOCUMENT_MESSAGES.emptyBody}
            action={{ label: DOCUMENTS.back, href: `/trips/${tripId}` }}
          />
        ) : (
          <>
            <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {DOCUMENTS.countLabel(library.documents.length)}
            </Typography>

            <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 3 }}>
              {groups.map((group) => (
                <Box component="section" key={group.id}>
                  <Typography component="h2" variant="subtitle1" sx={{ ...TITLE_S, mb: 1 }}>
                    {group.label}
                  </Typography>

                  <Card sx={GROUP_GRID}>
                    {group.documents.map((doc, index) => (
                      <Box key={doc.id} sx={ROW_CARD}>
                        <DocumentRow document={doc} first={index === 0} />
                      </Box>
                    ))}
                  </Card>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
