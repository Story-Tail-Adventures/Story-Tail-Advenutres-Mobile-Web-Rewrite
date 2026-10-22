// Screen 2.0.12 Message Gyasi (no account) — see docs/Screen-Inventory.md §2.0.12 (Pattern J,
// like 2.0.6's /join) and BRD §6.5 (2026-10-21). P2. No artboard: the card and backdrop are
// 2.0.6's, so the two gates read as one family.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { findTrip } from "@/content/public/trips";
import type { Topic } from "@/content/public/types";
import { UP_MD } from "@/lib/mui/sx";
import { isInquirySource, TOPIC_LABEL } from "@/lib/public/inquiry";
import { joinHref, tripHref } from "@/lib/public/links";
import { single, type SearchParams } from "@/lib/search-params";
import { MessageForm } from "./MessageForm";
import { MESSAGE_TEXT } from "./state";

const PATH = "/message";

export const metadata: Metadata = {
  title: MESSAGE_TEXT.metaTitle,
  description: MESSAGE_TEXT.metaDescription,
  // A form, not a landing page (the same call /join makes).
  robots: { index: false, follow: true },
  alternates: { canonical: PATH },
};

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

const CARD = {
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
const TITLE = { fontWeight: 700, fontSize: { xs: 24, md: 26, web: 28 } } as const;

const TOPICS: readonly Topic[] = ["caribbean", "cruises", "honeymoons"];

/**
 * When the form was drawn. A server component renders once per request, so reading the clock
 * here is the point rather than an accident: `lead-message` drops a send made under three
 * seconds after it, which no person filling the form can manage.
 */
function drawnAt(): number {
  return Date.now();
}

/** A campaign tag from the URL: one short line, or "". The function trims and caps it again. */
function tag(value: string | undefined): string {
  return (value ?? "").replace(/[^\w.\-+ ]/g, "").slice(0, 100);
}

/**
 * Everything in the URL is untrusted. `from` is an allowlist, `trip` is looked up in the
 * curated catalog and only the catalog NAME is rendered, `topic` is an allowlist, and the
 * campaign tags are cut to plain characters. Nothing a visitor typed into a URL appears on
 * the page as text.
 */
export default async function MessagePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const rawFrom = single(params.from);
  const from = isInquirySource(rawFrom) ? rawFrom : "";
  const rawTrip = single(params.trip);
  const trip = rawTrip ? findTrip(rawTrip) : undefined;
  const rawTopic = single(params.topic);
  const topic = !trip && rawTopic && (TOPICS as readonly string[]).includes(rawTopic) ? (rawTopic as Topic) : undefined;
  const aboutLabel = trip ? trip.name : topic ? TOPIC_LABEL[topic] : null;
  const startedAt = drawnAt();

  return (
    <Box sx={BACKDROP}>
      <Paper elevation={0} sx={CARD}>
        <Box component="header">
          <Typography component="p" variant="overline" sx={OVERLINE}>
            {MESSAGE_TEXT.overline}
          </Typography>
          <Typography component="h1" variant="h4" sx={{ ...TITLE, mt: 0.5, mb: { xs: 0.5, md: 0.75 } }}>
            {MESSAGE_TEXT.title}
          </Typography>
          <Typography variant="body2" sx={{ mb: aboutLabel ? 1 : { xs: 1.75, md: 2 }, color: "text.secondary" }}>
            {MESSAGE_TEXT.body}
          </Typography>
          {aboutLabel && (
            <Typography variant="subtitle2" sx={{ mb: { xs: 1.75, md: 2 }, color: "text.primary" }}>
              {MESSAGE_TEXT.aboutPrefix}
              {aboutLabel}
            </Typography>
          )}
        </Box>

        <MessageForm
          from={from}
          trip={trip?.slug ?? ""}
          topic={topic ?? ""}
          utm={{
            source: tag(single(params.utm_source)),
            medium: tag(single(params.utm_medium)),
            campaign: tag(single(params.utm_campaign)),
          }}
          startedAt={startedAt}
          exploreHref={trip ? tripHref(trip.slug) : "/"}
          joinHref={joinHref({ intent: trip ? "quote" : "tour", trip: trip?.slug })}
        />
      </Paper>
    </Box>
  );
}
