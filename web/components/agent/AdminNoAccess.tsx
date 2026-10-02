import Avatar from "@mui/material/Avatar";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { signOutAction } from "@/lib/auth/actions";

/**
 * §5's permissions state, written for the one role that now reaches it.
 *
 * ONE COMPONENT, TWO SHELLS. This was written out twice — byte-for-byte, heading, body,
 * icon, Card classes and form — once in web/app/(agent)/layout.tsx and once in
 * web/app/(client)/layout.tsx, with a comment in each saying the other copy existed. That
 * is not a pin: nothing fails when one of them is edited and the other is not, there is no
 * test over either, and `check_copy_parity.py` does not read TSX. So a future wording change
 * lands on one shell and the admin sees two different explanations depending on which URL
 * they happened to type.
 *
 * A LAYOUT CANNOT EXPORT IT. Next rejects named exports other than its own conventions from
 * a layout file, so hoisting the shared copy needed a module of its own rather than one
 * layout importing the other's function.
 *
 * WHY IT SITS UNDER components/agent/ WHILE THE CLIENT SHELL USES IT TOO: it is §3.2's
 * find. Before §3.2 an agent on a client route got `UnauthorizedState`; §3.2 redirects
 * agents, which leaves ADMIN as the only role on either branch, and that is the role this
 * screen is written for. Moving it to components/ui/ when a third caller appears is a
 * rename, not a rewrite.
 *
 * `UnauthorizedState` (web/components/client/states.tsx) is still not usable here. Its body
 * is fixed to "Your account is set up as an advisor" and its button offers to sign the
 * caller back in as a traveler — true while an agent was the only caller, false for an
 * admin, who is neither and would land right back here. Giving that component a body prop
 * would collapse this into it, and is still the right follow-up.
 *
 * ON MUI (step 2 of the migration): the same card as `UnauthorizedState` — the centred
 * 512px Card, the 56px Avatar tile, h5, body2 and the legacy `.btn-tonal` box on MUI's
 * outlined secondary Button — so the two permission states keep looking like one thing.
 */
export function AdminNoAccess() {
  return (
    <Card sx={{ mx: "auto", mt: 3, maxWidth: 512, textAlign: "center" }}>
      <CardContent sx={{ p: 3.5, "&:last-child": { pb: 3.5 } }}>
        <Avatar aria-hidden="true" sx={TILE_SX}>
          <Icon name="shield" size={26} />
        </Avatar>
        <Typography component="h2" variant="h5">
          You don’t have access to this view
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
          Your account is set up as an administrator. Story-Tail has no admin area yet, so
          there is nothing here for you — the traveler’s side and the advisor’s worklist are
          both somebody else’s desk.
        </Typography>
        {/* A form, not a link: the action clears the session server-side and then redirects,
            which is the only sequence the proxy will let through. */}
        <form action={signOutAction}>
          <MuiButton type="submit" variant="outlined" color="secondary" sx={BTN_SX}>
            Sign out
          </MuiButton>
        </form>
      </CardContent>
    </Card>
  );
}

/** The 56px round icon tile above the title, on the neutral surface. */
const TILE_SX = {
  mx: "auto",
  mb: 1.5,
  width: 56,
  height: 56,
  bgcolor: "surface.3",
  color: "text.secondary",
} as const;

/** The legacy `.btn.btn-tonal.mt-4` box (40px, 24px sides, 8px gap) on MUI's Button. */
const BTN_SX = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap", mt: 2 } as const;
