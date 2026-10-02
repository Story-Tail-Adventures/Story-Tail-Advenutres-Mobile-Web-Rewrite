import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

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

      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        <Card sx={{ p: 3.5, textAlign: "center" }}>
          <Avatar
            aria-hidden="true"
            sx={{ mx: "auto", mb: 1.5, width: 56, height: 56, bgcolor: "surface.3", color: "text.secondary" }}
          >
            <Icon name="bell" size={26} />
          </Avatar>
          <Typography component="h2" variant="h5">
            {NOTIFICATIONS.emptyTitle}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {NOTIFICATIONS.emptyBody}
          </Typography>
          <Typography component="p" variant="caption" sx={{ mt: 2, display: "block", color: "text.secondary" }}>
            {NOTIFICATIONS.reachYou}
          </Typography>
        </Card>
      </Box>
    </div>
  );
}
