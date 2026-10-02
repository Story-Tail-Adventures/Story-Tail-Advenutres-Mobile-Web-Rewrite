import MuiAlert from "@mui/material/Alert";
import MuiButton from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { DismissibleBanner } from "./DismissibleBanner";
import { SignedOutOnly } from "./SignedOutOnly";

/** The legacy .btn-sm box on MUI's small button. */
const SMALL_BUTTON = { minHeight: 32, px: 2 } as const;

/**
 * "Sign in or create an account to save…" band on the public search pages (design: C203;
 * Screen Inventory §4.4: top banner with dismiss on tablet/web, sticky strip on mobile —
 * the mobile strip is the page's StickyCta, so this renders from `md` only).
 *
 * The artboard draws it as an MUI Alert (severity warning, info glyph, the two buttons in
 * the action slot), and so does this. `role="note"` rather than the Alert's default
 * `role="alert"`: a live region would read the whole band aloud on every page load, and
 * the band is a standing offer, not an event. The band keeps the public column's width and
 * gutters, as it did.
 *
 * Two reasons it can be absent: the visitor dismissed it (DismissibleBanner) or they are
 * already signed in (SignedOutOnly). The `md` breakpoint stays on DismissibleBanner rather
 * than moving out to the SignedOutOnly wrapper — see that file for why a display rule
 * there would quietly defeat the gate.
 */
export function SigninBanner({ next }: { next: string }) {
  return (
    <SignedOutOnly>
      <DismissibleBanner storageKey="sta-public-banner" sx={{ display: { xs: "none", md: "block" } }}>
        <MuiAlert
          severity="warning"
          role="note"
          icon={<Icon name="info" size={16} />}
          action={
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <MuiButton
                component={NextLink}
                href={`/login?next=${encodeURIComponent(next)}`}
                variant="text"
                color="inherit"
                size="small"
                sx={SMALL_BUTTON}
              >
                Sign in
              </MuiButton>
              <MuiButton component={NextLink} href="/join" variant="contained" size="small" sx={SMALL_BUTTON}>
                Create account
              </MuiButton>
            </Stack>
          }
          sx={{
            width: "100%",
            maxWidth: "calc(1280px + 2 * var(--gutter))",
            mx: "auto",
            px: "var(--gutter)",
            py: "14px",
            borderRadius: 0,
            borderBottom: 1,
            borderColor: "divider",
            alignItems: "center",
            "& .MuiAlert-icon": { py: 0, mr: 1.25 },
            "& .MuiAlert-message": { py: 0 },
            "& .MuiAlert-action": { py: 0, pl: 1.25, mr: 0, alignItems: "center" },
          }}
        >
          <Typography variant="body2">
            <b>Sign in or create an account</b> to save searches, favorite trips, and request a real proposal.
          </Typography>
        </MuiAlert>
      </DismissibleBanner>
    </SignedOutOnly>
  );
}
