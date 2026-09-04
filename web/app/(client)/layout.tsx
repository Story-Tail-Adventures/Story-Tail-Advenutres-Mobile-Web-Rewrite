import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { onboardingRedirectFor, onboardingStatus } from "@/lib/onboarding/status";

/**
 * Authenticated client portal shell (Screen Inventory §2.2.x onward).
 *
 * Middleware already gates these routes, but this second check is deliberate: a
 * misconfigured matcher would silently open the whole group, and defence in depth at
 * the layout costs one query. The real app chrome — top bar and nav rail — arrives
 * with 2.2.1.
 *
 * This is also where the onboarding gate lives (Screens 2.1.9-2.1.14), and it lives HERE
 * rather than in the proxy for two reasons. The proxy runs on nearly every request, so a
 * database read there would be one per public page view as well. And the wizard's own
 * routes are in the (onboarding) group, outside this layout — putting the gate in the proxy
 * would mean the redirect to /welcome fired on /welcome itself, which is an infinite loop
 * rather than a gate.
 *
 * The cost is one extra redirect: `authRedirectFor` sends every authenticated arrival to
 * /dashboard, and an un-onboarded traveler is then bounced from here to /welcome. That is
 * structural — `safeNext`'s default and three returns in `authRedirectFor` all name
 * /dashboard — and it is one hop, not a loop.
 */
export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // In production this branch always runs — env.authChecksDisabledForLocalDev is false
  // there even when config is missing, so a misconfigured deploy 500s rather than
  // exposing the portal.
  if (!env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Fails open: `onboardingStatus` returns null when the read fails or Supabase is not
    // configured, and a status read going wrong must not lock somebody out of their own
    // dashboard.
    const destination = onboardingRedirectFor(await onboardingStatus());
    if (destination) redirect(destination);
  }

  return <div className="flex min-h-dvh flex-1 flex-col bg-bg">{children}</div>;
}
