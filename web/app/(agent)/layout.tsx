import { redirect } from "next/navigation";

import { AgentBottomNav, AgentNavRail } from "@/components/agent/AgentNav";
import { AgentTopBar } from "@/components/agent/AgentTopBar";
import { UnauthorizedState } from "@/components/client/states";
import { agentShellDecision } from "@/lib/agent/role";
import { INITIALS_FALLBACK, initialsFor } from "@/lib/auth/initials";
import { env } from "@/lib/env";
import { onboardingStatus } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

/**
 * The advisor's shell (Screen Inventory §3.2 onward).
 *
 * Mirrors the (client) layout rather than sharing it — see web/styles/agent.css for why the
 * two shells are separate rather than one component branching on a role.
 *
 * TWO DELIBERATE DIFFERENCES FROM THE CLIENT SHELL:
 *
 *  * NO ONBOARDING GATE. `onboardingRedirectFor` returns null for a non-client by design,
 *    and §3.1's agent activation wizard is unbuilt. Inventing a gate here would be a gate
 *    with nothing behind it.
 *
 *  * INITIALS COME FROM `platform_user.display_name`, not from a client row. An agent has
 *    no client row at all — that is precisely the condition the (client) layout's role gate
 *    was added to notice, when every §2.2 read silently returned zero rows for Gyasi and
 *    the dashboard rendered a friendly "no trips yet".
 *
 * THE BLOCKING GATE AND THE NO-HOIST DECISION ARE THE CLIENT LAYOUT'S, UNCHANGED. Rendering
 * the chrome synchronously and putting the gate in a Suspense boundary would give a
 * wrong-role visitor a frame of the advisor's shell before the redirect. Blocking here
 * streams no HTML until the decision is made.
 */
export default async function AgentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let initials = "";
  let unauthorized = false;

  // In production this branch always runs — env.authChecksDisabledForLocalDev is false
  // there even when config is missing, so a misconfigured deploy 500s rather than exposing
  // the book.
  if (!env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const status = await onboardingStatus();

    // A null status — the read failed — redirects to the CLIENT shell rather than
    // rendering this one. That asymmetry is the security property; lib/agent/role.ts
    // records why.
    const decision = agentShellDecision(status);
    if (decision.kind === "redirect") redirect(decision.to);
    unauthorized = decision.kind === "unauthorized";

    if (!unauthorized) {
      const { data: me } = await supabase
        .from("platform_user")
        .select("display_name")
        .maybeSingle();
      // `display_name` is one field, so it splits on the first space rather than arriving
      // as two columns the way a client's name does.
      const [first, ...rest] = (me?.display_name ?? "").split(" ");
      initials = initialsFor(first, rest.join(" "));
    }
  }

  return (
    <div className="agent-surface flex">
      <AgentNavRail />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <AgentTopBar initials={initials || INITIALS_FALLBACK} />
        <main id="main" className="agent-main min-w-0 flex-1">
          {unauthorized ? <UnauthorizedState /> : children}
        </main>
      </div>
      <AgentBottomNav />
    </div>
  );
}
