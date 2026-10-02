import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiSkeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { signOutAction } from "@/lib/auth/actions";

/**
 * The four cross-cutting states Screen Inventory §5 requires of EVERY screen, as one set
 * of primitives rather than eleven hand-written variants.
 *
 * Four states x eleven screens x two stacks is 88 implementations, and that is exactly how
 * they drift: the loading state on one screen grows a spinner, the error on another forgets
 * the escalation path, and nothing fails. So they are shell infrastructure here, and the
 * Compose equivalent is `Loadable<T>` in the shared module.
 *
 * §5's specific requirements, each of which is load-bearing:
 *   * Loading — "skeleton placeholders that match the screen's layout ... avoid
 *     spinner-on-blank". Hence Skeleton takes a shape, not a size.
 *   * Empty — a branded illustration, a one-line explanation, and a CTA.
 *   * Error — plain language, never a stack trace, a retry, AND a "Message Gyasi"
 *     escalation as the fallback path.
 *   * Unauthorized — "You don't have access to this view" with the right redirect. This one
 *     is not decorative: without it an AGENT who reaches a client route gets zero rows from
 *     RLS and sees the friendly empty state, which reads as "you have no trips" rather than
 *     "this is not your view".
 *
 * Inline error colour is `md.error`, per §5's September 2026 correction — the old guidance
 * naming Tropical Orange for inline errors is dead.
 *
 * ON MUI (step 2 of the migration, the client app PR). The three message states are a Card
 * (elevation 1 on background.paper) holding an Avatar icon tile, an h5, body2 and the legacy
 * .btn box on MUI's Button; the skeleton is MUI's own wave Skeleton. No "use client": the
 * pages that render these are Server Components, so the links are `component={NextLink}`.
 */

/** The legacy .btn box (40px, 24px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** Tailwind's `sr-only`, as sx: present for assistive tech, no box on screen. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** The centred 512px message card every §5 state sits in, 24px below whatever precedes it. */
const STATE_CARD_SX = { mx: "auto", mt: 3, maxWidth: 512, textAlign: "center" } as const;
const STATE_BODY_SX = { p: 3.5, "&:last-child": { pb: 3.5 } } as const;

/** The 56px round icon tile above the title. Callers add the colour pair. */
const TILE_SX = { mx: "auto", mb: 1.5, width: 56, height: 56 } as const;

/**
 * One skeleton block. MUI's wave Skeleton rather than the legacy `.client-skeleton` shimmer;
 * it honours the theme's reduced-motion setting on its own. `className` stays for callers
 * that still size it with utilities; `sx` is how the converted screens size it.
 */
export function Skeleton({ className, sx }: { className?: string; sx?: SxProps<Theme> }) {
  return (
    <MuiSkeleton variant="rounded" animation="wave" className={className} sx={sx} aria-hidden="true" />
  );
}

/** A screen-shaped skeleton: a title, a hero block, and a few cards. */
export function ScreenSkeleton({ hero = true }: { hero?: boolean }) {
  return (
    <Box
      role="status"
      aria-busy="true"
      sx={{ mx: "auto", width: "100%", maxWidth: 1024, p: { xs: 2, md: 3 } }}
    >
      <Box component="span" sx={VISUALLY_HIDDEN}>
        Loading
      </Box>
      <Skeleton sx={{ height: 12, width: 160 }} />
      <Skeleton sx={{ mt: 1.5, height: 28, width: "75%", maxWidth: 448 }} />
      {hero && <Skeleton sx={{ mt: 2.5, height: 224, width: "100%" }} />}
      <Box
        sx={{
          mt: 2,
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        <Skeleton sx={{ height: 96, width: "100%" }} />
        <Skeleton sx={{ height: 96, width: "100%" }} />
      </Box>
    </Box>
  );
}

export function EmptyState({
  icon = "palm",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <Card sx={STATE_CARD_SX}>
      <CardContent sx={STATE_BODY_SX}>
        <Avatar aria-hidden="true" sx={{ ...TILE_SX, bgcolor: "surface.3", color: "text.secondary" }}>
          <Icon name={icon} size={26} />
        </Avatar>
        <Typography component="h2" variant="h5">
          {title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
          {body}
        </Typography>
        {/* A plain anchor for anything that is not an app route. Next's Link does fall
            through to one for a `mailto:` or an absolute URL, but relying on that means the
            escalation CTA works by accident — and this state's whole job is to offer a way
            out, so it should not depend on a fallback. */}
        {action &&
          (action.href.startsWith("/") ? (
            <MuiButton
              component={NextLink}
              href={action.href}
              variant="outlined"
              color="secondary"
              sx={{ ...BTN, mt: 2 }}
            >
              {action.label}
            </MuiButton>
          ) : (
            <MuiButton
              component="a"
              href={action.href}
              variant="outlined"
              color="secondary"
              sx={{ ...BTN, mt: 2 }}
            >
              {action.label}
            </MuiButton>
          ))}
      </CardContent>
    </Card>
  );
}

/**
 * §5: plain language, no stack traces, a retry, and an escalation to a human.
 *
 * `reset` is Next's error-boundary reset. When it is absent — a server-rendered error page
 * rather than a boundary — the retry becomes a plain reload link, because a button that
 * does nothing is worse than no button.
 */
export function ErrorState({
  title = "That didn’t load",
  body = "Something went wrong on our side, not yours. Trying again usually sorts it.",
  reset,
}: {
  title?: string;
  body?: string;
  reset?: () => void;
}) {
  return (
    <Card sx={STATE_CARD_SX}>
      <CardContent sx={STATE_BODY_SX}>
        <Avatar
          aria-hidden="true"
          sx={{ ...TILE_SX, bgcolor: "error.container", color: "error.onContainer" }}
        >
          <Icon name="warning" size={26} />
        </Avatar>
        <Typography component="h2" variant="h5" sx={{ color: "error.main" }}>
          {title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
          {body}
        </Typography>
        <Box
          sx={{
            mt: 2.5,
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: "center",
            justifyContent: { sm: "center" },
            gap: 1,
          }}
        >
          {reset ? (
            <Button type="button" variant="filled" onClick={reset}>
              Try again
            </Button>
          ) : (
            <MuiButton component={NextLink} href="/dashboard" variant="contained" sx={BTN}>
              Back to your trips
            </MuiButton>
          )}
          {/* The escalation path §5 asks for. It is a mailto until §2.6 lands the thread,
              for the same reason §2.0's guest inquiry is a mailto: the alternative is a
              form that goes nowhere. */}
          <MuiButton
            component="a"
            href="mailto:hello@story-tail.com?subject=Something%20went%20wrong"
            variant="outlined"
            sx={BTN}
          >
            <Icon name="message" size={14} /> Message Gyasi
          </MuiButton>
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * §5's permissions state. Reached when a caller is authenticated but this is not their
 * view — in practice an agent landing on a client route.
 *
 * THE ESCAPE SIGNS OUT, and it has to. This used to be a plain `<Link href="/login">`,
 * which was an inescapable loop: the proxy bounces a signed-in caller off every
 * AUTH_ONLY_PREFIX back to `/dashboard` (`web/lib/supabase/middleware.ts`), and
 * `/dashboard` renders this state again. An agent who landed here had no way out and no
 * sign-out control anywhere in the client shell — §2.5.1 Account owns that, and it is not
 * built. Signing out first is what makes `/login` reachable at all.
 */
export function UnauthorizedState({
  redirectLabel = "Sign out and sign in as a traveler",
}: {
  redirectLabel?: string;
}) {
  return (
    <Card sx={STATE_CARD_SX}>
      <CardContent sx={STATE_BODY_SX}>
        <Avatar aria-hidden="true" sx={{ ...TILE_SX, bgcolor: "surface.3", color: "text.secondary" }}>
          <Icon name="shield" size={26} />
        </Avatar>
        <Typography component="h2" variant="h5">
          You don’t have access to this view
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
          This is the traveler’s side of Story-Tail. Your account is set up as an advisor, so
          your work lives somewhere else.
        </Typography>
        {/* A form, not a link: the action clears the session server-side and then redirects,
            which is the only sequence the proxy will let through. */}
        <form action={signOutAction}>
          <MuiButton type="submit" variant="outlined" color="secondary" sx={{ ...BTN, mt: 2 }}>
            {redirectLabel}
          </MuiButton>
        </form>
      </CardContent>
    </Card>
  );
}
