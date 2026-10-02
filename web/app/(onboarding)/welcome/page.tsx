// Screen 2.1.9 Welcome / First Login — see docs/Screen-Inventory.md §2.1.9 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth.jsx `C219_Welcome` +
// client-auth-mobile.jsx `M219_Welcome`. P1.
//
// The cover page of the wizard and the first authenticated screen a new traveler sees. It
// collects nothing; its only write is "Skip the tour", which ends the wizard.
import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { Photo } from "@/components/public/Photo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { env } from "@/lib/env";
import { DOWN_MD, UP_MD } from "@/lib/mui/sx";
import { createClient } from "@/lib/supabase/server";
import { WelcomeActions } from "./WelcomeActions";
import { WELCOME_CARDS, WELCOME_TEXT } from "./state";

export const metadata: Metadata = {
  title: WELCOME_TEXT.metaTitle,
  description: WELCOME_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

/**
 * The hero scrim. C219 writes it as
 * `linear-gradient(180deg, rgba(122,26,31,0.4), rgba(13,33,55,0.8))` — which is exactly the
 * brand burgundy at 40% into the brand navy at 80%, so it reads the theme's own brand-source
 * variables rather than two hex literals. Scheme-independent on purpose: white copy on a
 * photo stays white in both schemes, and the source colours live on `:root` only.
 */
const SCRIM_SX = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--mui-palette-brandSource-burgundy) 40%, transparent), color-mix(in srgb, var(--mui-palette-brandSource-navy) 80%, transparent))",
} as const;

/**
 * The greeting's type ramp: `.t-headline` (28/700) below md, `.t-display-s` (36/700) from
 * it. The artboard draws a stock h3; the band it sits in is 260px tall on a phone, which a
 * 48px heading that wraps to three lines does not fit, so the ramp this page already had
 * stays — the same call HeroBleed makes for the public heroes.
 */
const HERO_TITLE_SX = {
  my: 0.5,
  color: "common.white",
  fontWeight: 700,
  fontSize: { xs: 28, md: 36 },
  lineHeight: { xs: 1.15, md: 1.1 },
  letterSpacing: { xs: "-0.4px", md: "-0.6px" },
} as const;

export default async function WelcomePage() {
  const firstName = await greetableFirstName();

  return (
    // <main>: the (onboarding) layout supplies no landmark, and every other step has one
    // (OnboardingShell, the complete page).
    <Box component="main" sx={{ display: "flex", minHeight: "100dvh", flexDirection: "column" }}>
      {/* HERO. Taller on mobile than on desktop — the ramp inverts, which is why this is
          written out rather than reusing `.hero-compact` (220 → 280, the wrong way). */}
      <Box sx={{ position: "relative", height: { xs: 260, md: 200 }, flexShrink: 0, overflow: "hidden" }}>
        <Photo
          image="overwater"
          fill
          sizes="100vw"
          preload
          // Decorative: the heading beside it carries the meaning, so announcing the photo
          // would just be noise before the greeting.
          alt=""
        />
        <Box aria-hidden="true" sx={SCRIM_SX} />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            px: { xs: 2.5, md: 6 },
            py: { xs: 2.5, md: 4 },
            color: "common.white",
          }}
        >
          <Typography
            component="p"
            variant="overline"
            sx={{ display: "block", color: "brandSource.gold", fontWeight: 600, lineHeight: 1.3 }}
          >
            {WELCOME_TEXT.overline}
          </Typography>
          <Typography component="h1" variant="h3" sx={HERO_TITLE_SX}>
            {firstName ? WELCOME_TEXT.title(firstName) : WELCOME_TEXT.titleNoName}
          </Typography>
          <Typography
            component="p"
            variant="body2"
            sx={{
              m: 0,
              color: "common.white",
              opacity: 0.9,
              fontStyle: "italic",
              fontSize: { xs: 13, md: 14 },
              lineHeight: { xs: 1.45, md: 1.5 },
            }}
          >
            {WELCOME_TEXT.sub}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: { xs: 2.5, md: 3 },
          px: { xs: 2.5, md: 6 },
          py: { xs: 2.5, md: 3 },
        }}
      >
        <Typography component="h2" variant="h5" sx={{ color: "text.primary" }}>
          {WELCOME_TEXT.sectionHeading}
        </Typography>

        {/* Five cards from `md`, four below it: M219 drops "Explore on your time", and it
            is the least true of the five today anyway — self-guided search is Phase 2. */}
        <Box
          component="ul"
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { md: "repeat(3, 1fr)" },
            listStyle: "none",
            m: 0,
            p: 0,
          }}
        >
          {WELCOME_CARDS.map((card) => (
            <Box
              component="li"
              key={card.title}
              // Hidden BELOW md rather than shown from it: the result is the same in a
              // browser, and a max-width rule is one jsdom never applies, so the card stays
              // a list item in the render test.
              sx={card.desktopOnly ? { [DOWN_MD]: { display: "none" } } : undefined}
            >
              <WelcomeCard icon={card.icon} title={card.title} body={card.body} />
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: "auto" }}>
          <WelcomeActions />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * One of the "what your portal will do" cards (design: C219's Card / CardContent / rounded
 * Avatar). Icon beside the text below `md` — the mobile artboard's row — and stacked above
 * it from `md`, which is what the desktop artboard draws.
 */
function WelcomeCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          [UP_MD]: { display: "block" },
          "&:last-child": { pb: 2 },
        }}
      >
        <Avatar
          variant="rounded"
          aria-hidden="true"
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            bgcolor: "primary.container",
            color: "primary.onContainer",
          }}
        >
          <Icon name={icon} size={18} />
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" variant="subtitle1" sx={{ mt: { md: 1 }, color: "text.primary" }}>
            {title}
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
            {body}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

/**
 * The name to greet them by, or null.
 *
 * `handle_new_user()` falls back to the literal 'New' when a sign-up carried no name at
 * all — a social provider that sends no name claims, which Apple does on every
 * authorization after the first. Greeting somebody as "New" is worse than greeting them as
 * nobody in particular, so the placeholder is treated as absent.
 *
 * Prefers `preferred_name`: if a traveler has told Gyasi they go by something, this is the
 * screen that should use it.
 */
async function greetableFirstName(): Promise<string | null> {
  if (env.authChecksDisabledForLocalDev) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("client")
    .select("first_name, preferred_name")
    .maybeSingle();

  const name = data?.preferred_name?.trim() || data?.first_name?.trim();
  if (!name || name === "New") return null;
  return name;
}
