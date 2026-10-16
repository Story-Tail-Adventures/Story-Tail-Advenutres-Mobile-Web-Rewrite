import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";

export type MilestoneSummaryProps = {
  label: string;
  /** "Sandals Royal Bahamian · Jordan Hayes": the trip and client, so the dialog names its row. */
  context: string;
  amountLabel: string;
  dueLabel: string | null;
};

/**
 * The milestone strip at the top of each §3.6 dialog (the artboards' A36_MilestoneSummary).
 * The artboard's "· Sandals" after the label is left out: a milestone has no supplier column.
 */
export function MilestoneSummary({ label, context, amountLabel, dueLabel }: MilestoneSummaryProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, bgcolor: "surface.2" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Icon name="receipt" size={16} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="p" variant="subtitle2">
            {label}
          </Typography>
          <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
            {context}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography component="p" variant="subtitle1" sx={{ fontFamily: "mono", fontWeight: 700 }}>
            {amountLabel}
          </Typography>
          {dueLabel && (
            <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
              due {dueLabel}
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
