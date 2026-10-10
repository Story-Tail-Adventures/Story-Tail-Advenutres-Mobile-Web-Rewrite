import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Toolbar from "@mui/material/Toolbar";
import type { SxProps, Theme } from "@mui/material/styles";

import { AgentQuickAdd, type QuickAddItem } from "@/components/agent/AgentQuickAdd";
import { BrandMark } from "@/components/brand/BrandMark";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { signOutAction } from "@/lib/auth/actions";

/**
 * The agent top bar. Screen-Inventory §6.4: "search, quick-add, notifications, profile menu".
 *
 * Three of those four have nothing behind them, and they are handled the way §2.4 handled
 * its deferrals rather than by quietly dropping them:
 *
 *  * SEARCH is absent, not disabled. There is no agent search surface at all — §3.3.1's
 *    roster is the first thing that could back one — and a field that does nothing is worse
 *    than no field. Same call ClientTopBar made about §9.1's search pill.
 *  * QUICK-ADD is a menu of the two things an advisor can create: new client (§3.3.9) and
 *    new trip (§3.4.3). There is no third item; §6.4's quick-add implies a new-lead action
 *    and no lead entity will ever exist (BRD §6.5).
 *  * NOTIFICATIONS is the bell, inert and marked so, exactly as on the client side — no
 *    dispatcher exists on either stack.
 *
 * The avatar is the agent's own initials. `platform_user.display_name` rather than a client
 * row: an agent has none, which is the thing the (client) layout's role gate exists to
 * notice.
 *
 * SIGN OUT LIVES HERE, and it is not a nicety. §3.2 redirects an agent off every (client)
 * route, so the one sign-out control on the web — Screen 2.5.1 Account, and the same form
 * inside `UnauthorizedState` — became unreachable for the only role that can fill the
 * worklist: /account, /dashboard, /welcome and /verify-email all land back on /agent. The
 * agent could sign in on a shared laptop and never sign out, leaving a live session (and
 * with it every client name, trip value and commission figure) for whoever sat down next.
 * §3.12's More sheet is the eventual home; the bar is the home until then.
 *
 * It is the client shell's own affordance, not a new one: the same `signOutAction` and the
 * same "Sign out" wording Screen 2.5.1 uses, in a form because a server component cannot
 * hand an onClick across the RSC boundary. The label is a literal rather than an
 * `AGENT_COPY` key because nothing on the Compose side pairs with it yet; §3.12 is where
 * the two get a shared string.
 *
 * THE GLYPH IS `lock`, NOT `arrow_left`. Screen 2.5.1 draws sign-out with `arrow_left` —
 * beside a label that is always on screen. Here the label can be off, and `arrow_left` is
 * the BACK affordance in sixteen of its seventeen uses across web/, so an unlabelled one
 * sitting right after the avatar in a top bar reads as "go back" and ends the session
 * instead. `lock` carries no navigation meaning anywhere in this shell.
 *
 * MUI SINCE 2026-10-01 (step 2 of the migration), on the look of the prototype's
 * MuiStaTopBar: an AppBar on `background.paper` with a divider underneath, no shadow, the
 * initials in a primary Avatar. The LAYOUT is the one it always had — sticky, 104px tall
 * via `--client-topbar-h` so the two authenticated bars cannot drift, 16px gutters, 12px
 * between controls, and the same controls in the same order at the same widths. Only the
 * quick-add menu needed state, so only it is a client island (AgentQuickAdd); the rest of
 * the bar is still a Server Component holding no state and reading no pathname.
 */
export function AgentTopBar({ initials }: { initials: string }) {
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={BAR_SX}>
      <Toolbar disableGutters sx={TOOLBAR_SX}>
        <Link
          component={NextLink}
          href="/agent"
          underline="none"
          aria-label="Story-Tail Adventures — your worklist"
        >
          <BrandMark size={80} alt="" />
        </Link>

        <Box sx={{ flex: 1 }} />

        {/* LEFTMOST IN THE CLUSTER, so sign-out stays anchored at the right edge — see the
            note on it below for why that one control's position is load-bearing. */}
        <ThemeToggle />

        {/* QUICK-ADD YIELDS TO THE TOGGLE BELOW `sm`, and it is a measured call rather than a
            taste one. This bar never overflows — the brand link has no `flexShrink: 0`, so
            the lockup absorbs every bit of pressure via `object-fit: contain` (BrandMark
            lines 92–98). What gets squeezed is the artwork, against the 80px legibility
            floor in Design-System §11.2.

            Measured in Chrome, lockup width against its natural 201px:

              viewport   before the toggle   toggle added   toggle + this rule
              375px            152                115              144
              400px            131                 94              120
              500px            201                166              201
              640px            201                201              201

            So a placeholder was costing a working control ~35px of logo at every phone
            width. Hiding it below `sm` puts the bar back where it was — identical from
            500px up, and within 8–11px below that. The residue is because `.btn-icon` had
            no `shrink-0` and quick-add used to absorb pressure by shrinking, which the
            toggle deliberately will not do.

            `sm` is 640px here (lib/mui/tokens.ts BREAKPOINTS), the same value Tailwind's
            `sm:` had. 640 is simply where the measurement says everything fits at natural
            size anyway. */}
        <Box sx={QUICK_ADD_SLOT_SX}>
          <AgentQuickAdd label="New" items={QUICK_ADD_ITEMS} />
        </Box>

        <IconButton
          aria-label="Notifications — not available yet"
          aria-disabled="true"
          disabled
          sx={ICON_BUTTON_SX}
        >
          <Icon name="bell" size={18} />
        </IconButton>

        <Avatar aria-hidden="true" title="Your account" sx={AVATAR_SX}>
          {initials}
        </Avatar>

        {/* THE LABEL HIDES BELOW 400px, NOT BELOW `sm`. The bar needs ~395px to seat five
            controls with the word shown, and `sm` is 640px — which would suppress the word
            across the entire 400–640px band, not just on the 375px phone the measurement
            was about. 400px is where the arithmetic actually puts it, so it is a raw media
            query rather than a breakpoint key.

            `aria-label` AND `title`, because they reach different people. `aria-label` names
            the button for assistive tech; `title` is all a sighted mouse or touch user gets
            once the word is off, and below 400px this is the only sign-out control an
            advisor has on the web.

            The §4.2 touch minimum rides on the form rather than the button, because the
            shared Button carries the legacy 32px box and exposes no `sx` of its own. */}
        <Box component="form" action={signOutAction} sx={SIGN_OUT_FORM_SX}>
          <Button variant="outlined" size="sm" type="submit" aria-label="Sign out" title="Sign out">
            <Icon name="lock" size={15} />
            <Box component="span" sx={SIGN_OUT_LABEL_SX}>
              Sign out
            </Box>
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

/**
 * THE MENU §3.3.9's NOTE PROMISED. It was a disabled button standing for two unbuilt
 * actions, then a plain link when only one of them existed, and now both do — so the label
 * loses its object and becomes "New". Plain data, handed to the island: the strings stay
 * here with the bar's other copy.
 */
const QUICK_ADD_ITEMS = [
  { href: "/agent/clients/new", icon: "user", label: "New client" },
  { href: "/agent/trips/new", icon: "trip", label: "New trip" },
] as const satisfies readonly QuickAddItem[];

// Sticky at the same stacking level the bar always had (30); MUI's own 1100 would lift it
// over anything a page positions above the chrome today.
const BAR_SX: SxProps<Theme> = {
  // The bar's TOTAL height is the variable, border included, as it was under the legacy
  // CSS (border-box). Sized on the Toolbar instead, the 1px divider sat on top of it and
  // every offset that reads the variable (sticky strips, fill heights) came out 1px short.
  height: "var(--client-topbar-h)",
  boxSizing: "border-box",
  bgcolor: "background.paper",
  borderBottom: 1,
  borderColor: "divider",
  zIndex: 30,
};

// Fills the 104px bar (the variable lives on BAR_SX), 16px gutters, 12px between items.
const TOOLBAR_SX: SxProps<Theme> = {
  height: "100%",
  minHeight: { xs: 0 },
  px: 2,
  gap: 1.5,
};

const QUICK_ADD_SLOT_SX: SxProps<Theme> = { display: { xs: "none", sm: "flex" } };

// The legacy .btn-icon box, matching ThemeToggle's, so the cluster stays one size.
const ICON_BUTTON_SX: SxProps<Theme> = { width: 40, height: 40 };

// The prototype's MuiStaTopBar avatar: 36px, primary on its contrast text.
const AVATAR_SX: SxProps<Theme> = {
  width: 36,
  height: 36,
  fontSize: 13,
  fontWeight: 600,
  bgcolor: "primary.main",
  color: "primary.contrastText",
};

const SIGN_OUT_FORM_SX: SxProps<Theme> = {
  "@media (pointer: coarse)": { "& .MuiButton-root": { minHeight: 44 } },
};

const SIGN_OUT_LABEL_SX: SxProps<Theme> = {
  display: "none",
  "@media (min-width:400px)": { display: "inline" },
};
