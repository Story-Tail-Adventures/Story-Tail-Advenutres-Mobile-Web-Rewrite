"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { ErrorState } from "@/components/client/states";

/**
 * The root error boundary.
 *
 * There was none before §2.2, and the gap had teeth: a Next error boundary does NOT catch
 * errors thrown by its own segment's layout, only by the segments below it. So an
 * unguarded `supabase.auth.getUser()` in `(client)/layout.tsx` — a Supabase outage, a
 * cold-start timeout — produced Next's own unstyled error page, which is a white screen
 * with a stack trace on it. Screen Inventory §5 forbids exactly that: "never expose stack
 * traces".
 *
 * A route-level `error.tsx` inside (client) would not have helped for the same reason.
 * This one, at the root, is above every layout that can throw.
 *
 * `global-error.tsx` is deliberately NOT added alongside it. That one replaces the entire
 * document including <html>, so it cannot use the app's fonts or theme script and would
 * render unstyled — and it only fires for errors in the ROOT layout, which does nothing
 * but set metadata and render a theme script.
 *
 * ON MUI (step 2 of the migration): a Box on the scheme's background with the reference
 * token drawn in sx. `client-surface` stays as a class: web/styles/client.css hangs the
 * focus ring and the reduced-motion rule off it.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The digest is the only safe thing to surface: it correlates with the server log without
  // carrying the message, which may name a table or quote a row.
  return (
    <Box className="client-surface" sx={SURFACE_SX}>
      <ErrorState reset={reset} />
      {error.digest && (
        <Typography component="p" variant="body2" sx={{ mt: 2, textAlign: "center", color: "text.secondary" }}>
          Reference{" "}
          <Box component="span" sx={KBD_SX}>
            {error.digest}
          </Box>
        </Typography>
      )}
    </Box>
  );
}

/** The legacy `.client-surface.p-4`: the whole viewport on the scheme's background. */
const SURFACE_SX = {
  minHeight: "100dvh",
  p: 2,
  bgcolor: "background.default",
  color: "text.primary",
} as const;

/** The legacy `.kbd` token: JetBrains Mono at caption size on surface.3 with a hairline. */
const KBD_SX = {
  typography: "caption",
  fontFamily: "mono",
  fontWeight: 500,
  lineHeight: 1,
  px: 0.75,
  py: 0.375,
  borderRadius: 1,
  bgcolor: "surface.3",
  color: "text.secondary",
  border: 1,
  borderColor: "divider",
} as const;
