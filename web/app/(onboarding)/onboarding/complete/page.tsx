// Screen 2.1.14 Onboarding Complete / "You're All Set" — see docs/Screen-Inventory.md
// §2.1.14 (Pattern G, §4.4) and design/source-prototype/screens/client-auth.jsx
// `C2114_OnboardingComplete` + client-auth-mobile.jsx `M2114_OnboardingComplete`. P1.
//
// The last step, and the moment `platform_user.onboarding_completed_at` becomes non-null so
// the gate in the (client) layout stops routing every sign-in back into the wizard.
//
// It has no form of its own: everything here is either read back from what the earlier
// steps saved, or a way out. The one thing it must get right is telling the truth about
// what was saved — every step was skippable, and the traveler most likely to reach this
// screen having skipped things is exactly the one a fixed "all done!" would mislead.
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { TRIPS } from "@/content/public/trips";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CompleteActions } from "./CompleteActions";
import { completionChecklist, completionSubtitle } from "./summary";
import { COMPLETE_TEXT, type CompletionSummary } from "./state";

export const metadata: Metadata = {
  title: COMPLETE_TEXT.metaTitle,
  description: COMPLETE_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

const TRIP_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function CompletePage() {
  const summary = await currentSummary();
  const checklist = completionChecklist(summary);

  return (
    // NO WIZARD CHROME, which is what the prototype has and is the point of the screen: the
    // rail and the "STEP 06 OF 06" pill are a progress indicator, and there is no longer any
    // progress to indicate. Keeping them would make an arrival read as one more step.
    // `OnboardingShell` is deliberately not used here for that reason — this is the only
    // step that does not, and Back is not offered because the way back is the checklist's
    // own "add it any time" and the dashboard behind it.
    <main className="flex min-h-dvh flex-1 items-center justify-center px-5 py-8 md:p-8">
      <div className="w-full max-w-160">
        <div
          aria-hidden="true"
          className="mb-4 inline-flex size-24 items-center justify-center rounded-full bg-success-container text-success shadow-lg"
        >
          <Icon name="check" size={48} strokeWidth={2.5} />
        </div>

        <p className="t-label-s text-brand-orange">{COMPLETE_TEXT.overline}</p>
        <h1 className="t-headline mt-1 mb-1.5 text-on-surface md:t-display-s">
          {summary.firstName
            ? COMPLETE_TEXT.title(summary.firstName)
            : COMPLETE_TEXT.titleNoName}
        </h1>
        <p className="t-body m-0 text-on-surface-variant md:t-body-l">
          {completionSubtitle(summary)}
        </p>

        <div className="mt-6 flex flex-col gap-6">
          <section>
            <h2 className="t-title-s mb-2 text-on-surface">
              {COMPLETE_TEXT.checklistHeading}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {checklist.map((line) => (
                <li key={line.label} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={
                      line.done
                        ? "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white"
                        : "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-on-surface-variant"
                    }
                  >
                    <Icon
                      name={line.done ? "check" : "clock"}
                      size={11}
                      strokeWidth={2.5}
                    />
                  </span>
                  {/* The done/not-done state is in the icon, which is decoration — so it is
                    also in the text, or a screen reader hears four identical-looking
                    items. The skipped labels say "skipped" in words. */}
                  <span className="t-body-s text-on-surface-variant">
                    {line.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <ul className="grid list-none gap-3 p-0 md:grid-cols-3">
            <NextAction
              href={summary.trip ? "/dashboard" : "/explore"}
              icon="plane"
              title={
                summary.trip
                  ? COMPLETE_TEXT.cardTripTitle
                  : COMPLETE_TEXT.cardTripEmptyTitle
              }
              sub={
                summary.trip
                  ? `${summary.trip.title}${summary.trip.startDate ? ` · ${TRIP_DATE.format(new Date(`${summary.trip.startDate}T00:00:00Z`))}` : ""}`
                  : COMPLETE_TEXT.cardTripEmptySub
              }
            />
            <NextAction
              href="/explore"
              icon="search"
              title={COMPLETE_TEXT.cardExploreTitle}
              sub={COMPLETE_TEXT.cardExploreSub(TRIPS.length)}
            />
            {/* Only when there is somewhere for it to go. In-app messaging is Screen 2.6 and
              is not built, so this is a mail client or it is nothing — a card that looks
              like a way to reach Gyasi and is not one is worse than three columns of two. */}
            {env.inquiryEmail && (
              <NextAction
                href={`mailto:${env.inquiryEmail}`}
                icon="message"
                title={COMPLETE_TEXT.cardMessageTitle}
                sub={COMPLETE_TEXT.cardMessageSub}
                external
              />
            )}
          </ul>

          <CompleteActions />
        </div>
      </div>
    </main>
  );
}

function NextAction({
  href,
  icon,
  title,
  sub,
  external = false,
}: {
  href: string;
  icon: "plane" | "search" | "message";
  title: string;
  sub: string;
  /** A mailto is not a route; next/link would try to prefetch it. */
  external?: boolean;
}) {
  const body = (
    <>
      <Icon name={icon} size={20} className="text-primary" />
      <span className="t-title-s mt-2 block text-on-surface">{title}</span>
      <span className="t-body-s mt-0.5 block text-on-surface-variant">
        {sub}
      </span>
    </>
  );
  const className =
    "card-flat block h-full rounded-lg border border-outline-variant px-4 py-3.5 " +
    // A focus ring in the same token the buttons and inputs use — the browser default
    // shows something, but not the same something as the rest of the design system.
    "hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-primary";

  return (
    <li>
      {external ? (
        <a href={href} className={className}>
          {body}
        </a>
      ) : (
        <Link href={href} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}

/**
 * What the wizard actually collected — read back, never assumed.
 *
 * Four reads through the caller's own session and the self-select policies. Each one
 * answers a question the screen would otherwise have to guess: `client.phone` for whether
 * step 2 was filled in, a `travel_preference` row for step 3, a `companion` for step 4, and
 * a `trip` for whether there is anything waiting.
 *
 * `client.phone` rather than the row's existence, because the row always exists — it is
 * created at sign-up. Whether somebody TOLD us anything is a different question from
 * whether they have a record.
 */
async function currentSummary(): Promise<CompletionSummary> {
  const empty: CompletionSummary = {
    firstName: null,
    hasProfile: false,
    hasPreferences: false,
    hasCompanions: false,
    trip: null,
  };
  if (env.authChecksDisabledForLocalDev) return empty;

  const supabase = await createClient();

  const [client, preferences, companions, trips] = await Promise.all([
    supabase
      .from("client")
      .select(
        "first_name, preferred_name, phone, date_of_birth, mailing_address_id",
      )
      .maybeSingle(),
    supabase.from("travel_preference").select("id").maybeSingle(),
    supabase.from("companion").select("id").is("archived_at", null).limit(1),
    supabase
      .from("trip")
      .select("title, start_date")
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(1),
  ]);

  // ALL FOUR, not just the first. A failed `travel_preference` read comes back as no row,
  // which this screen would otherwise render as "how you like to travel — skipped": an
  // infrastructure fault wearing the face of a choice the traveler made, on the one screen
  // whose entire job is not doing that. Logged per table so an operator can tell which.
  for (const [table, result] of [
    ["client", client],
    ["travel_preference", preferences],
    ["companion", companions],
    ["trip", trips],
  ] as const) {
    if (result.error) {
      console.warn("[onboarding] completion read failed", {
        table,
        code: result.error.code,
      });
    }
  }
  if (client.error) return empty;

  const row = client.data;
  // `handle_new_user()` writes the literal 'New' when a sign-up carried no name claims —
  // Apple sends none after the first authorization. "That's everything, New." is worse than
  // no name at all, so the placeholder counts as absent. Same rule as 2.1.9.
  const name = row?.preferred_name?.trim() || row?.first_name?.trim();
  const trip = trips.data?.[0];

  return {
    firstName: !name || name === "New" ? null : name,
    hasProfile: Boolean(
      row?.phone || row?.date_of_birth || row?.mailing_address_id,
    ),
    hasPreferences: Boolean(preferences.data),
    hasCompanions: (companions.data?.length ?? 0) > 0,
    trip: trip ? { title: trip.title, startDate: trip.start_date ?? "" } : null,
  };
}
