import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

import { AdminNoAccess } from "@/components/agent/AdminNoAccess";
import { AgentBottomNav, AgentNavRail } from "@/components/agent/AgentNav";
import { AgentTopBar } from "@/components/agent/AgentTopBar";
import { agentShellDecision } from "@/lib/agent/role";
import { INITIALS_FALLBACK, initialsFor } from "@/lib/auth/initials";
import { env } from "@/lib/env";
import { onboardingStatus } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

/**
 * The advisor's shell (Screen Inventory §3.2 onward).
 *
 * Mirrors the (client) layout rather than sharing it. The two shells differ in the rail's
 * contents (seven against six), the bar's contents, the top bar (quick-add and sign-out), the
 * tablet behaviour and the role gate, which runs in opposite directions; one shared shell
 * would branch on a role prop at every one of those points.
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
 *
 * THE SHELL IS MUI SINCE 2026-10-01 (step 2 of the migration): three Boxes with plain `sx`,
 * which a Server Component may hand across the boundary. The geometry is the one
 * web/styles/agent.css used to draw — a full-height flex row, the rail beside a column that
 * holds the bar and the page, and a reserve under the page for the fixed bottom bar on the
 * widths that bar exists (below `md`). Still a Server Component; nothing here needs state.
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
    <Box sx={SURFACE_SX}>
      <AgentNavRail />
      <Box sx={COLUMN_SX}>
        <AgentTopBar initials={initials || INITIALS_FALLBACK} />
        <Box component="main" id="main" sx={MAIN_SX}>
          {unauthorized ? <AdminNoAccess /> : children}
        </Box>
      </Box>
      <AgentBottomNav />
    </Box>
  );
}

// The surface: the whole viewport, on the scheme's background.
const SURFACE_SX: SxProps<Theme> = {
  display: "flex",
  minHeight: "100dvh",
  bgcolor: "background.default",
  color: "text.primary",
};

// The bar-and-page column beside the rail. `minWidth: 0` lets a wide table shrink instead
// of pushing the rail off screen.
const COLUMN_SX: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  minHeight: "100dvh",
  minWidth: 0,
  flex: 1,
};

// Reserve for the fixed bottom bar, so the last card is not under it. The bar only exists
// below `md`; the 68px is the legacy `.agent-main` figure, kept so nothing on the pages moves.
const MAIN_SX: SxProps<Theme> = {
  minWidth: 0,
  flex: 1,
  pb: { xs: "calc(68px + max(env(safe-area-inset-bottom), 8px))", md: 0 },
};
