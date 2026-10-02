import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";

/**
 * The back bar every §2.5 sub-screen carries. 2.5.1 is the Account destination's root and
 * everything else is pushed on top of it, so each sub-screen needs a way back that is not
 * the rail — the rail's Account item is already "active" on all of them.
 *
 * ON MUI (step 2 of the migration): the kit's `MuiScreenHeader small` look — an h5 title at
 * weight 700 over a body2 subtitle — on the bar this header already was: a strip on
 * surface.1 with a divider under it and a 672px column inside, 16px padding (24px from md).
 *
 * A server component: it renders a Link, never a handler. Every prop below is a plain sx
 * object, a string, or the NextLink client reference.
 */
export function AccountHeader({
  title,
  sub,
  backHref = "/account",
  backLabel = "Account",
  actions,
}: {
  title: string;
  sub?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Box component="header" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "surface.1" }}>
      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        <MuiLink
          component={NextLink}
          href={backHref}
          variant="body2"
          underline="hover"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
        >
          <Icon name="arrow_left" size={14} /> {backLabel}
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
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {sub && (
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {sub}
              </Typography>
            )}
          </Box>
          {actions}
        </Box>
      </Box>
    </Box>
  );
}
