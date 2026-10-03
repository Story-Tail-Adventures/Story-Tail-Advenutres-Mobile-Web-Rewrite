import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { ClientForm } from "@/components/agent/ClientForm";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import { loadClientRoster } from "@/lib/agent/clients";

/**
 * Screen 3.3.9 — Create Client. §4.4 Pattern A.
 *
 * THE TAG SUGGESTIONS ARE READ, NOT HARDCODED. The prototype offers five fixed chips
 * (Honeymoon, Family, VIP, Cruise, Returning); `client.tags` is free-form with no
 * vocabulary table, so the useful set is the one this advisor already uses. They come from
 * the same `tag_facets` the roster's filter chips do — one read, one source of truth, and a
 * new tag is still just typed.
 *
 * A failed suggestion read is NOT a failed page. The chips are a convenience; the field
 * below them takes anything, so an empty suggestion list costs a shortcut rather than the
 * screen.
 */

export const metadata = { title: "New client" };

/** The page column: `mx-auto w-full max-w-[860px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 860,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

export default async function NewClientPage() {
  const roster = await loadClientRoster({ status: "active", tags: [], search: "", page: 1 });

  return (
    <Box sx={PAGE_SX}>
      <MuiLink
        component={NextLink}
        href="/agent/clients"
        variant="body2"
        underline="hover"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
      >
        <Icon name="arrow_left" size={13} />
        {CLIENT_COPY.backToRoster}
      </MuiLink>

      <Box component="header" sx={{ mb: 2, mt: 1.25 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {CLIENT_COPY.newClientTitle}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {CLIENT_COPY.newClientSub}
        </Typography>
      </Box>

      <ClientForm mode="create" suggestedTags={roster?.facets.map((f) => f.tag) ?? []} />
    </Box>
  );
}
