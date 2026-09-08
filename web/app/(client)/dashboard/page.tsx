import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { Photo } from "@/components/public/Photo";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { formatDay, formatTripDates } from "@/lib/trips/format";
import { loadDashboard, type DashboardTrip } from "@/lib/trips/queries";
import { createClient } from "@/lib/supabase/server";
import { DASHBOARD, isLeisure } from "./content";

export const metadata: Metadata = { title: "Your trips" };

/**
 * Screen 2.2.1 Client Dashboard / Home — see docs/Screen-Inventory.md §2.2.1 and §4.4
 * (Pattern D: mobile stacks and the hero countdown goes full-width; the tablet/web weather
 * widget beside it is explicitly a larger-viewport affordance) and
 * design/source-prototype/screens/client-trip.jsx (C221_Dashboard) +
 * client-trip-mobile.jsx (M221_Dashboard). P1.
 *
 * This is the screen that proves the rest of §2.2 works: it reads five tables through the
 * policies added in 20260907031255, derives its status labels through the one shared module
 * both stacks use, and renders inside the shell from Stage 4. If any of those three were
 * wrong, this page is where it would show.
 *
 * DEPARTURES FROM THE ARTBOARD, each recorded rather than silently applied:
 *   * No "Saved searches" tab. `SavedSearch` is a Phase 2 entity, so the tab had nothing
 *     to count. The artboard's third tab is gone rather than rendered empty.
 *   * "New idea" / "Explore trips" repoint at the trip thread. §2.3 is Phase 2 and the CTA
 *     had no destination; asking Gyasi is how a trip actually starts at MVP.
 *   * "Authorize a card" renders DISABLED. §2.4 is Phase 1 and lands next, so unlike the
 *     search CTA there is a real destination coming — the button keeps its place in the
 *     layout and says why it is not pressable yet.
 *   * The countdown shows days only, not days/hours/minutes. The artboard's HR and MIN
 *     tiles need a ticking client component, and a server-rendered "14 HR" is wrong the
 *     moment it is sent. Days is the unit that survives a cache.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("client")
    .select("first_name, preferred_name")
    .maybeSingle();

  // `"New"` is filtered because that is what `handle_new_user()` writes into
  // `client.first_name` when it provisions a row from an email with no name attached —
  // greeting somebody "Hey New" is worse than not using a name at all. The native twin
  // does this in `NameRow.greetable()`; web did not, so the same account was greeted
  // differently on the two stacks.
  const rawName = client?.preferred_name?.trim() || client?.first_name?.trim();
  const name = rawName && rawName !== "New" ? rawName : "there";
  const data = await loadDashboard();

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        {/* §5's ERROR state, not the empty one. A failed read used to render EmptyState
            here, which has neither the retry CTA nor the "Message Gyasi" escalation §5
            requires — and told a traveler with trips that they had none. The reads fail
            closed (null, not a throw), so this cannot be left to a route-level boundary. */}
        <RetryState
          title="We couldn’t load your trips"
          body="Something went wrong on our side, not yours. Trying again usually sorts it."
        />
      </div>
    );
  }

  const { upcoming, inPlanning, past, nextPayment, itineraryReady, latestMessage } = data;
  const traveling = upcoming?.status === "in_progress";
  const leisure = upcoming ? isLeisure(upcoming.tripType) : false;
  const days = upcoming?.daysUntil ?? null;

  const greeting = !upcoming
    ? DASHBOARD.greetingNoTrip(name)
    : traveling
      ? DASHBOARD.greetingTraveling(name)
      : days === null
        ? DASHBOARD.greetingNoTrip(name)
        : leisure
          ? DASHBOARD.greetingRest(name, days)
          : DASHBOARD.greetingNeutral(name, days);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-10 md:p-6">
      <header>
        <p className="t-label-s text-secondary">
          {leisure && !traveling ? DASHBOARD.overlineRest : DASHBOARD.overlineNeutral}
        </p>
        <h1 className="t-headline mt-1.5">{greeting}</h1>
        {traveling && (
          <p className="t-body-s mt-1 text-on-surface-variant">{DASHBOARD.subtitleTraveling}</p>
        )}
        {!upcoming && (
          <p className="t-body mt-2 max-w-prose text-on-surface-variant">
            {DASHBOARD.subtitleNoTrip}
          </p>
        )}
      </header>

      {upcoming ? (
        <div className="mt-4 grid gap-3 web:grid-cols-[2.1fr_1fr]">
          <HeroCountdown trip={upcoming} days={days} itineraryReady={itineraryReady} />
          <div className="flex flex-col gap-2.5">
            {nextPayment && <ActionNeeded payment={nextPayment} />}
            {/* Only the advisor's own words are quoted here. When the traveler spoke last
                the card drops the quote and keeps the reply-window line, which is exactly
                what somebody waiting for an answer wants to see. */}
            <AdvisorCard
              preview={latestMessage?.fromAgent ? latestMessage.body : undefined}
              tripId={upcoming.id}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon="palm"
            title="No trip booked yet"
            body="When there is one, it lives right here with a countdown on it."
            // A mailto, because with no trip there is no trip-scoped thread to open and
            // §2.6's inbox is not built. This used to point at "/dashboard" — the page it
            // renders on — so the only route to Gyasi in this state went nowhere. Same
            // escalation ErrorState uses, and for the same reason: a form that goes
            // nowhere would be worse.
            action={{
              label: DASHBOARD.startSomethingNew,
              href: "mailto:hello@story-tail.com?subject=Somewhere%20new",
            }}
          />
        </div>
      )}

      <TripSections inPlanning={inPlanning} past={past} />
    </div>
  );
}

/**
 * The hallmark card, per Design-System §9.4: "the single highest-value moment on the client
 * side". Full-width below `web:` per §4.4.
 */
function HeroCountdown({
  trip,
  days,
  itineraryReady,
}: {
  trip: DashboardTrip;
  days: number | null;
  itineraryReady: boolean;
}) {
  const where = trip.destinations[0] ?? "";
  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-xl shadow-3">
      <Photo
        image={imageKeyForTrip(trip)}
        alt=""
        fill
        sizes="(min-width: 1200px) 640px, 100vw"
        className="object-cover"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(150deg, color-mix(in srgb, var(--brand-burgundy) 82%, transparent), color-mix(in srgb, var(--brand-navy) 70%, transparent))",
        }}
      />
      <div className="relative flex min-h-[260px] flex-col p-5 text-white">
        <span className={`chip-status ${trip.chip} self-start`}>{trip.statusLabel}</span>
        <h2 className="t-title-l mt-2.5 text-white">{trip.title}</h2>
        <p className="t-body-s text-white/90">
          {[formatTripDates(trip.startDate, trip.endDate), where, `${trip.travelerCount} travelers`]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="mt-auto flex items-end gap-2 pt-4">
          {days !== null && (
            <div className="rounded-lg border border-white/20 bg-white/15 px-4 py-2 text-center backdrop-blur-sm">
              <div className="font-sans text-[22px] font-extrabold leading-none">{days}</div>
              <div className="mt-1 text-[9px] font-semibold leading-none tracking-[1.2px] text-white/85">
                {DASHBOARD.countdownUnits.days}
              </div>
            </div>
          )}
          {itineraryReady ? (
            <Link href={`/trips/${trip.id}/itinerary`} className="btn btn-orange btn-sm ml-auto">
              {DASHBOARD.viewItinerary} <Icon name="arrow_right" size={12} />
            </Link>
          ) : (
            <span className="ml-auto text-[12px] font-medium text-white/80">
              {DASHBOARD.itineraryNotReady}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionNeeded({
  payment,
}: {
  payment: NonNullable<Awaited<ReturnType<typeof loadDashboard>>>["nextPayment"];
}) {
  if (!payment) return null;
  const due = payment.daysUntilDue;
  return (
    <Card className="border-0 bg-error-container p-3.5 text-on-error-container">
      <div className="flex items-center gap-2">
        <Icon name="card" size={15} />
        <span className="t-label-s">
          {DASHBOARD.actionNeededLabel}
          {due !== null && due >= 0 ? ` · ${due} DAYS` : ""}
        </span>
      </div>
      <div className="t-title-s mt-1.5">{payment.label}</div>
      <div className="t-body-s mt-1 opacity-85">
        {formatTripMoney(payment.amountCents, payment.currency)}
        {payment.dueDate ? ` due ${formatDay(payment.dueDate)}` : ""}
      </div>
      {/* §2.4 lands next. Disabled and saying why, rather than pointed at a route that
          does not exist — see the departures note on the page component. */}
      <button
        type="button"
        className="btn btn-filled mt-2.5 w-full"
        disabled
        aria-disabled="true"
        title={DASHBOARD.authorizeCardComingSoon}
        style={{ background: "var(--md-on-error-container)", color: "var(--md-error-container)" }}
      >
        {DASHBOARD.authorizeCard}
      </button>
    </Card>
  );
}

function AdvisorCard({ preview, tripId }: { preview?: string; tripId: string }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="avatar sm" aria-hidden="true">
          GS
        </span>
        <div className="min-w-0 flex-1">
          <div className="t-title-s text-[13px]">
            {DASHBOARD.advisorName} · {DASHBOARD.advisorRole}
          </div>
          <div className="t-body-s text-on-surface-variant">{DASHBOARD.advisorReplyTime}</div>
        </div>
      </div>
      {preview && (
        <p className="t-body-s mt-2 text-on-surface-variant">“{preview}”</p>
      )}
      <Link href={`/trips/${tripId}/messages`} className="btn btn-tonal btn-sm mt-2.5 w-full">
        <Icon name="message" size={14} /> {DASHBOARD.messageAgent}
      </Link>
    </Card>
  );
}

/**
 * Two tabs, not the artboard's three. The third was "Saved searches · 3" and SavedSearch is
 * a Phase 2 entity, so it had nothing to count.
 *
 * Rendered as headed sections rather than interactive tabs: a tab strip needs client state,
 * and with two short lists there is nothing to hide — §4.4 Pattern D asks for stacked
 * sections with a "See all" per section on mobile, which is what this is.
 */
function TripSections({ inPlanning, past }: { inPlanning: DashboardTrip[]; past: DashboardTrip[] }) {
  return (
    <>
      <TripSection
        heading={DASHBOARD.tabInPlanning(inPlanning.length)}
        trips={inPlanning}
        emptyTitle={DASHBOARD.emptyPlanningTitle}
        emptyBody={DASHBOARD.emptyPlanningBody}
      />
      <TripSection
        heading={DASHBOARD.tabPast(past.length)}
        trips={past}
        emptyTitle={DASHBOARD.emptyPastTitle}
        emptyBody={DASHBOARD.emptyPastBody}
      />
    </>
  );
}

function TripSection({
  heading,
  trips,
  emptyTitle,
  emptyBody,
}: {
  heading: string;
  trips: DashboardTrip[];
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <section className="mt-7">
      <div className="flex items-baseline gap-3 border-b border-outline-variant pb-2">
        <h2 className="t-title-s flex-1">{heading}</h2>
        {trips.length > 0 && (
          <Link href="/trips" className="btn btn-text btn-sm">
            {DASHBOARD.seeAllTrips}
          </Link>
        )}
      </div>
      {trips.length === 0 ? (
        <p className="t-body-s mt-3 text-on-surface-variant">
          <span className="t-title-s block text-on-surface">{emptyTitle}</span>
          {emptyBody}
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2 web:grid-cols-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TripCard({ trip }: { trip: DashboardTrip }) {
  return (
    <Link href={`/trips/${trip.id}`} className="card block overflow-hidden p-0">
      <div className="relative h-[120px]">
        <Photo
          image={imageKeyForTrip(trip)}
          alt=""
          fill
          sizes="(min-width: 1200px) 300px, (min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
        <span className={`chip-status ${trip.chip} absolute left-2.5 top-2.5`}>
          {trip.statusLabel}
        </span>
      </div>
      <div className="p-3">
        <div className="t-title-s">{trip.title}</div>
        <div className="t-body-s text-on-surface-variant">
          {/* The destination is the middle field, matching native's TripCard. Web omitted it,
              so the same card read differently on the two stacks — and the photograph above
              is chosen from a generic registry, so the place name is doing real work here. */}
          {[
            formatTripDates(trip.startDate, trip.endDate),
            trip.destinations[0],
            `${trip.travelerCount} travelers`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </Link>
  );
}
