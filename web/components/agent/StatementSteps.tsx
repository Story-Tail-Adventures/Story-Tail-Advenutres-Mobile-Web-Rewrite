import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { STATEMENT_COPY } from "@/lib/agent/content";

/**
 * A375_CSVImport's two cards, side by side from `md` and stacked below it (the artboard's
 * `1fr 1fr` grid, with `minmax(0, 1fr)` tracks so a long filename cannot push one wider).
 * Shared by the upload page and a statement waiting for its columns.
 */
export function StatementSteps({ upload, map }: { upload: React.ReactNode; map: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) minmax(0, 1fr)" },
        gap: 1.75,
        maxWidth: 1080,
        alignItems: "start",
      }}
    >
      <Card>
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
            {STATEMENT_COPY.step1Title}
          </Typography>
          {upload}
        </CardContent>
      </Card>
      <Card>
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
            {STATEMENT_COPY.step2Title}
          </Typography>
          {map}
        </CardContent>
      </Card>
    </Box>
  );
}

/**
 * The artboard's "Where do I get this file?" header action, as a disclosure: a native
 * `<details>`, so it opens by keyboard and needs no client code.
 */
export function StatementHelp() {
  return (
    <Box component="details" sx={{ flexShrink: 0, maxWidth: 360 }}>
      <Box
        component="summary"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          cursor: "pointer",
          color: "primary.main",
          fontSize: 14,
          fontWeight: 500,
          minHeight: 32,
          listStyle: "none",
          "&::-webkit-details-marker": { display: "none" },
        }}
      >
        <Icon name="question" size={12} />
        {STATEMENT_COPY.whereFileLabel}
      </Box>
      <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
        {STATEMENT_COPY.whereFileBody}
      </Typography>
    </Box>
  );
}
