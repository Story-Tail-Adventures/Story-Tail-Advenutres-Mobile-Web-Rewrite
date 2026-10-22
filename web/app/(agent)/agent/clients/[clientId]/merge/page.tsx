import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { MfaGate } from "@/components/agent/ClientAccountAdminTab";
import { ClientMergeForm } from "@/components/agent/ClientMergeForm";
import { ClientNotFound } from "@/components/agent/ClientNotFound";
import NextLink from "@/components/mui/NextLink";
import { RetryState } from "@/components/client/RetryState";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { MERGE_COPY as C } from "@/lib/agent/content";
import { loadMergeView } from "@/lib/agent/merge";
import type { MergeView } from "@/lib/agent/mergeView";
import { isUuid } from "@/lib/agent/messageQuery";

/**
 * Screens 3.9.7 / 3.3.11 — Merge duplicate records (A3311_MergeClients). Rulings:
 * docs/Screen-Inventory.md §3.9, "Merge (PR 2), ruled now". Web only.
 *
 * THE RECORD IN THE URL IS THE ONE KEPT. `?with=` names the one merging in, and "Keep this one
 * instead" is simply the other record's own merge page, so the keep choice is never a hidden
 * piece of state that could disagree with what the page shows.
 *
 * TWO STEPS ON ONE ROUTE. Without `?with=` the page asks which record is the duplicate (likely
 * matches from the same book, or a search, `?q=`). With it, the field picker and the confirm
 * step, both in `ClientMergeForm`, the one client island.
 *
 * The whole page waits on aal2 (checked in the database), and the write also needs a second
 * factor from the last 15 minutes, which the Edge Function checks.
 */

export const metadata = { title: "Merge duplicate records" };

const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1140,
  px: { xs: 2, md: 4 },
  py: 3,
} as const;

const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export default async function MergeClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ with?: string | string[]; q?: string | string[] }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const withParam = typeof sp.with === "string" ? sp.with : null;
  const search = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  if (!isUuid(clientId) || (withParam !== null && !isUuid(withParam))) return <ClientNotFound />;

  const result = await loadMergeView(clientId, { otherId: withParam, search: search || null });
  if (!result.ok) {
    return result.reason === "not-found" ? <ClientNotFound /> : (
      <Box sx={PAGE_SX}>
        <RetryState />
      </Box>
    );
  }

  const view = result.view;
  const here = `/agent/clients/${clientId}/merge${withParam ? `?with=${withParam}` : ""}`;

  return (
    <Box sx={PAGE_SX}>
      {view.kind !== "needs-mfa" && (
        <MuiLink
          component={NextLink}
          href={`/agent/clients/${view.kind === "preview" ? view.keep.clientId : view.client.clientId}`}
          variant="body2"
          underline="hover"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
        >
          <Icon name="arrow_left" size={13} />
          {view.kind === "preview" ? view.keep.name : view.client.name}
        </MuiLink>
      )}

      <Box component="header" sx={{ mb: 2, mt: 1.25 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {C.title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary", maxWidth: 720 }}>
          {C.sub}
        </Typography>
      </Box>

      <MergeBody view={view} clientId={clientId} search={search} returnTo={here} />
    </Box>
  );
}

function MergeBody({
  view,
  clientId,
  search,
  returnTo,
}: {
  view: MergeView;
  clientId: string;
  search: string;
  returnTo: string;
}) {
  if (view.kind === "needs-mfa") return <MfaGate hasFactor={view.agentHasFactor} returnTo={returnTo} />;

  if (view.kind === "preview") {
    // Keyed on the pair and both versions, so another pair, or a refresh after a stale answer,
    // starts with fresh picks and a closed dialog.
    const key = `${view.keep.clientId}:${view.retire.clientId}:${view.keep.version}:${view.retire.version}`;
    return <ClientMergeForm key={key} view={view} />;
  }

  if (view.kind === "not-mergeable") {
    return (
      <Card variant="outlined" sx={{ maxWidth: 640 }}>
        <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
          <Typography variant="body2">{C.notMergeable}</Typography>
          <Box sx={{ mt: 1.5 }}>
            <MuiLink component={NextLink} href={`/agent/clients/${clientId}/merge`} variant="body2" underline="hover">
              {C.pickAnother}
            </MuiLink>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box component="section" aria-labelledby="merge-pick-heading" sx={{ maxWidth: 760 }}>
      <Typography id="merge-pick-heading" component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
        {C.pickHeading}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
        {C.pickSub(view.client.name)}
      </Typography>

      <Box
        component="form"
        method="get"
        action={`/agent/clients/${clientId}/merge`}
        role="search"
        sx={{ mt: 1.75, display: "flex", gap: 1, alignItems: "flex-end" }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Field
            id="merge-search"
            name="q"
            type="search"
            label={C.searchLabel}
            placeholder={C.searchPlaceholder}
            defaultValue={search}
            maxLength={100}
          />
        </Box>
        <MuiButton type="submit" variant="outlined" color="primary" sx={{ minHeight: 44, px: "16px" }}>
          {C.searchButton}
        </MuiButton>
      </Box>

      {view.candidates.length === 0 ? (
        <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
          {search ? C.noResults : C.noCandidates}
        </Typography>
      ) : (
        <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, mt: 2, listStyle: "none" }}>
          {view.candidates.map((c) => (
            <Box component="li" key={c.clientId}>
              <Card variant="outlined">
                <CardContent
                  sx={{
                    p: 1.75,
                    "&:last-child": { pb: 1.75 },
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1.5,
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
                      {c.name}
                      {c.email ? ` · ${c.email}` : ""}
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                      {c.reason} · {c.line}
                    </Typography>
                  </Box>
                  {c.archived && <StatusChip kind="cancelled" label={C.archived} />}
                  <MuiButton
                    component={NextLink}
                    href={`/agent/clients/${clientId}/merge?with=${c.clientId}`}
                    variant="outlined"
                    color="secondary"
                    size="small"
                    sx={BTN_SM}
                    aria-label={`${C.choose}: ${c.name}`}
                  >
                    {C.choose}
                  </MuiButton>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
