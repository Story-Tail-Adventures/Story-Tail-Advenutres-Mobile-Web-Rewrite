import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { inquiryHref } from "@/lib/public/inquiry";
import { RESULTS } from "./content";

/** Legacy .btn-tonal (outlined secondary) and .btn-text (text primary) boxes, Design-System §8. */
const TONAL_SX = { minHeight: 40, px: "24px", whiteSpace: "nowrap" } as const;
const TEXT_SX = { minHeight: 40, px: "12px", whiteSpace: "nowrap" } as const;

/** Empty state for 2.0.4 (fidelity spec §5.7). Never a dead end: clear, or message Gyasi. */
export function EmptyResults() {
  return (
    <Card sx={{ p: 4, textAlign: "center" }}>
      <Typography component="h2" variant="h5">
        {RESULTS.empty.title}
      </Typography>
      <Typography component="p" variant="body2" sx={{ mx: "auto", mt: 0.75, maxWidth: 420, color: "text.secondary" }}>
        {RESULTS.empty.body}
      </Typography>
      <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <MuiButton component={NextLink} href="/explore/results" variant="outlined" color="secondary" sx={TONAL_SX}>
          {RESULTS.empty.clear}
        </MuiButton>
        <MuiButton component="a" href={inquiryHref({ source: "results" })} variant="text" color="primary" sx={TEXT_SX}>
          {RESULTS.empty.message}
        </MuiButton>
      </Box>
    </Card>
  );
}
