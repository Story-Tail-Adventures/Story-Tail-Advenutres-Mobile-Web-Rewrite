import { redirect } from "next/navigation";

import { ClientBottomNav, ClientNavRail } from "@/components/client/ClientNav";
import { ClientTopBar } from "@/components/client/ClientTopBar";
import { UnauthorizedState } from "@/components/client/states";
import { env } from "@/lib/env";
import { onboardingRedirectFor, onboardingStatus } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

/**
 * Authenticated client portal shell (Screen Inventory §2.2.x onward).
 *
 * Middleware already gates these routes, but this second check is deliberate: a
 * misconfigured matcher would silently open the whole group, and defence in depth at the
 * layout costs one query.
 *
 * This is also where the onboarding gate lives (Screens 2.1.9–2.1.14), and it lives HERE
 * rather than in the proxy for two reasons. The proxy runs on nearly every request, so a
 * database read there would be one per public page view as well. And the wizard's own
 * routes are in the (onboarding) group, outside this layout — putting the gate in the proxy
 * would mean the redirect to /welcome fired on /welcome itself, which is an infinite loop
 * rather than a gate.
 *
 * ── THE ROLE GATE, added with §2.2 ──────────────────────────────────────────────
 *
 * `onboardingRedirectFor` returns null for a non-client (lib/onboarding/status.ts), so
 * before this an AGENT signing in reached /dashboard perfectly happily. Every §2.2 read
 * then went through a policy predicated on `platform_user.client_id`, which is NULL for an
 * agent — and `NULL = NULL` is not true in SQL, so every query returned zero rows. The
 * agent saw the friendly "no trips yet" empty state.
 *
 * That is the worst available outcome: it looks like data loss rather than a wrong turn.
 * §5 requires a real unauthorized state, so an agent now gets one.
 *
 * ── WHY THE CHROME IS *NOT* HOISTED ABOVE THIS GATE ─────────────────────────────
 *
 * A tempting refactor is to render the rail and top bar synchronously and put the gate in a
 * Suspense boundary, so `loading.tsx` has chrome to sit inside instead of appearing after a
 * blank frame. It is rejected on purpose: hoisting means committing to the app shell before
 * knowing whether the caller may see it, and an unauthenticated or wrong-role visitor would
 * get a frame of the portal before the redirect. Blocking here streams no HTML at all until
 * the decision is made, which is the correct trade — and the two queries are a single
 * round-trip each against a local index.
 */
export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let initials = "";
  let wrongRole = false;

  // In production this branch always runs — env.authChecksDisabledForLocalDev is false
  // there even when config is missing, so a misconfigured deploy 500s rather than
  // exposing the portal.
  if (!env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const status = await onboardingStatus();

    // Fails open: `onboardingStatus` returns null when the read fails or Supabase is not
    // configured, and a status read going wrong must not lock somebody out of their own
    // dashboard.
    const destination = onboardingRedirectFor(status);
    if (destination) redirect(destination);

    // An agent or admin is authenticated and onboarded, and still does not belong here.
    // Rendered rather than redirected: sending them to an agent route that does not exist
    // yet (§3.x) would be a redirect to a 404.
    //
    // `status === null` means the read failed, and that path fails OPEN by design — see
    // the comment above. So a null status is NOT treated as the wrong role: locking a
    // traveler out of their own dashboard because a query timed out would be worse than
    // briefly showing an agent an empty one.
    wrongRole = status !== null && !status.isClient;

    if (!wrongRole) {
      // Their own name, for the avatar. `client_self_select` plus the column grant in
      // client_column_grant makes this the caller's own row and nothing else; an agent has
      // no client row at all, which is why this is skipped for them.
      const { data: client } = await supabase
        .from("client")
        .select("first_name, last_name, preferred_name")
        .maybeSingle();
      initials = initialsFor(client?.preferred_name ?? client?.first_name, client?.last_name);
    }
  }

  return (
    <div className="client-surface flex">
      <ClientNavRail />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <ClientTopBar initials={initials || "ST"} />
        <main id="main" className="client-main min-w-0 flex-1">
          {wrongRole ? <UnauthorizedState /> : children}
        </main>
      </div>
      <ClientBottomNav />
    </div>
  );
}

/**
 * Two letters, or one, or none.
 *
 * The caller passes a fallback rather than this returning one, because a client whose
 * profile carries no name yet is a real state — the onboarding gate only requires the
 * wizard to be *finished*, and a skipped name step leaves both columns null.
 */
function initialsFor(first?: string | null, last?: string | null): string {
  const a = first?.trim()?.[0] ?? "";
  const b = last?.trim()?.[0] ?? "";
  return `${a}${b}`.toUpperCase();
}
