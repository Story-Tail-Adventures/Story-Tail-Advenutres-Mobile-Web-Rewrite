import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

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
  // `document_kind` has TEN members and this Record had nine: a csv_import document
  // rendered the raw enum value through the `?? d.kind` fallback. Found while writing the
  // Compose twin, which had to enumerate the enum rather than copy this list.
  csv_import: "CSV import",
  pdf_proposal: "Proposal PDF",
  pdf_itinerary: "Itinerary PDF",
  other: "Other",
};

/** The artboard's compact row card (`A34_MuiRowCard` in agent-trip.jsx). */
const ROW_SX = {
  py: 1.25,
  px: 1.75,
  display: "flex",
  gap: 1.5,
  alignItems: "center",
  "&:last-child": { pb: 1.25 },
} as const;

export function TripDocumentsList({ documents }: { documents: TripDocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {AGENT_COPY.tripDocumentsEmpty}
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75}>
      {documents.map((d) => (
        <Card key={d.documentId}>
          <CardContent sx={ROW_SX}>
            <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
              <Icon name="passport" size={16} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d.filename}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                {KIND_LABEL[d.kind] ?? d.kind} · {d.sizeLabel}
                {d.createdLabel ? ` · ${d.createdLabel}` : ""}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
