// The onboarding wizard's shell — Screen Inventory §2.1.9 through §2.1.14, Pattern G.
//
// Its own route group, and that is load-bearing rather than tidy. Not (auth): that group is
// Pattern A's split-pane brand panel beside a 440px form column, and these screens are
// full-bleed with a left-rail stepper. Not (client): that layout carries the onboarding
// gate, so a wizard step inside it would be redirected to itself — a loop, not a gate. It
// also brings the portal nav that arrives with 2.2.1, which does not belong over a wizard.
//
// So: no chrome at all, matching `ScreenFrame chrome="plain"` in the prototype.
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { onboardingStatus } from "@/lib/onboarding/status";

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const status = await onboardingStatus();
    // Somebody who has already finished has no business back in the wizard: 2.1.10-2.1.12
    // all have a second entry point in account settings, which is where editing belongs
    // once the first run is over. An agent has no wizard at all.
    if (status && (!status.isClient || status.completedAt)) redirect("/dashboard");
  }

  return <div className="flex min-h-dvh flex-1 flex-col bg-bg">{children}</div>;
}
