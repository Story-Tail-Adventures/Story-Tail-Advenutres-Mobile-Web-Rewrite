import type { Metadata } from "next";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

import { AccountHeader } from "../AccountHeader";
import { NOTIFICATIONS } from "./content";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

/**
 * Screen Inventory 2.5.6 — Notification Preferences. §4.4 Pattern A (matrix form).
 * Artboards: client-account.jsx `C256_Notifications`, client-account-mobile.jsx
 * `M256_Notifications`.
 *
 * A PLACEHOLDER, deliberately and in full. This is the one §2.5 screen that cannot be built
 * at all today, and shipping the matrix would be worse than shipping this page — it would be
 * a set of switches that control nothing, which is precisely the trap the disabled §2.4 CTAs
 * exist to avoid. Four independent blockers, each needing a migration or a new function:
 *
 *  1. `notification_preference` has RLS enabled and NO POLICY. The read returns zero rows
 *     and always will.
 *  2. No path creates a row. Its primary key is `user_id`, so a screen with no row has
 *     nothing to read even once a policy exists — `handle_new_user()` has to seed one and
 *     this screen has to upsert.
 *  3. No Edge Function references the table. `notification_preference` is written by
 *     nothing, and PostgREST cannot write it (no write policy, verbs not granted).
 *  4. NOTHING DELIVERS A NOTIFICATION. There is no dispatcher, no transactional email
 *     sender, and no FCM or APNs wiring anywhere in the repo — the only `firebase` reference
 *     in supabase/config.toml is `[auth.third_party.firebase]`, an identity provider. SMS is
 *     off in config and has no provider, which is why BRD §6.6 says "email and push" and the
 *     Screen Inventory's third channel column was removed.
 *
 * The honest thing a placeholder can do is say which channels are live. Today that is none,
 * so it says so rather than implying the preferences are merely unsaved.
 *
 * The row that reaches this screen on 2.5.1 is disabled, so this page is only reachable by
 * typing the URL. It exists anyway: the route needs to resolve rather than 404 for anyone
 * who has the link, and it is where the reasoning lives.
 */
export default function NotificationsPage() {
  return (
    <div className="client-fill">
      <AccountHeader title={NOTIFICATIONS.title} />

      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <Card className="p-7 text-center">
          <span
            className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 text-on-surface-variant"
            aria-hidden="true"
          >
            <Icon name="bell" size={26} />
          </span>
          <h2 className="t-title-l">{NOTIFICATIONS.emptyTitle}</h2>
          <p className="t-body mt-2 text-on-surface-variant">{NOTIFICATIONS.emptyBody}</p>
          <p className="t-body-s mt-4 text-on-surface-variant">{NOTIFICATIONS.reachYou}</p>
        </Card>
      </div>
    </div>
  );
}
