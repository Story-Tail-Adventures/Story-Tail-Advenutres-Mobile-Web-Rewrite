import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { AddLeadForm } from "@/components/agent/AddLeadForm";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { LEAD_COPY } from "@/lib/agent/leads";

/**
 * Screen 3.8.5 Add Lead (revived 2026-10-21, BRD §6.5; was Lead Source Analytics, now
 * 3.11.9). For somebody who reached Gyasi another way. Pattern A, like 3.3.9.
 */

export const metadata = { title: "Add lead" };

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 640, px: { xs: 2, md: 4 }, py: 3 } as const;

export default function NewLeadPage() {
  return (
    <Box sx={PAGE_SX}>
      <MuiLink
        component={NextLink}
        href="/agent/leads"
        variant="body2"
        underline="hover"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
      >
        <Icon name="arrow_left" size={13} />
        {LEAD_COPY.back}
      </MuiLink>

      <Box component="header" sx={{ mb: 2, mt: 1.25 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {LEAD_COPY.addTitle}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {LEAD_COPY.addIntro}
        </Typography>
      </Box>

      <AddLeadForm />
    </Box>
  );
}
