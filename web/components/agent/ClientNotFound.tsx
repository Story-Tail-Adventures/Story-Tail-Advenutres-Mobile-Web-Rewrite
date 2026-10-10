import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * What §3.3.2 renders for a client id that is not this advisor's, does not exist, or is a
 * merged tombstone. `agent_client_overview` answers zero rows for all three, deliberately
 * indistinguishable so ids cannot be probed.
 *
 * A SIBLING OF `TripNotFound`, and for the reasons its doc comment sets out at length:
 * neither `ErrorState` (whose copy is false on every count for a record that simply is not
 * there, and whose fallback action points at a traveler route) nor `notFound()` (whose
 * boundary re-renders the layout on the client, where React will not execute the inline
 * ThemeScript, so the whole page comes out light in a dark app).
 *
 * ON MUI (step 2 of the migration, PR 6): the same left-aligned Card in the page column,
 * the glyph in a secondary-container Avatar and the way back an outlined MUI Button in the
 * legacy `.btn-sm` box. Plain sx, so this stays a Server Component.
 */

/** The page column: `mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1336,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export function ClientNotFound() {
  return (
    <Box sx={PAGE_SX}>
      <Card>
        <CardContent
          sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1.5, "&:last-child": { pb: 3 } }}
        >
          <Avatar
            aria-hidden="true"
            sx={{ width: 40, height: 40, bgcolor: "secondary.container", color: "secondary.onContainer" }}
          >
            <Icon name="users" size={18} />
          </Avatar>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {CLIENT_COPY.notFoundTitle}
          </Typography>
          <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
            {CLIENT_COPY.notFoundBody}
          </Typography>
          <MuiButton
            component={NextLink}
            href="/agent/clients"
            variant="outlined"
            color="secondary"
            size="small"
            sx={{ ...BTN_SM, mt: 0.5 }}
          >
            {CLIENT_COPY.notFoundAction}
          </MuiButton>
        </CardContent>
      </Card>
    </Box>
  );
}
