// Screen 2.1.13 Connect with Agent / Invite Code — see docs/Screen-Inventory.md §2.1.13
// (Pattern G, §4.4) and design/source-prototype/screens/client-auth.jsx
// `C2113_ConnectAgent` + client-auth-mobile.jsx `M2113_ConnectAgent`. P1.
//
// Step 5 of 6, and the bridge between "the agent set up a trip for me" and "I'm in the
// portal". Two paths meet here. The automatic one has ALREADY RUN: at email confirmation,
// `handle_user_email_confirmed()` adopts a matching unclaimed client. The manual one is
// this screen — for when the traveler signed up with a different address, or two records
// matched and the trigger deliberately claimed neither.
//
// So the screen's job is to report what the automatic match did, honestly, and offer the
// code as the fallback. The prototype instead promises "we'll find them automatically by
// email", which is a promise about something that has already either happened or not.
import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { Alert } from "@/components/ui/Alert";
import { env } from "@/lib/env";
import { wizardStepIndex } from "@/lib/onboarding/steps";
import { createClient } from "@/lib/supabase/server";
import { ConnectForm } from "./ConnectForm";
import { CONNECT_TEXT, type LinkedTrip } from "./state";

export const metadata: Metadata = {
  title: CONNECT_TEXT.metaTitle,
  description: CONNECT_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

const STEP_INDEX = wizardStepIndex("connect");

/** Pinned locale and UTC, for the reason `CompanionsList` spells out. */
const TRIP_DATE = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default async function ConnectPage() {
  const { trips, email } = await linked();

  return (
    <OnboardingShell
      stepIndex={STEP_INDEX}
      title={CONNECT_TEXT.title}
      sub={CONNECT_TEXT.sub}
    >
      <div className="flex flex-col gap-5">
        <div className="md:max-w-160">
          {/* `status`, not the Alert default of `alert`. This is page content that is there
              on arrival, not something that just happened — and with a real refusal
              rendering a few lines below it, two assertive regions would compete to be the
              thing a screen reader reads out. */}
          <Alert role="status" tone={trips.length > 0 ? "success" : "info"}>
            {trips.length === 0 ? (
              CONNECT_TEXT.noMatch
            ) : (
              <>
                {trips.length === 1
                  ? CONNECT_TEXT.matchedOne(
                      trips[0].title,
                      formatStart(trips[0]),
                    )
                  : CONNECT_TEXT.matchedMany(
                      trips.length,
                      trips.map((trip) => trip.title).join(", "),
                    )}
                {email && (
                  <>
                    {" "}
                    <span className="text-on-surface-variant">
                      {CONNECT_TEXT.matchedFooter(email)}
                    </span>
                  </>
                )}
              </>
            )}
          </Alert>
        </div>

        <ConnectForm />
      </div>
    </OnboardingShell>
  );
}

function formatStart(trip: LinkedTrip): string {
  return trip.startDate
    ? TRIP_DATE.format(new Date(`${trip.startDate}T00:00:00Z`))
    : "dates to come";
}

/**
 * The trips already attached to whichever client this account is bound to.
 *
 * Read through the caller's own session and `trip_self_select`, added in 20260904140753 —
 * before that migration `trip` had RLS enabled and no policy at all, so this panel would
 * have rendered empty for everybody and looked like an answer rather than a missing rule.
 * The same migration keeps `notes` and `total_commission_cents` outside the grant; neither
 * is selected here and neither could be.
 *
 * The email is the ACCOUNT's, not the client record's: after a redemption the bound client
 * carries whatever address Gyasi has on file, which may not be the one somebody signed in
 * with, and showing them a different address than they typed would be alarming.
 */
async function linked(): Promise<{
  trips: LinkedTrip[];
  email: string | null;
}> {
  if (env.authChecksDisabledForLocalDev) return { trips: [], email: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("trip")
    .select("id, title, start_date")
    .is("archived_at", null)
    // A cancelled trip is not something to greet somebody with.
    .neq("status", "cancelled")
    .order("start_date", { ascending: true, nullsFirst: false });

  if (error) {
    // The banner falls back to "nothing linked yet", which is the safe thing to say when we
    // genuinely do not know — it invites a code rather than claiming there is nothing.
    console.warn("[onboarding] linked trips read failed", { code: error.code });
    return { trips: [], email: user?.email ?? null };
  }

  return {
    trips: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      startDate: row.start_date ?? "",
    })),
    email: user?.email ?? null,
  };
}
