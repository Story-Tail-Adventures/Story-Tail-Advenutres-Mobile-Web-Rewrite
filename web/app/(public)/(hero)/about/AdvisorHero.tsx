import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Avatar } from "@/components/public/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ADVISOR } from "@/content/public/proof";
import { MD_TO_WEB, UP_MD, UP_WEB } from "@/lib/mui/sx";

interface AdvisorHeroProps {
  overline: string;
  title: string;
  /** Gold script tail of the headline ("Gyasi."). */
  script: string;
  lead: string;
  primary: { label: string; href: string };
  /** Guest inquiry — rendered as a plain anchor (mailto or the gate). */
  secondary: { label: string; href: string };
}

/** Tablet only — the old `md:max-web:` prefix. */

/** The legacy .btn-lg box on MUI's large button. */
const LARGE = { minHeight: 48, px: "28px" } as const;

/** The artboard's glass button, on the scheme-independent `--hero-*` whites (public.css). */
const GLASS = {
  ...LARGE,
  color: "var(--hero-fg)",
  borderColor: "var(--hero-glass-border)",
  bgcolor: "var(--hero-glass-bg)",
  backdropFilter: "blur(6px)",
  "&:hover": { borderColor: "var(--hero-glass-border)", bgcolor: "var(--hero-glass-bg-hover)" },
} as const;

/**
 * The hero ramp public.css gave `.t-hero-l` (32 / 40 / 45px), on MUI's h2 with the artboard's
 * 700 weight. Sizes are the current web layout's and stay; only the face moves to MUI.
 */
const HERO_TITLE = {
  color: "common.white",
  fontWeight: 700,
  fontSize: 32,
  lineHeight: 1.05,
  letterSpacing: "-0.6px",
  [UP_MD]: { fontSize: 40, letterSpacing: "-0.8px" },
  [UP_WEB]: { fontSize: 45, letterSpacing: "-1px" },
} as const;

/** `.t-hero-script-xl`: the script tail scales with the headline (1.375 / 1.5 / 1.6em). */
const HERO_SCRIPT = {
  color: "brandSource.gold",
  fontSize: "1.375em",
  lineHeight: 1,
  [UP_MD]: { fontSize: "1.5em" },
  [UP_WEB]: { fontSize: "1.6em" },
} as const;

/** A white ring around the portrait, as the artboard frames it (inside the 200px box). */
const PORTRAIT_RING = { border: "4px solid var(--hero-glass-border)" } as const;

/**
 * Screen 2.0.11 hero (design: C2011 / M2011). Fixed brand gradient (`.hero-advisor`,
 * scheme-independent, public.css) with the copy column on the left and Gyasi's portrait on
 * the right. The portrait is the initials avatar until a real photograph exists — never a
 * stock photo. Below `md` the artboard drops the CTAs (the sticky bar carries them) and tucks
 * the round portrait into the bottom-right corner.
 *
 * `.hero-advisor` and `.on-photo` stay on the section as hooks: the first paints the
 * gradient, the second keeps the on-photo focus ring.
 */
export function AdvisorHero({ overline, title, script, lead, primary, secondary }: AdvisorHeroProps) {
  return (
    <Box component="section" className="hero-advisor on-photo" sx={{ position: "relative", overflow: "hidden" }}>
      <Box
        sx={{
          display: "grid",
          minHeight: 380,
          [UP_MD]: { gridTemplateColumns: "1.3fr 1fr", minHeight: 420 },
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            color: "common.white",
            px: 2.25,
            pt: 10,
            pb: 27.5,
            [MD_TO_WEB]: { px: 4 },
            [UP_MD]: { py: 6.5 },
            [UP_WEB]: { px: 7 },
          }}
        >
          <Typography
            variant="overline"
            component="p"
            sx={{ display: "block", mb: 1.25, color: "brandSource.gold", fontWeight: 600, lineHeight: 1.3 }}
          >
            {overline}
          </Typography>
          <Typography variant="h2" component="h1" sx={HERO_TITLE}>
            {title}{" "}
            <Typography variant="script" component="span" sx={HERO_SCRIPT}>
              {script}
            </Typography>
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mt: 0.75,
              maxWidth: 540,
              color: "var(--hero-fg-muted)",
              fontSize: 13,
              lineHeight: 1.45,
              [UP_MD]: { mt: 1.75, fontSize: 16, lineHeight: 1.5 },
            }}
          >
            {lead}
          </Typography>
          <Stack
            direction="row"
            useFlexGap
            sx={{ mt: 2.75, display: { xs: "none", md: "flex" }, flexWrap: "wrap", gap: 1.25 }}
          >
            <MuiButton component={NextLink} href={primary.href} variant="contained" color="brand" size="large" sx={LARGE}>
              {primary.label}
            </MuiButton>
            <MuiButton
              component="a"
              href={secondary.href}
              variant="outlined"
              size="large"
              startIcon={<Icon name="message" size={14} />}
              sx={GLASS}
            >
              {secondary.label}
            </MuiButton>
          </Stack>
        </Box>

        {/* Portrait column from `md` up. */}
        <Box
          sx={{
            position: "relative",
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            justifyContent: "center",
            p: 4,
          }}
        >
          <Avatar
            initials={ADVISOR.initials}
            tone="brand"
            size={200}
            label={ADVISOR.name}
            sx={{ ...PORTRAIT_RING, boxShadow: 3 }}
          />
        </Box>
      </Box>

      {/* Mobile portrait, bottom-right, as on the M2011 artboard. */}
      <Box aria-hidden="true" sx={{ position: "absolute", right: -10, bottom: -10, display: { md: "none" } }}>
        <Avatar initials={ADVISOR.initials} tone="brand" size={200} sx={PORTRAIT_RING} />
      </Box>
    </Box>
  );
}
