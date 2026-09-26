import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";
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
 *  * QUICK-ADD is drawn DISABLED with its reason, because unlike search it has a definite
 *    home: new trip is §3.4.3 and new client is §3.3.9. There is no third item; §6.4's
 *    quick-add implies a new-lead action and no lead entity will ever exist (BRD §6.5).
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
 * A server component. It holds no state and reads no pathname; only the nav does.
 */
export function AgentTopBar({ initials }: { initials: string }) {
  return (
    <header className="client-topbar">
      <Link href="/agent" aria-label="Story-Tail Adventures — your worklist">
        <BrandMark size={80} alt="" />
      </Link>

      <div className="flex-1" />

      {/* LEFTMOST IN THE CLUSTER, so sign-out stays anchored at the right edge — see the
          note on it below for why that one control's position is load-bearing. It is also
          the only control in this bar with anything behind it; the other two are drawn
          disabled with their reasons. */}
      <ThemeToggle />

      {/* QUICK-ADD YIELDS TO THE TOGGLE BELOW `sm`, and it is a measured call rather than a
          taste one. This bar never overflows — the brand link has no `shrink-0`, so the
          lockup absorbs every bit of pressure via `object-fit: contain` (BrandMark lines
          92–98). What gets squeezed is the artwork, against the 80px legibility floor in
          Design-System §11.2.

          Measured in Chrome, lockup width against its natural 201px:

            viewport   before the toggle   toggle added   toggle + this rule
            375px            152                115              144
            400px            131                 94              120
            500px            201                166              201
            640px            201                201              201

          So a DISABLED placeholder was costing a working control ~35px of logo at every
          phone width. Hiding it below `sm` puts the bar back where it was — identical from
          500px up, and within 8–11px below that. The residue is because `.btn-icon` has no
          `shrink-0` and quick-add used to absorb pressure by shrinking, which the toggle
          deliberately will not do.

          `sm` is Tailwind's 640px here, not a phone boundary — globals.css redefines only
          `--breakpoint-web`. 640 is simply where the measurement says everything fits at
          natural size anyway. */}
      {/* LIVE AS OF §3.3.9, and a LINK rather than a menu. It was one disabled button
          standing for two unbuilt actions; creating a client is built now and creating a
          trip is §3.4.3, so the honest control is the one thing it can do. When §3.4.3
          lands this becomes a menu with two entries and the label loses its object. */}
      <Link
        href="/agent/clients/new"
        className="btn-icon hidden sm:inline-flex"
        aria-label="New client"
      >
        <Icon name="plus" size={18} />
      </Link>

      <button
        type="button"
        className="btn-icon"
        aria-label="Notifications — not available yet"
        aria-disabled="true"
        disabled
      >
        <Icon name="bell" size={18} />
      </button>

      <span className="avatar" aria-hidden="true" title="Your account">
        {initials}
      </span>

      {/* THE LABEL HIDES BELOW 400px, NOT BELOW `sm`. The bar needs ~395px to seat five
          controls with the word shown, and globals.css redefines only `--breakpoint-web`,
          so `sm` here is still Tailwind's default 640px — which suppressed the word across
          the entire 400–640px band, not just on the 375px phone the measurement was about.
          `min-[400px]` is where the arithmetic actually puts it.

          `aria-label` AND `title`, because they reach different people. `aria-label` names
          the button for assistive tech; `title` is all a sighted mouse or touch user gets
          once the word is off, and below 400px this is the only sign-out control an
          advisor has on the web. */}
      <form action={signOutAction}>
        <button
          type="submit"
          className="btn btn-outlined btn-sm agent-signout"
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="lock" size={15} />
          <span className="hidden min-[400px]:inline">Sign out</span>
        </button>
      </form>
    </header>
  );
}
