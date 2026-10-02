import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { TemplateGrid } from "@/components/agent/TemplateGrid";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { TEMPLATE_COPY } from "@/lib/agent/content";
import { loadTemplates } from "@/lib/agent/templates";

/**
 * Screen 3.4.13 — Trip Template Library.
 *
 * NOT ON THE NAV RAIL. §6.4's amendment settled the prototype's seven entries as final and
 * `nav.ts` records that Templates and Settings stay off it deliberately. The Screen
 * Inventory entry lists nav "Templates" among the entry points, and that is the one thing
 * here it does not get: the reachable doors are the trips roster's header link, the
 * builder's "Save as template", and §3.4.3's "start from a template". Three real doors beat
 * an eighth rail entry that §6.4 already decided against.
 *
 * A SERVER COMPONENT with one client island. The island holds only dialog state — there is
 * no filter, no pagination and no selection here, because a library of patterns is a
 * handful of cards and inventing a paginator for six of them is the control §6.4's
 * amendment argues against.
 */

export const metadata = { title: "Trip templates" };

/** The legacy .btn-sm box (32px, 16px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export default async function AgentTemplatesPage() {
  const library = await loadTemplates();

  if (!library) {
    // `RetryState`, not a bare `ErrorState`: that one falls back to a "Back to your trips"
    // link pointing at /dashboard, which is a TRAVELER route. Every agent page that got
    // this wrong sent an advisor to the wrong app.
    return <RetryState />;
  }

  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 1024, px: 2, pb: 8 }}>
      <Box
        component="header"
        sx={{
          mt: 2.5,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            {TEMPLATE_COPY.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {TEMPLATE_COPY.sub}
          </Typography>
        </Box>
        <MuiButton
          component={NextLink}
          href="/agent/trips"
          variant="outlined"
          size="small"
          sx={BTN_SM}
        >
          {/* Back to where templates are made and used. The prototype's "New template" CTA
              is NOT here: a template is saved FROM a trip, so the button belongs on the
              trip, and one here would open a form with nothing to snapshot. */}
          All trips
        </MuiButton>
      </Box>

      {library.rows.length === 0 ? (
        <Box sx={{ mt: 3 }}>
          <EmptyState title={TEMPLATE_COPY.emptyTitle} body={TEMPLATE_COPY.emptyBody} />
        </Box>
      ) : (
        <TemplateGrid rows={library.rows} />
      )}
    </Box>
  );
}
