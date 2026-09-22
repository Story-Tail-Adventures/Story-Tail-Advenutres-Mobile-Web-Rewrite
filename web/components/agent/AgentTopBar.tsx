import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";

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
 * A server component. It holds no state and reads no pathname; only the nav does.
 */
export function AgentTopBar({ initials }: { initials: string }) {
  return (
    <header className="client-topbar">
      <Link href="/agent" aria-label="Story-Tail Adventures — your worklist">
        <BrandMark size={80} alt="" />
      </Link>

      <div className="flex-1" />

      <button
        type="button"
        className="btn-icon"
        aria-label="Quick add — new trip arrives with §3.4, new client with §3.3"
        aria-disabled="true"
        disabled
      >
        <Icon name="plus" size={18} />
      </button>

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
    </header>
  );
}
