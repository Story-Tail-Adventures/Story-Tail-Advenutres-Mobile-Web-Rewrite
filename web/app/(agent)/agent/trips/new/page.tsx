import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { NewTripForm } from "@/components/agent/NewTripForm";
import { RetryState } from "@/components/client/RetryState";
import { NEW_TRIP_COPY, TRIP_COPY } from "@/lib/agent/content";
import { loadClientRoster } from "@/lib/agent/clients";
import { loadTemplates } from "@/lib/agent/templates";

/**
 * Screen 3.4.3 — Create New Trip.
 *
 * THE WHOLE BOOK IS LOADED ONCE, here, and handed to the picker. `agent_client_roster`
 * pages at 25 by default; this asks for 500 in one read because the control is a
 * `<datalist>` the browser filters locally, and an advisor's book is tens rather than
 * thousands. When that stops being true the accessor already takes `p_search` and this
 * becomes a search-as-you-type without the form changing shape.
 *
 * ARCHIVED CLIENTS ARE NOT OFFERED. §3.3.12 archives a client to take them off the working
 * surfaces; starting a new trip for one would walk straight back past that decision.
 *
 * `?client=` PRE-SELECTS, which is what makes this reachable from §3.3.4's "New trip" and
 * from the client form's "Save & create trip" without the advisor re-picking somebody the
 * previous screen already knew.
 */

export const metadata = { title: "New trip" };

/** The page column: `mx-auto w-full max-w-[760px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 760,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const params = await searchParams;

  // Both reads at once: they are independent, and serialising them would add a round trip
  // to a form that already waits on the whole book.
  const [roster, library] = await Promise.all([
    loadClientRoster({ status: "active", tags: [], search: "", page: 1 }, { pageSize: 500 }),
    loadTemplates(),
  ]);

  if (!roster) {
    return (
      <Box sx={PAGE_SX}>
        <RetryState />
      </Box>
    );
  }

  const clients = roster.rows.map((r) => ({
    id: r.clientId,
    name: r.displayName,
    email: r.email,
  }));

  // A FAILED TEMPLATE READ IS AN EMPTY LIBRARY, not a failed page. The picker renders only
  // when there is something in it, so an unavailable read degrades to the form this screen
  // has always been rather than a RetryState over a field nobody was reaching for.
  const templates = (library?.rows ?? []).map((t) => ({
    templateId: t.templateId,
    name: t.name,
    shapeLabel: t.shapeLabel,
  }));

  return (
    <Box sx={PAGE_SX}>
      <MuiLink
        component={NextLink}
        href="/agent/trips"
        variant="body2"
        underline="hover"
        sx={{ display: "inline-block", mb: 1.5, color: "text.secondary" }}
      >
        ← {TRIP_COPY.title}
      </MuiLink>

      <Box component="header" sx={{ mb: 2.5 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {NEW_TRIP_COPY.title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {NEW_TRIP_COPY.subtitle}
        </Typography>
      </Box>

      <NewTripForm
        clients={clients}
        presetClientId={params.client}
        templates={templates}
      />
    </Box>
  );
}
