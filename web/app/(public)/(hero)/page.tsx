// Screen 2.0.1 App Subdomain Public Landing — see docs/Screen-Inventory.md §2.0.1 (Pattern H,
// §4.4) and design/source-prototype/screens/client-public.jsx (C201_PublicLanding) +
// client-public-mobile.jsx (M201_PublicLanding). P1.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiChip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Container } from "@/components/public/Container";
import { FeatureCard } from "@/components/public/FeatureCard";
import { HeroBleed } from "@/components/public/HeroBleed";
import { ScriptureLine } from "@/components/public/ScriptureLine";
import { Icon } from "@/components/ui/Icon";
import { env } from "@/lib/env";
import { staImg } from "@/lib/images";
import { LANDING, landingJsonLd, serializeJsonLd } from "./content";

export const metadata: Metadata = {
  title: { absolute: LANDING.meta.title },
  description: LANDING.meta.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: LANDING.meta.title,
    description: LANDING.meta.description,
    url: "/",
    images: [{ url: staImg("turks", 1200, 630), width: 1200, height: 630 }],
  },
};

const [firstVerse, secondVerse] = LANDING.scripture;

/** The legacy .btn-lg box on MUI's large button. */
const LARGE = { minHeight: 48, px: "28px" } as const;

/**
 * The artboard's glass button on photography (C201). The whites are the scheme-independent
 * `--hero-*` values from styles/public.css: white stays white on a beach photo in both
 * schemes, so these must not follow the palette.
 */
const GLASS = {
  ...LARGE,
  color: "var(--hero-fg)",
  borderColor: "var(--hero-glass-border)",
  bgcolor: "var(--hero-glass-bg)",
  backdropFilter: "blur(6px)",
  "&:hover": { borderColor: "var(--hero-glass-border)", bgcolor: "var(--hero-glass-bg-hover)" },
} as const;

/** The artboard's glass chip (C201): outlined, on the photo. */
const GLASS_CHIP = {
  color: "var(--hero-fg)",
  borderColor: "var(--hero-chip-border)",
  bgcolor: "var(--hero-chip-bg)",
  "& .MuiChip-icon": { color: "inherit" },
  "&:hover": { bgcolor: "var(--hero-glass-bg-hover)" },
} as const;

/** Off-screen but read aloud — the box MUI's visuallyHidden draws. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(landingJsonLd(env.siteUrl)) }}
      />

      <HeroBleed
        image="turks"
        size="fill"
        scrim="landing"
        align="center"
        contentWidth={660}
        titleClass="t-hero-l"
        overline={LANDING.overline}
        title={LANDING.title}
        script={LANDING.script}
        sub={LANDING.sub}
      >
        {/* CTAs from `md` up — desktop order (C201): Sign in leads. */}
        <Stack
          direction="row"
          useFlexGap
          sx={{ mt: 2.75, display: { xs: "none", md: "flex" }, flexWrap: "wrap", gap: 1.25 }}
        >
          <MuiButton component={NextLink} href="/login" variant="contained" color="brand" size="large" sx={LARGE}>
            {LANDING.cta.signIn}
          </MuiButton>
          <MuiButton component={NextLink} href="/join" variant="outlined" size="large" sx={GLASS}>
            {LANDING.cta.create}
          </MuiButton>
          <MuiButton
            component={NextLink}
            href="/how-it-works"
            variant="text"
            size="large"
            sx={{ ...LARGE, color: "common.white" }}
          >
            {LANDING.cta.tour}
          </MuiButton>
        </Stack>
        {/* CTAs below `md` — the mobile artboard (M201) leads with Create an account, full width. */}
        <Stack sx={{ mt: 3, width: "100%", display: { xs: "flex", md: "none" }, gap: 1 }}>
          <MuiButton component={NextLink} href="/join" variant="contained" color="brand" size="large" fullWidth sx={LARGE}>
            {LANDING.cta.create}
          </MuiButton>
          <MuiButton component={NextLink} href="/login" variant="outlined" size="large" fullWidth sx={GLASS}>
            {LANDING.cta.signIn}
          </MuiButton>
          <MuiButton
            component={NextLink}
            href="/how-it-works"
            variant="text"
            size="small"
            sx={{ minHeight: 32, px: 2, color: "common.white", opacity: 0.85 }}
          >
            {LANDING.cta.tour}
          </MuiButton>
        </Stack>

        {/* Scripture strip — one line on mobile, both from `md`. */}
        <Box
          sx={{
            mt: { xs: 2.25, md: 3 },
            pt: { xs: 1.75, md: 2 },
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            columnGap: 2.25,
            rowGap: 0.75,
            borderTop: "1px solid var(--hero-rule)",
            color: "var(--hero-fg-faint)",
          }}
        >
          <ScriptureLine tone="on-photo" quote={firstVerse.quote} reference={firstVerse.reference} />
          <Box component="span" sx={{ display: { xs: "none", md: "contents" } }}>
            <Box component="span" aria-hidden="true" sx={{ opacity: 0.3 }}>
              ·
            </Box>
            <ScriptureLine tone="on-photo" quote={secondVerse.quote} reference={secondVerse.reference} />
          </Box>
        </Box>

        {/* Glass chips — desktop artboard only; on mobile the menu and footer carry these links. */}
        <Stack
          direction="row"
          useFlexGap
          sx={{ mt: 2.25, display: { xs: "none", md: "flex" }, flexWrap: "wrap", gap: 1.25 }}
        >
          <MuiChip
            component={NextLink}
            href="/explore"
            clickable
            variant="outlined"
            label={LANDING.chips.browse}
            sx={GLASS_CHIP}
          />
          <MuiChip
            component="a"
            href={LANDING.chips.marketing.href}
            target="_blank"
            rel="noopener noreferrer"
            clickable
            variant="outlined"
            icon={<Icon name="external" size={12} />}
            label={
              <>
                {LANDING.chips.marketing.label}
                <Box component="span" sx={VISUALLY_HIDDEN}>
                  (opens in a new tab)
                </Box>
              </>
            }
            sx={GLASS_CHIP}
          />
        </Stack>
      </HeroBleed>

      {/* "What you can do here" — mobile artboard section, kept through tablet as a 3-up grid. */}
      <Box
        component="section"
        aria-labelledby="landing-features"
        sx={{ display: { xs: "block", web: "none" }, bgcolor: "background.default" }}
      >
        <Container size="wide" sx={{ pt: { xs: 3, md: 4 }, pb: { xs: 3.75, md: 4 } }}>
          <Typography
            id="landing-features"
            variant="overline"
            component="h2"
            sx={{ display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 }}
          >
            {LANDING.features.overline}
          </Typography>
          <Box
            sx={{
              mt: 1.25,
              display: { xs: "flex", md: "grid" },
              flexDirection: "column",
              gridTemplateColumns: { md: "repeat(3, 1fr)" },
              gap: 1.25,
            }}
          >
            {LANDING.features.items.map((feature) => (
              <FeatureCard
                key={feature.title}
                layout="row"
                iconSize={36}
                icon={feature.icon}
                title={feature.title}
                body={feature.body}
                titleClass="t-title-s"
              />
            ))}
          </Box>
        </Container>
      </Box>
    </>
  );
}
