import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";

/**
 * The authenticated top bar (Design-System §9.1: 104px, brand mark, search pill, actions).
 *
 * Two departures from §9.1, both deliberate and both about not promising things:
 *
 *  * §9.1 specifies a role-aware SEARCH PILL. Search is §2.3, which is Phase 2, so there is
 *    nothing behind it. A search field that does nothing is worse than no field, so it is
 *    absent rather than disabled — unlike the nav rail, where a placeholder keeps the
 *    layout stable.
 *  * §9.1 specifies an action cluster of help, messages-with-dot, notifications-with-badge
 *    and an avatar with name and role. Help is §2.5.11 and notifications are §2.5.6,
 *    neither built. What ships is the bell (inert, and marked so) and the initials avatar.
 *
 * This is a server component: it holds no state and reads no pathname, so it does not need
 * to be. Only the nav does.
 */
export function ClientTopBar({ initials }: { initials: string }) {
  return (
    <header className="client-topbar">
      <Link href="/dashboard" aria-label="Story-Tail Adventures — your trips">
        <BrandMark size={80} alt="" />
      </Link>

      <div className="flex-1" />

      <button
        type="button"
        className="btn-icon"
        aria-label="Notifications — not available yet"
        aria-disabled="true"
        disabled
      >
        <Icon name="bell" size={18} />
      </button>

      {/* Gyasi has no licensed photograph and neither does any client, so initials it is —
          the same choice §2.0's About page made for his portrait. */}
      <span
        className="avatar"
        aria-hidden="true"
        title="Your account"
      >
        {initials}
      </span>
    </header>
  );
}
