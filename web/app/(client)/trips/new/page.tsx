// Screen 2.3.8 Quote Request Form — see docs/Screen-Inventory.md §2.3.8 (Pattern G, §4.4).
// The destination a "Request a quote" CTA resolves to once the visitor is signed in. P2.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { findTrip } from "@/content/public/trips";
import { formatRange } from "@/lib/public/dates";
import { formatMoney } from "@/lib/public/money";
import { SEARCH_TIME_ZONE } from "@/lib/public/search";
import { single, type SearchParams } from "@/lib/search-params";
import { QUOTE } from "./content";
import { QuoteForm } from "./QuoteForm";
import type { QuoteRequestTarget } from "./actions";

export const metadata: Metadata = {
  title: QUOTE.meta.title,
  description: QUOTE.meta.description,
  robots: { index: false, follow: false },
};

/**
 * The page column: 640px wide, 18px sides, 24px top and bottom (32 from md). `client-fill`
 * stays as the shell's CSS hook for a definite height (web/styles/client.css).
 */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 640, px: 2.25, py: { xs: 3, md: 4 } } as const;

/** The legacy .t-label-s overline, in the brand orange, on MUI's overline. */
const OVERLINE_SX = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/** The legacy .t-headline-r ramp (24 / 26 / 28) on MUI's h4 — the same call the join page makes. */
const TITLE_SX = { fontWeight: 700, fontSize: { xs: 24, md: 26, web: 28 } } as const;

/** The legacy .t-label (12/500) on caption, as a block. */
const LABEL_SX = { display: "block", fontWeight: 500, lineHeight: 1.3, color: "text.secondary" } as const;

/** The legacy .t-title-s (15/600) on subtitle1. */
const TITLE_S_SX = { fontWeight: 600, lineHeight: 1.3 } as const;

/** The legacy .btn box (40px, 24px sides) on MUI's Button. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/**
 * EVERYTHING IN THE URL IS UNTRUSTED, and here that matters more than usual: this context
 * survived a round trip through the sign-up gate, so it is data the visitor's browser held
 * and could have edited. It is read defensively and — importantly — it is read for DISPLAY
 * only. The values are re-validated by `quote-request` before anything is written, and the
 * indicative rate is stored in a payload field named for what it is rather than in any money
 * column. See that function's header.
 *
 * A curated trip is resolved from the catalog by slug, so its name and place come from our
 * own content rather than the query. A hotel has no catalog row — hotels are deliberately
 * never stored — so its fields do travel, capped and escaped by React on the way out.
 *
 * ON MUI (step 2 of the migration): the summary is a Card with a definition list inside, the
 * header an overline / h4 / body2 stack, on the column this page already had. Plain sx only,
 * so it stays a Server Component; the form below is the client island.
 */
export default async function NewTripPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const target = readTarget(params);

  if (!target) {
    return (
      <Box className="client-fill" sx={{ ...PAGE_SX, py: 3 }}>
        <Typography component="h1" variant="h4" sx={{ ...TITLE_SX, color: "text.primary" }}>
          {QUOTE.errors.nothing}
        </Typography>
        <MuiButton component={NextLink} href="/explore" variant="contained" sx={{ ...BTN, mt: 2 }}>
          {QUOTE.cancel}
        </MuiButton>
      </Box>
    );
  }

  const dates = target.checkIn && target.checkOut
    ? formatRange(target.checkIn, target.checkOut, SEARCH_TIME_ZONE)
    : null;

  const rate = target.rateCents
    ? formatMoney({ amountCents: target.rateCents, currency: "USD" }, { whole: true })
    : null;

  const descriptors = [
    target.hotelClass ? QUOTE.summary.starClass(target.hotelClass) : null,
    target.propertyType,
    target.place,
  ].filter(Boolean);

  return (
    <Box className="client-fill" sx={PAGE_SX}>
      <Box component="header" sx={{ mb: 2.5 }}>
        <Typography component="p" variant="overline" sx={OVERLINE_SX}>
          {QUOTE.overline}
        </Typography>
        <Typography component="h1" variant="h4" sx={{ ...TITLE_SX, mt: 0.5, mb: 0.75, color: "text.primary" }}>
          {QUOTE.title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
          {QUOTE.body}
        </Typography>
      </Box>

      <Card component="section" aria-label={QUOTE.summary.label} sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
          <Typography component="h2" variant="h5" sx={{ color: "text.primary" }}>
            {target.name}
          </Typography>
          {descriptors.length > 0 && (
            <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
              {descriptors.join(" · ")}
            </Typography>
          )}

          <Box
            component="dl"
            sx={{ m: 0, mt: 1.75, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.75 }}
          >
            <Box>
              <Typography component="dt" variant="caption" sx={LABEL_SX}>
                {QUOTE.summary.dates}
              </Typography>
              <Typography component="dd" variant="subtitle1" sx={{ ...TITLE_S_SX, m: 0, mt: 0.25, color: "text.primary" }}>
                {dates ?? QUOTE.summary.flexibleDates}
              </Typography>
            </Box>
            <Box>
              <Typography component="dt" variant="caption" sx={LABEL_SX}>
                {QUOTE.summary.travelers}
              </Typography>
              <Typography component="dd" variant="subtitle1" sx={{ ...TITLE_S_SX, m: 0, mt: 0.25, color: "text.primary" }}>
                {QUOTE.summary.travelerCount(target.travelers ?? 2)}
              </Typography>
            </Box>
          </Box>

          {rate && (
            <Box sx={{ mt: 1.75, borderTop: 1, borderColor: "divider", pt: 1.5 }}>
              <Typography component="p" variant="caption" sx={LABEL_SX}>
                {QUOTE.summary.indicative}
              </Typography>
              <Typography component="p" variant="subtitle1" sx={{ ...TITLE_S_SX, mt: 0.25, color: "text.primary" }}>
                {rate}
                {/* The legacy .t-fine (11.5/500) on caption. */}
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1, color: "text.secondary" }}
                >
                  {" "}
                  {QUOTE.summary.perNight}
                </Typography>
              </Typography>
              {/* The one line that keeps a public rate from reading as a quote. */}
              <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
                {QUOTE.summary.indicativeNote}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <QuoteForm target={target} initialNote={text(single(params.note), NOTE_PREFILL_MAX) ?? undefined} />
    </Box>
  );
}

/**
 * Cap on the note's starting text. It comes from a topic page's Vibe cell (60 chars plus a
 * short lead-in), and it only seeds a textarea the visitor edits — it is not the target.
 */
const NOTE_PREFILL_MAX = 200;

const KINDS = ["hotel", "cruise", "excursion", "custom"] as const;
const TRIP_TYPES = ["cruise", "all_inclusive", "multi_destination", "group", "custom"] as const;
const SOURCES = ["curated", "serpapi_google_hotels", "track_cruises"] as const;

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function readTarget(params: SearchParams): QuoteRequestTarget | null {
  const kind = pick(single(params.kind), KINDS) ?? "custom";
  const tripType = pick(single(params.tripType), TRIP_TYPES);
  const source = pick(single(params.source), SOURCES);

  // A curated trip is resolved from our own catalog, so nothing a visitor typed reaches the
  // page — the same rule the sign-up gate follows for its headline.
  const slug = single(params.trip);
  const catalog = slug ? findTrip(slug) : undefined;
  if (catalog) {
    return {
      kind,
      tripType,
      source: source ?? "curated",
      name: catalog.name,
      place: catalog.destination.place,
      checkIn: isoDate(single(params.in)),
      checkOut: isoDate(single(params.out)),
      travelers: count(single(params.adults), 1, 20),
      ref: catalog.slug,
    };
  }

  const name = text(single(params.name), 160);
  if (!name) return null;

  return {
    kind,
    tripType,
    source,
    name,
    place: text(single(params.place), 120) ?? undefined,
    checkIn: isoDate(single(params.in)),
    checkOut: isoDate(single(params.out)),
    travelers: count(single(params.adults), 1, 20),
    ref: text(single(params.ref), 220) ?? undefined,
    rateCents: count(single(params.rate), 1, 100_000_00) ?? undefined,
    hotelClass: count(single(params.class), 1, 5) ?? undefined,
    rating: ratingOf(single(params.rating)),
    propertyType: text(single(params.type), 60) ?? undefined,
  };
}

function text(value: string | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || null;
}

function isoDate(value: string | undefined): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? value : undefined;
}

function count(value: string | undefined, min: number, max: number): number | undefined {
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function ratingOf(value: string | undefined): number | undefined {
  const n = value ? Number.parseFloat(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 5) return undefined;
  return Math.round(n * 10) / 10;
}
