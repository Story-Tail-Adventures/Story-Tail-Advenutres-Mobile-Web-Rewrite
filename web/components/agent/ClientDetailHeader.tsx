import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Avatar } from "@/components/public/Avatar";
import { ClientArchiveDialog } from "@/components/agent/ClientArchiveDialog";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientOverview } from "@/lib/agent/clientDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.3.2's header card — the gradient band the prototype draws above the tabs.
 *
 * THREE ACTIONS, ALL DISABLED, AND EACH NAMES ITS OWN SECTION. The prototype draws Message,
 * Call and "New trip" as live buttons. Messaging is §3.10, creating a trip is §3.4.3, and
 * neither is built — so they render disabled with their reasons, the treatment §3.4.2's
 * header established for the same three-button row. Call is the exception that is NOT
 * disabled: a `tel:` link needs no section behind it, and a phone number the advisor can
 * tap is the whole point of opening this screen on a phone.
 *
 * THE STATUS PILL IS ONE, NOT TWO. The prototype draws "Active" beside "Trip in motion",
 * which reads as two states of the same thing. `client.status` is the record's lifecycle
 * (active / archived / merged_into); whether a trip is in flight is a count, and it is in
 * the mini-stats where the other counts live.
 *
 * ON MUI (step 2 of the migration, PR 6): a Card header, the band's gradient drawn from the
 * theme's own CSS variables (a Server Component cannot read the palette through a callback,
 * and the two container colours switch with the scheme on their own), MUI Buttons in the
 * legacy `.btn-sm` box, the `StatusChip` for the archived pill, and the artboard's 20px tag
 * chips. The Button primitive keeps a disabled control's tooltip alive.
 */

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** `.chip.h-5.px-2.text-[10.5px]`: the 20px tag chip, as the roster draws it. */
const MINI_CHIP_SX = { height: 20, fontSize: 10.5, "& .MuiChip-label": { px: 1 } } as const;

/**
 * The legacy `bg-gradient-to-br from-primary-container to-secondary-container`, from the
 * theme's CSS variables so both colours follow `.scheme-dark`.
 */
const BAND_SX = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 1.75,
  p: 2.5,
  background:
    "linear-gradient(to bottom right, var(--mui-palette-primary-container), var(--mui-palette-secondary-container))",
} as const;

export function ClientDetailHeader({ client }: { client: ClientOverview }) {
  return (
    <Card component="header">
      <Box sx={BAND_SX}>
        <Avatar initials={client.initials} size={64} tone="brand" />

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
            <Typography component="h1" variant="h5" sx={{ m: 0, color: "primary.onContainer" }}>
              {client.displayName}
            </Typography>
            {client.archived && (
              <StatusChip kind="cancelled" label={CLIENT_COPY.filterArchived} />
            )}
            {client.tags.map((t) => (
              <Chip key={t} size="small" variant="outlined" label={t} sx={MINI_CHIP_SX} />
            ))}
          </Box>

          <Box
            sx={{
              mt: 0.5,
              display: "flex",
              flexWrap: "wrap",
              columnGap: 1.75,
              rowGap: 0.25,
              color: "primary.onContainer",
            }}
          >
            {client.email && (
              <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
                {client.email}
              </Typography>
            )}
            {client.phone && (
              <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
                {client.phone}
              </Typography>
            )}
            {client.addressLine && (
              <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
                {client.addressLine}
              </Typography>
            )}
            <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
              Since {client.sinceLabel}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexShrink: 0, flexWrap: "wrap", gap: 0.75 }}>
          <Button type="button" variant="tonal" size="sm" disabled title={CLIENT_COPY.messageClientDeferred}>
            <Icon name="message" size={12} />
            <Box component="span" sx={VISUALLY_HIDDEN}>{CLIENT_COPY.messageClientDeferred}</Box>
          </Button>
          {/* Not disabled: a tel: link needs no section behind it. */}
          {client.phone ? (
            <MuiButton
              component="a"
              href={`tel:${client.phone.replace(/[^+\d]/g, "")}`}
              variant="outlined"
              color="secondary"
              size="small"
              sx={BTN_SM}
            >
              <Icon name="phone" size={12} />
              <Box component="span" sx={VISUALLY_HIDDEN}>Call {client.displayName}</Box>
            </MuiButton>
          ) : null}
          {/* Live as of §3.4.3, carrying the client so the next screen does not ask again
              for the person whose page this is. */}
          <MuiButton
            component={NextLink}
            href={`/agent/trips/new?client=${client.clientId}`}
            variant="contained"
            color="primary"
            size="small"
            sx={BTN_SM}
          >
            <Icon name="plus" size={12} /> New trip
          </MuiButton>
          {/* §3.3.12, both directions. The dialog picks its own verb from `archived`. */}
          <ClientArchiveDialog
            clientId={client.clientId}
            displayName={client.displayName}
            version={client.version}
            archived={client.archived}
          />
          {/* §3.3.11 is DEFERRED to §3.9, where it also lives as 3.9.7 — the riskiest write
              in the section, next to the account-admin tools it shares a screen with. */}
          <Button type="button" variant="text" size="sm" disabled title={CLIENT_COPY.mergeDeferred}>
            Merge
            <Box component="span" sx={VISUALLY_HIDDEN}> — {CLIENT_COPY.mergeDeferred}</Box>
          </Button>
        </Box>
      </Box>

      {client.archived && (
        <Typography
          component="p"
          variant="body2"
          sx={{ m: 0, px: 2.5, py: 1, borderTop: 1, borderColor: "divider", color: "text.secondary" }}
        >
          {CLIENT_COPY.archivedBanner}
        </Typography>
      )}
    </Card>
  );
}

/** The breadcrumb back to the roster. A real link, because the roster is a real route now. */
export function ClientBackLink() {
  return (
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
  );
}
