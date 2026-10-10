import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { ClientForm } from "@/components/agent/ClientForm";
import { ClientNotFound } from "@/components/agent/ClientNotFound";
import { RetryState } from "@/components/client/RetryState";
import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import { loadClientRoster } from "@/lib/agent/clients";
import { loadClientForEdit } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.10 — Edit Client. §4.4 Pattern A, and the same form as 3.3.9: §3.3.10's own
 * Screen Inventory entry says "Same as Create Client".
 *
 * THE PREFILL COMES FROM THE OVERVIEW ACCESSOR, which is also where `version` comes from —
 * and the version is why this page cannot be a client component holding stale props. Two
 * tabs open on one client is exactly what `client.version` exists for, and the number has
 * to be read at the moment the form renders.
 *
 * The prototype puts Cancel and Save in the ScreenHeader here where Create puts them at the
 * card's foot. Both sit at the foot in the build: the form is long enough on a phone that a
 * header button scrolls away, and having the same form end two different ways is a
 * difference with nothing behind it.
 */

export const metadata = { title: "Edit client" };

/** The page column: `mx-auto w-full max-w-[860px] px-4 py-6 md:px-8`. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 860,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const [result, roster] = await Promise.all([
    loadClientForEdit(clientId),
    loadClientRoster({ status: "active", tags: [], search: "", page: 1 }),
  ]);

  if (!result.ok) {
    return result.reason === "not-found" ? <ClientNotFound /> : (
      <Box sx={PAGE_SX}>
        <RetryState />
      </Box>
    );
  }

  const c = result.values;

  return (
    <Box sx={PAGE_SX}>
      <MuiLink
        component={NextLink}
        href={`/agent/clients/${clientId}`}
        variant="body2"
        underline="hover"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
      >
        <Icon name="arrow_left" size={13} />
        {c.displayName}
      </MuiLink>

      <Box component="header" sx={{ mb: 2, mt: 1.25 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {CLIENT_COPY.editClientTitle} · {c.displayName}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {CLIENT_COPY.editClientSub}
        </Typography>
      </Box>

      <ClientForm
        mode="edit"
        clientId={clientId}
        expectedVersion={c.version}
        suggestedTags={roster?.facets.map((f) => f.tag) ?? []}
        defaults={c}
      />
    </Box>
  );
}
