// Screen 2.0.6 Sign-up Gate / Quote Request Prompt — see docs/Screen-Inventory.md §2.0.6
// (Pattern J, §4.4) and design/source-prototype/screens/client-public.jsx (C206_SignUpGate)
// + client-public-mobile.jsx (M206_SignUpGate). P2.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { Icon } from "@/components/ui/Icon";
import { findTrip } from "@/content/public/trips";
import { env } from "@/lib/env";
import { staImg } from "@/lib/images";
import { UP_MD } from "@/lib/mui/sx";
import { inquiryHref } from "@/lib/public/inquiry";
import { isJoinIntent, loginHref } from "@/lib/public/links";
import { safeNext } from "@/lib/safe-next";
import { single, type SearchParams } from "@/lib/search-params";
import { JoinForm } from "./JoinForm";
import { JOIN_TEXT, joinCopy } from "./state";

const PATH = "/join";

export const metadata: Metadata = {
  title: JOIN_TEXT.metaTitle,
  description: JOIN_TEXT.metaDescription,
  // A gate is not a landing page: crawlers may follow the sign-in / legal links but
  // should not index the form itself (fidelity spec §5.8).
  robots: { index: false, follow: true },
  alternates: { canonical: PATH },
  openGraph: {
    title: JOIN_TEXT.metaTitle,
    description: JOIN_TEXT.metaDescription,
    url: PATH,
    images: [{ url: staImg("turks", 1200, 630), width: 1200, height: 630 }],
  },
};

/**
 * The gate's backdrop (artboard: a primary glow over the page background). The gradient is
 * drawn from the theme's CSS variables because a gradient is not one palette colour; both
 * switch with `.scheme-dark`. Below `md` the card is the whole screen (M206); from `md` the
 * backdrop centres it (C206).
 */
const BACKDROP = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  alignItems: { md: "center" },
  justifyContent: { md: "center" },
  p: { md: 4 },
  background:
    "radial-gradient(circle at 50% 25%, rgba(var(--mui-palette-primary-mainChannel) / 0.18), transparent 60%), var(--mui-palette-background-default)",
} as const;

/**
 * Below `md` a plain full-height column with the mobile gutters; from `md` the Pattern J card
 * (C206: 520 wide, 28 padding, elevation 4 on surface-1).
 */
const GATE_CARD = {
  display: "flex",
  width: "100%",
  flex: 1,
  flexDirection: "column",
  px: 2.25,
  pt: 2.25,
  pb: 2.75,
  bgcolor: "transparent",
  borderRadius: 0,
  [UP_MD]: {
    maxWidth: 520,
    flex: "none",
    p: 3.5,
    bgcolor: "surface.1",
    boxShadow: 4,
    borderRadius: 1,
  },
} as const;

const OVERLINE = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/** The headline's 24 / 26 / 28 ramp on MUI's h4. */
const TITLE = { fontWeight: 700, fontSize: { xs: 24, md: 26, web: 28 } } as const;

/**
 * Everything in the URL is untrusted. `intent` is an allowlist, `trip` is looked up in
 * the curated catalog and only the catalog NAME is ever rendered (never the raw
 * parameter, so nothing a visitor typed can appear in the headline), and `next` goes
 * through `safeNext` before it reaches the form or the sign-in link.
 *
 * Signed-in visitors never see this page: web/proxy.ts sends them to /dashboard.
 */
export default async function JoinPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const rawIntent = single(params.intent);
  const intent = isJoinIntent(rawIntent) ? rawIntent : undefined;

  const rawTrip = single(params.trip);
  const trip = rawTrip ? findTrip(rawTrip) : undefined;

  const requestedNext = safeNext(single(params.next), "");
  const next = requestedNext || "/dashboard";

  const copy = joinCopy(intent, trip?.name);
  const signInHref = loginHref(requestedNext || undefined);
  const emailHref = inquiryHref({
    source: "join",
    trip: trip ? { slug: trip.slug, name: trip.name } : undefined,
  });

  return (
    <Box sx={BACKDROP}>
      <Paper elevation={0} sx={GATE_CARD}>
        <Box component="header">
          <Typography component="p" variant="overline" sx={OVERLINE}>
            {copy.overline}
          </Typography>
          <Typography component="h1" variant="h4" sx={{ ...TITLE, mt: 0.5, mb: { xs: 0.5, md: 0.75 } }}>
            {copy.title}
          </Typography>
          <Typography variant="body2" sx={{ mb: { xs: 1.75, md: 2 }, color: "text.secondary" }}>
            {copy.body}
          </Typography>
        </Box>

        <Box
          component="ul"
          sx={{
            listStyle: "none",
            m: 0,
            p: 0,
            mb: 1.75,
            display: "flex",
            flexDirection: "column",
            gap: { xs: 0.75, md: 1 },
          }}
        >
          {JOIN_TEXT.bullets.map((bullet) => (
            <Typography
              key={bullet}
              component="li"
              variant="body2"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, md: 1.25 },
                fontWeight: 500,
                color: "text.primary",
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "success.main" }}>
                <Icon name="check" size={14} strokeWidth={2.5} />
              </Box>
              {bullet}
            </Typography>
          ))}
        </Box>

        <JoinForm
          intent={intent}
          trip={trip?.slug}
          next={next}
          googleEnabled={env.googleAuthEnabled}
          appleEnabled={env.appleAuthEnabled}
          signInHref={signInHref}
          emailHref={emailHref}
        />
      </Paper>
    </Box>
  );
}
