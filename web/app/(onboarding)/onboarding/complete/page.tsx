// Screen 2.1.14 Onboarding Complete / "You're All Set" — see docs/Screen-Inventory.md
// §2.1.14 (Pattern G, §4.4) and design/source-prototype/screens/client-auth.jsx
// `C2114_OnboardingComplete` + client-auth-mobile.jsx `M2114_OnboardingComplete`. P1.
//
// The last step, and the moment `platform_user.onboarding_completed_at` becomes non-null so
// the gate in the (client) layout stops routing every sign-in back into the wizard.
//
// It has no form of its own: everything here is either read back from what the earlier
// steps saved, or a way out. The one thing it must get right is telling the truth about
// what was saved — every step was skippable, and the traveler most likely to reach this
// screen having skipped things is exactly the one a fixed "all done!" would mislead.
import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { TRIPS } from "@/content/public/trips";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CompleteActions } from "./CompleteActions";
import { completionChecklist, completionSubtitle } from "./summary";
import { COMPLETE_TEXT, type CompletionSummary } from "./state";

export const metadata: Metadata = {
  title: COMPLETE_TEXT.metaTitle,
  description: COMPLETE_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

const TRIP_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The greeting's type ramp: `.t-headline` (28/700) below md, `.t-display-s` (36/700) from
 * it — the same ramp 2.1.9 keeps for its hero, so the wizard's two bookends match. The
 * artboard draws a stock h3.
 */
const TITLE_SX = {
  mt: 0.5,
  mb: 0.75,
  color: "text.primary",
  fontWeight: 700,
  fontSize: { xs: 28, md: 36 },
  lineHeight: { xs: 1.15, md: 1.1 },
  letterSpacing: { xs: "-0.4px", md: "-0.6px" },
} as const;

export default async function CompletePage() {
  const summary = await currentSummary();
  const checklist = completionChecklist(summary);

  return (
    // NO WIZARD CHROME, which is what the prototype has and is the point of the screen: the
    // rail and the "STEP 06 OF 06" pill are a progress indicator, and there is no longer any
    // progress to indicate. Keeping them would make an arrival read as one more step.
    // `OnboardingShell` is deliberately not used here for that reason — this is the only
    // step that does not, and Back is not offered because the way back is the checklist's
    // own "add it any time" and the dashboard behind it.
    <Box
      component="main"
      sx={{
        display: "flex",
        minHeight: "100dvh",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2.5, md: 4 },
        py: 4,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 640 }}>
        {/* The success badge, as C2114 draws it: a 96px Avatar on the success container. */}
        <Avatar
          aria-hidden="true"
          sx={{
            width: 96,
            height: 96,
            mb: 2,
            bgcolor: "success.container",
            color: "success.main",
            boxShadow: 2,
          }}
        >
          <Icon name="check" size={48} strokeWidth={2.5} />
        </Avatar>

        <Typography
          component="p"
          variant="overline"
          sx={{ display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 }}
        >
          {COMPLETE_TEXT.overline}
        </Typography>
        <Typography component="h1" variant="h3" sx={TITLE_SX}>
          {summary.firstName
            ? COMPLETE_TEXT.title(summary.firstName)
            : COMPLETE_TEXT.titleNoName}
        </Typography>
        <Typography
          component="p"
          variant="body1"
          sx={{ m: 0, color: "text.secondary", fontSize: { xs: 14, md: 16 } }}
        >
          {completionSubtitle(summary)}
        </Typography>

        <Box sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 3 }}>
          <section>
            <Typography component="h2" variant="subtitle1" sx={{ mb: 1, color: "text.primary" }}>
              {COMPLETE_TEXT.checklistHeading}
            </Typography>
            <Box
              component="ul"
              sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.75 }}
            >
              {checklist.map((line) => (
                <Box
                  component="li"
                  key={line.label}
                  sx={{ display: "flex", alignItems: "center", gap: 1.25 }}
                >
                  <Avatar
                    aria-hidden="true"
                    sx={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      bgcolor: line.done ? "success.main" : "surface.3",
                      color: line.done ? "common.white" : "text.secondary",
                    }}
                  >
                    <Icon
                      name={line.done ? "check" : "clock"}
                      size={11}
                      strokeWidth={2.5}
                    />
                  </Avatar>
                  {/* The done/not-done state is in the icon, which is decoration — so it is
                    also in the text, or a screen reader hears four identical-looking
                    items. The skipped labels say "skipped" in words. */}
                  <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                    {line.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </section>

          <Box
            component="ul"
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))" },
              listStyle: "none",
              m: 0,
              p: 0,
            }}
          >
            {/* The first card is the highlighted one, as C2114 draws it: the next thing to
                do, on the primary container. */}
            <NextAction
              highlight
              href={summary.trip ? "/dashboard" : "/explore"}
              icon="plane"
              title={
                summary.trip
                  ? COMPLETE_TEXT.cardTripTitle
                  : COMPLETE_TEXT.cardTripEmptyTitle
              }
              sub={
                summary.trip
                  ? `${summary.trip.title}${summary.trip.startDate ? ` · ${TRIP_DATE.format(new Date(`${summary.trip.startDate}T00:00:00Z`))}` : ""}`
                  : COMPLETE_TEXT.cardTripEmptySub
              }
            />
            <NextAction
              href="/explore"
              icon="search"
              title={COMPLETE_TEXT.cardExploreTitle}
              sub={COMPLETE_TEXT.cardExploreSub(TRIPS.length)}
            />
            {/* Only when there is somewhere for it to go. In-app messaging is Screen 2.6 and
              is not built, so this is a mail client or it is nothing — a card that looks
              like a way to reach Gyasi and is not one is worse than three columns of two. */}
            {env.inquiryEmail && (
              <NextAction
                href={`mailto:${env.inquiryEmail}`}
                icon="message"
                title={COMPLETE_TEXT.cardMessageTitle}
                sub={COMPLETE_TEXT.cardMessageSub}
                external
              />
            )}
          </Box>

          <CompleteActions />
        </Box>
      </Box>
    </Box>
  );
}

/** The clickable face of a next-step card: CardActionArea's own hover and focus ring. */
const ACTION_SX = { height: "100%", p: 1.75 } as const;

function NextAction({
  href,
  icon,
  title,
  sub,
  external = false,
  highlight = false,
}: {
  href: string;
  icon: "plane" | "search" | "message";
  title: string;
  sub: string;
  /** A mailto is not a route; next/link would try to prefetch it. */
  external?: boolean;
  /** Drawn on the primary container rather than outlined (design: C2114's first card). */
  highlight?: boolean;
}) {
  const body = (
    <>
      <Box sx={{ display: "inline-flex", color: highlight ? "inherit" : "primary.main" }}>
        <Icon name={icon} size={20} />
      </Box>
      <Typography component="span" variant="subtitle1" sx={{ display: "block", mt: 1, color: "inherit" }}>
        {title}
      </Typography>
      <Typography component="span" variant="caption" sx={{ display: "block", color: "inherit", opacity: 0.8 }}>
        {sub}
      </Typography>
    </>
  );

  return (
    <Box component="li" sx={{ minWidth: 0 }}>
      <Card
        variant={highlight ? "elevation" : "outlined"}
        elevation={0}
        sx={{
          height: "100%",
          bgcolor: highlight ? "primary.container" : "background.paper",
          color: highlight ? "primary.onContainer" : "text.primary",
        }}
      >
        {/* A ButtonBase over the link, so the card gets MUI's hover wash and the theme's
            focus ring — the same ring the buttons and inputs draw. Server Component: the
            internal link is the `NextLink` client reference, the mailto a plain <a>. */}
        {external ? (
          <CardActionArea component="a" href={href} sx={ACTION_SX}>
            {body}
          </CardActionArea>
        ) : (
          <CardActionArea component={NextLink} href={href} sx={ACTION_SX}>
            {body}
          </CardActionArea>
        )}
      </Card>
    </Box>
  );
}

/**
 * What the wizard actually collected — read back, never assumed.
 *
 * Four reads through the caller's own session and the self-select policies. Each one
 * answers a question the screen would otherwise have to guess: `client.phone` for whether
 * step 2 was filled in, a `travel_preference` row for step 3, a `companion` for step 4, and
 * a `trip` for whether there is anything waiting.
 *
 * `client.phone` rather than the row's existence, because the row always exists — it is
 * created at sign-up. Whether somebody TOLD us anything is a different question from
 * whether they have a record.
 */
async function currentSummary(): Promise<CompletionSummary> {
  const empty: CompletionSummary = {
    firstName: null,
    hasProfile: false,
    hasPreferences: false,
    hasCompanions: false,
    trip: null,
  };
  if (env.authChecksDisabledForLocalDev) return empty;

  const supabase = await createClient();

  const [client, preferences, companions, trips] = await Promise.all([
    supabase
      .from("client")
      .select(
        "first_name, preferred_name, phone, date_of_birth, mailing_address_id",
      )
      .maybeSingle(),
    supabase.from("travel_preference").select("id").maybeSingle(),
    supabase.from("companion").select("id").is("archived_at", null).limit(1),
    supabase
      .from("trip")
      .select("title, start_date")
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(1),
  ]);

  // ALL FOUR, not just the first. A failed `travel_preference` read comes back as no row,
  // which this screen would otherwise render as "how you like to travel — skipped": an
  // infrastructure fault wearing the face of a choice the traveler made, on the one screen
  // whose entire job is not doing that. Logged per table so an operator can tell which.
  for (const [table, result] of [
    ["client", client],
    ["travel_preference", preferences],
    ["companion", companions],
    ["trip", trips],
  ] as const) {
    if (result.error) {
      console.warn("[onboarding] completion read failed", {
        table,
        code: result.error.code,
      });
    }
  }
  if (client.error) return empty;

  const row = client.data;
  // `handle_new_user()` writes the literal 'New' when a sign-up carried no name claims —
  // Apple sends none after the first authorization. "That's everything, New." is worse than
  // no name at all, so the placeholder counts as absent. Same rule as 2.1.9.
  const name = row?.preferred_name?.trim() || row?.first_name?.trim();
  const trip = trips.data?.[0];

  return {
    firstName: !name || name === "New" ? null : name,
    hasProfile: Boolean(
      row?.phone || row?.date_of_birth || row?.mailing_address_id,
    ),
    hasPreferences: Boolean(preferences.data),
    hasCompanions: (companions.data?.length ?? 0) > 0,
    trip: trip ? { title: trip.title, startDate: trip.start_date ?? "" } : null,
  };
}
