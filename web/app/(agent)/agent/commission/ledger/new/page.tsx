import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import MuiLink from "@mui/material/Link";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { CommissionLineForm } from "@/components/agent/CommissionLineForm";
import { EmptyState, ErrorState } from "@/components/client/states";
import NextForm from "@/components/mui/NextForm";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { loadAddLineForm, searchTripsForLine } from "@/lib/agent/commission";
import { CREATE_STATUS_OPTIONS, type LineValues } from "@/lib/agent/commissionForm";
import { COMMISSION_COPY } from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.7.4 — Add Commission Entry. §4.4 Pattern A.
 *
 * A PAGE, WHERE THE ARTBOARD DRAWS A 540px MODAL — the precedent §3.4.3 set for New Trip. The
 * modal's first field is "Linked trip · Search trips…", which as a page is a GET search that
 * lands on `?trip=`, and from there the trip is fixed: the supplier picker can fill gross and
 * rate from THAT trip's bookings, which a modal over the ledger had no trip to read from.
 * Trip Detail's cost card links straight to `?trip=`.
 *
 * "For trips booked outside the platform", the artboard's subtitle, is narrower than what this
 * is for — any trip, any supplier line — so the subtitle says what it does instead.
 */

export const metadata = { title: "Add commission line" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A new line starts empty: the supplier fills in what it knows. */
const EMPTY_LINE: LineValues = {
  supplierId: "",
  gross: "",
  rate: "",
  paymentTerms: "after_travel",
  paymentLagDays: "",
  status: "expected",
  inteletravelReference: "",
  notes: "",
};

export default async function AddCommissionLinePage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string | string[]; q?: string | string[] }>;
}) {
  const params = await searchParams;
  // A repeated parameter arrives as an array; `?q=a&q=b` used to 500 on `.trim()`.
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const trip = first(params.trip);
  const q = first(params.q);
  const tripId = trip && UUID.test(trip) ? trip : null;

  const header = (
    <>
      <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />
      <Box component="header" sx={{ mt: 2.5, mb: 2 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {COMMISSION_COPY.addTitle}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {COMMISSION_COPY.addSubtitle}
        </Typography>
      </Box>
    </>
  );

  // ── Step 2: a trip is chosen ────────────────────────────────────────────────
  if (tripId) {
    const result = await loadAddLineForm(tripId);
    if (!result.ok && result.reason === "not-found") {
      return (
        <Box sx={PAGE_SX}>
          {header}
          <EmptyState
            icon="trip"
            title={COMMISSION_COPY.tripNotAvailableTitle}
            body={COMMISSION_COPY.tripNotAvailableBody}
            action={{ label: COMMISSION_COPY.pickTripChange, href: "/agent/commission/ledger/new" }}
          />
        </Box>
      );
    }
    if (!result.ok) return <ErrorState />;
    const { form } = result;

    return (
      <Box sx={PAGE_SX}>
        {header}
        <Typography component="p" variant="body1" sx={{ mb: 1.5 }}>
          <Box component="strong" sx={{ fontWeight: 600 }}>{form.trip.title}</Box>
          {" · "}
          {form.trip.clientName}
          {" · "}
          <MuiLink component={NextLink} href="/agent/commission/ledger/new" underline="hover" variant="body2">
            {COMMISSION_COPY.pickTripChange}
          </MuiLink>
        </Typography>
        <Card sx={{ maxWidth: 720 }}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <CommissionLineForm
              mode={{ kind: "create", tripId: form.trip.tripId, prefill: form.prefill }}
              suppliers={form.suppliers}
              initial={EMPTY_LINE}
              statusOptions={CREATE_STATUS_OPTIONS}
              currency={form.trip.currency}
              cancelHref={`/agent/commission/ledger?trip=${form.trip.tripId}`}
            />
          </CardContent>
        </Card>
      </Box>
    );
  }

  // ── Step 1: pick the trip ──────────────────────────────────────────────────
  const search = (q ?? "").trim();
  const trips = await searchTripsForLine(search);
  if (!trips) return <ErrorState />;

  return (
    <Box sx={PAGE_SX}>
      {header}
      <Card sx={{ maxWidth: 720 }}>
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Typography component="h2" variant="subtitle1" sx={{ m: 0, mb: 1, fontWeight: 600 }}>
            {COMMISSION_COPY.pickTripTitle}
          </Typography>
          {/* A GET form, like every roster filter: the search lives in the URL. */}
          <Box component={NextForm} action="/agent/commission/ledger/new" sx={{ display: "flex", gap: 1, mb: 1.5 }}>
            <Box component="label" htmlFor="pick-trip-q" sx={VISUALLY_HIDDEN}>
              {COMMISSION_COPY.pickTripSearch}
            </Box>
            <OutlinedInput
              id="pick-trip-q"
              type="search"
              name="q"
              defaultValue={search}
              placeholder={COMMISSION_COPY.pickTripPlaceholder}
              size="small"
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Button type="submit" variant="tonal" size="sm">
              {COMMISSION_COPY.pickTripSearch}
            </Button>
          </Box>

          {trips.length === 0 ? (
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {COMMISSION_COPY.pickTripNone}
            </Typography>
          ) : (
            <List disablePadding aria-label={COMMISSION_COPY.pickTripTitle}>
              {trips.map((t) => (
                <ListItemButton
                  key={t.tripId}
                  component={NextLink}
                  href={`/agent/commission/ledger/new?trip=${t.tripId}`}
                  sx={{ borderRadius: 1, display: "block" }}
                >
                  <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 600 }}>
                    {t.title}
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                    {[t.clientName, t.travelLabel, t.statusLabel].filter(Boolean).join(" · ")}
                  </Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
