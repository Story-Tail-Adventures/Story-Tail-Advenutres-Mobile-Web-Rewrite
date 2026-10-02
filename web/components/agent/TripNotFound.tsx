import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY } from "@/lib/agent/content";

/**
 * What §3.4.2 renders for a trip id that is not this advisor's, or does not exist.
 *
 * NOT `ErrorState`, which is what this replaced. Its copy — "Something went wrong on our
 * side, not yours. Trying again usually sorts it." — is false on all three counts for a trip
 * that simply is not there, and with no `reset` prop its primary action is "Back to your
 * trips" pointing at `/dashboard`: the traveler route, which the role gate bounces an agent
 * straight back out of.
 *
 * NOT `notFound()` EITHER, and that is a deliberate trade rather than an oversight. A
 * `(agent)/not-found.tsx` boundary was built and works, but the document it renders never
 * gets `.scheme-dark`: the root layout's ThemeScript is an inline `<script>`, and on Next's
 * not-found path the layout is re-rendered on the client, where React does not execute
 * script tags ("Encountered a script tag while rendering React component"). The whole page,
 * rail included, comes out light while the rest of the app is dark. Reproduced in a
 * production build, so it is not a dev artifact. Rendering here instead is an ordinary
 * server render, so the shell and the scheme are simply correct.
 *
 * The cost is the HTTP status: this answers 200 where a 404 would be more honest. On an
 * authenticated internal surface nothing consumes it — no crawler, no client code branches
 * on it — and a permanently mis-themed page is the worse defect of the two. If the framework
 * path improves, `notFound()` plus a boundary is the better answer and this can go.
 *
 * ONE SENTENCE FOR BOTH CAUSES, because the accessor deliberately cannot tell "deleted" from
 * "another advisor's" — one answer for both is what stops trip ids being enumerated. Saying
 * more here than the database will say is how that guarantee gets talked away.
 */

/** The legacy `.btn` box on an MUI Button: 40px tall, 24px sides, 8px icon gap. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

export function TripNotFound() {
  return (
    <Box
      sx={{
        mx: "auto",
        width: "100%",
        maxWidth: 600,
        px: { xs: 2, md: 4 },
        py: 8,
        textAlign: "center",
      }}
    >
      <Avatar
        aria-hidden="true"
        sx={{ mx: "auto", mb: 1.5, width: 56, height: 56, bgcolor: "surface.3", color: "text.secondary" }}
      >
        <Icon name="briefcase" size={26} />
      </Avatar>
      <Typography component="h1" variant="h5">
        {AGENT_COPY.tripNotFoundTitle}
      </Typography>
      <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
        {AGENT_COPY.tripNotFoundBody}
      </Typography>
      <MuiButton
        component={NextLink}
        href="/agent"
        variant="outlined"
        color="secondary"
        sx={{ ...BTN, mt: 2.5 }}
      >
        {AGENT_COPY.tripNotFoundAction}
      </MuiButton>
    </Box>
  );
}
