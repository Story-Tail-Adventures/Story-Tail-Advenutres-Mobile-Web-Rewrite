import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/client/states";
import { Photo } from "@/components/public/Photo";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { formatDay, formatTripDates } from "@/lib/trips/format";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { loadTripDetail, type PaymentMilestoneView, type TripDetail } from "@/lib/trips/queries";
import { TRIP_DETAIL } from "./content";

export const metadata: Metadata = { title: "Your trip" };

/**
 * Screen 2.2.3 Trip Detail / Overview — see docs/Screen-Inventory.md §2.2.3 and §4.4
 * (Pattern C: full-screen detail on mobile with collapsible sub-sections; a right rail on
 * web) and design/source-prototype/screens/client-trip.jsx (C223_TripDetail) +
 * client-trip-mobile.jsx (M223_TripDetail). P1.
 *
 * Also Screen 2.2.10 Trip Cancellation View, which §4.4 calls a "Pattern C variant" — the
 * same screen with a cancellation summary in place of the tiles, not a route of its own.
 *
 * A COMPLETED trip redirects to 2.2.11 instead, because that one genuinely is a different
 * screen: §4.4 gives it "Pattern I + photo gallery" and it opens on a note rather than on
 * things to do. Branching a third body in here would have made one component hold three
 * layouts that share only a hero.
 *
 * TWO THINGS THE ARTBOARD SHOWS THAT ARE NOT HERE:
 *   * "Card on file · VISA •••• 4242" is dropped from At a glance. That lives on
 *     `payment_card`, which belongs to §2.4 — and the wallet is where a client should manage
 *     it, not a read-only echo on a trip page.
 *   * "Authorize card" is disabled, like the dashboard's. §2.4 is Phase 1 and next.
 */
export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const detail = await loadTripDetail(tripId);

  // RLS makes "not yours" and "does not exist" the same answer, and that is deliberate —
  // see the NotFound response in contracts/openapi.yaml.
  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <EmptyState
          icon="warning"
          title={TRIP_DETAIL.notFoundTitle}
          body={TRIP_DETAIL.notFoundBody}
          action={{ label: TRIP_DETAIL.back, href: "/trips" }}
        />
      </div>
    );
  }

  if (detail.trip.status === "completed") redirect(`/trips/${tripId}/memories`);

  const { trip } = detail;
  const cancelled = trip.status === "cancelled";

  return (
    <div className="pb-10">
      <TripHero detail={detail} />

      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6 web:grid-cols-[1fr_300px]">
        <div>
          {cancelled ? <CancellationSummary detail={detail} /> : <QuickTiles detail={detail} />}
          <Glance detail={detail} />
          {!cancelled && <AgentNote detail={detail} />}
        </div>

        <aside className="flex flex-col gap-3">
          <AdvisorCard tripId={trip.id} />
          {cancelled ? <ReadyAgain /> : <PaymentTimeline milestones={detail.milestones} />}
        </aside>
      </div>
    </div>
  );
}

function TripHero({ detail }: { detail: TripDetail }) {
  const { trip } = detail;
  const cancelled = trip.status === "cancelled";
  return (
    <div className="relative h-[220px] overflow-hidden">
      <Photo
        image={imageKeyForTrip(trip)}
        alt=""
        fill
        sizes="100vw"
        className={`object-cover ${cancelled ? "grayscale-[0.55] brightness-[0.6]" : ""}`}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--brand-navy) 34%, transparent) 0%, transparent 32%, color-mix(in srgb, var(--brand-navy) 78%, transparent) 100%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-3 p-4 text-white md:p-6">
          <div className="min-w-0">
            {/* A scrim behind the label, not just white text: the hero photograph is
                arbitrary and half the registry is bright sand or pale rock, where white on
                85% opacity disappears. The prototype's MTripTopBar makes the same call for
                its over-photo controls. */}
            <Link
              href="/trips"
              className="t-body-s inline-flex items-center gap-1 rounded-full bg-[rgba(13,33,55,0.55)] px-2.5 py-1 text-white backdrop-blur-sm"
            >
              <Icon name="arrow_left" size={14} /> {TRIP_DETAIL.back}
            </Link>
            <div className="mt-1.5">
              <span className={`chip-status ${trip.chip}`}>{trip.statusLabel}</span>
            </div>
            <h1 className="t-display-s mt-1.5 text-white">{trip.title}</h1>
            <p className="t-body-s text-white/90">
              {[
                formatTripDates(trip.startDate, trip.endDate),
                trip.destinations[0],
                trip.daysUntil !== null && !cancelled ? `${trip.daysUntil} days to go` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {detail.itineraryReady && (
            <Link
              href={`/trips/${trip.id}/itinerary`}
              className="btn btn-orange hidden shrink-0 md:inline-flex"
            >
              <Icon name="download" size={14} /> {TRIP_DETAIL.downloadPdf}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** The artboard's four quick-access tiles: 2×2 below `md:`, a row of four above. */
function QuickTiles({ detail }: { detail: TripDetail }) {
  const { trip } = detail;
  const tiles: Array<{
    icon: IconName;
    label: string;
    sub: string;
    href: string | null;
    tone: "primary" | "error" | "secondary" | "tertiary";
  }> = [
    {
      icon: "plane",
      label: TRIP_DETAIL.tileItinerary,
      sub: detail.itineraryReady
        ? TRIP_DETAIL.tileItinerarySub(detail.dayCount)
        : TRIP_DETAIL.tileItineraryPending,
      href: detail.itineraryReady ? `/trips/${trip.id}/itinerary` : null,
      tone: "primary",
    },
    {
      icon: "card",
      label: TRIP_DETAIL.tilePayments,
      sub: nextDueLabel(detail.milestones),
      // §2.4. Disabled rather than pointed at a route that does not exist.
      href: null,
      tone: "error",
    },
    {
      icon: "passport",
      label: TRIP_DETAIL.tileDocuments,
      sub: TRIP_DETAIL.tileDocumentsSub(detail.documentCount),
      href: `/trips/${trip.id}/documents`,
      tone: "secondary",
    },
    {
      icon: "message",
      label: TRIP_DETAIL.tileMessages,
      sub: TRIP_DETAIL.tileMessagesSub(detail.unreadCount),
      href: `/trips/${trip.id}/messages`,
      tone: "tertiary",
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-2.5 web:grid-cols-4">
      {tiles.map((tile) => {
        const body = (
          <>
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `var(--md-${tile.tone}-container)`,
                color: `var(--md-on-${tile.tone}-container)`,
              }}
            >
              <Icon name={tile.icon} size={16} />
            </span>
            <span className="min-w-0">
              <span className="t-title-s block text-[13px]">{tile.label}</span>
              <span className="t-body-s block truncate text-on-surface-variant">{tile.sub}</span>
            </span>
          </>
        );
        return (
          <li key={tile.label}>
            {tile.href ? (
              <Link href={tile.href} className="card flex items-center gap-2.5 p-3">
                {body}
              </Link>
            ) : (
              <span className="card flex items-center gap-2.5 p-3 opacity-60" aria-disabled="true">
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Glance({ detail }: { detail: TripDetail }) {
  const { trip } = detail;
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const rows: Array<[string, string]> = [
    [TRIP_DETAIL.glanceTripType, humaniseTripType(trip.tripType)],
    ...(nights !== null ? ([[TRIP_DETAIL.glanceNights, `${nights} nights`]] as Array<[string, string]>) : []),
    [TRIP_DETAIL.glanceDestination, trip.destinations.join(", ") || "To be decided"],
    [TRIP_DETAIL.glanceTravelers, `${trip.travelerCount} travelers`],
    [
      TRIP_DETAIL.glanceTotal,
      formatTripMoney(trip.totalValueCents, trip.currency) + " all-in",
    ],
    [TRIP_DETAIL.glanceComponents, `${detail.componentCount} booked`],
  ];

  return (
    <Card className="mt-3 p-4">
      <h2 className="t-title-s">{TRIP_DETAIL.glance}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3.5 web:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="t-label text-on-surface-variant">{label}</dt>
            <dd className="t-body mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function AgentNote({ detail }: { detail: TripDetail }) {
  return (
    <Card className="mt-3 p-4">
      <h2 className="t-title-s">{TRIP_DETAIL.noteHeading}</h2>
      <p className="t-body mt-1.5 text-on-surface-variant">
        {detail.introNote ?? TRIP_DETAIL.notePending}
      </p>
    </Card>
  );
}

function CancellationSummary({ detail }: { detail: TripDetail }) {
  return (
    <Card className="p-4">
      <h2 className="t-title-s">{TRIP_DETAIL.cancelledHeading}</h2>
      <dl className="mt-3 grid gap-3.5 md:grid-cols-2">
        <div className="md:col-span-2">
          <dt className="t-label text-on-surface-variant">{TRIP_DETAIL.cancelledReason}</dt>
          <dd className="t-body mt-0.5">
            {detail.cancellationReason ?? TRIP_DETAIL.cancelledNoReason}
          </dd>
        </div>
        {detail.refundStatus && (
          <div className="md:col-span-2">
            <dt className="t-label text-on-surface-variant">{TRIP_DETAIL.cancelledRefund}</dt>
            <dd className="t-body mt-0.5">{detail.refundStatus}</dd>
          </div>
        )}
      </dl>
      {detail.itineraryReady && (
        <Link href={`/trips/${detail.trip.id}/itinerary`} className="btn btn-tonal mt-4">
          <Icon name="passport" size={14} /> {TRIP_DETAIL.archivedItinerary}
        </Link>
      )}
    </Card>
  );
}

function ReadyAgain() {
  return (
    <Card className="border-0 bg-secondary-container p-4 text-on-secondary-container">
      <h2 className="t-title-s">{TRIP_DETAIL.cancelledAgainHeading}</h2>
      <p className="t-body-s mt-1 opacity-90">{TRIP_DETAIL.cancelledAgainBody}</p>
    </Card>
  );
}

function AdvisorCard({ tripId }: { tripId: string }) {
  return (
    <Card className="p-3.5">
      <div className="t-label text-on-surface-variant">{TRIP_DETAIL.advisorLabel}</div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="avatar" aria-hidden="true">
          GS
        </span>
        <div className="min-w-0 flex-1">
          <div className="t-title-s">{TRIP_DETAIL.advisorName}</div>
          <div className="t-body-s text-on-surface-variant">{TRIP_DETAIL.advisorReplyTime}</div>
        </div>
      </div>
      <Link href={`/trips/${tripId}/messages`} className="btn btn-tonal btn-sm mt-2.5 w-full">
        <Icon name="message" size={14} /> {TRIP_DETAIL.message}
      </Link>
    </Card>
  );
}

/**
 * `payment_milestone`, which exists because of this card. It is a supplier payment schedule
 * the client is being kept informed about — never an invoice, and there is deliberately no
 * action on it beyond §2.4's card authorization.
 */
function PaymentTimeline({ milestones }: { milestones: PaymentMilestoneView[] }) {
  if (milestones.length === 0) {
    return (
      <Card className="p-3.5">
        <div className="t-label text-on-surface-variant">{TRIP_DETAIL.paymentTimeline}</div>
        <p className="t-body-s mt-1.5 text-on-surface-variant">{TRIP_DETAIL.noSchedule}</p>
      </Card>
    );
  }
  return (
    <Card className="p-3.5">
      <div className="t-label text-on-surface-variant">{TRIP_DETAIL.paymentTimeline}</div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {milestones.map((m) => {
          const paid = m.status === "paid";
          const waived = m.status === "waived";
          const overdue = m.status === "overdue";
          const dot = paid ? "var(--md-success)" : overdue ? "var(--md-error)" : "var(--md-outline)";
          return (
            <li
              key={m.id}
              className="flex items-center gap-2 text-[12.5px] font-medium leading-tight"
              style={overdue ? { color: "var(--md-error)" } : undefined}
            >
              <span className="dot shrink-0" style={{ background: dot }} />
              <span>
                {m.label} ·{" "}
                {waived
                  ? TRIP_DETAIL.waived
                  : paid
                    ? `${TRIP_DETAIL.paid} ${formatTripMoney(m.paidCents, m.currency)}`
                    : `${formatTripMoney(m.amountCents, m.currency)} ${
                        overdue ? TRIP_DETAIL.overdue : TRIP_DETAIL.due
                      }${m.dueDate ? ` ${formatDay(m.dueDate)}` : ""}`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="t-body-s mt-2.5 text-on-surface-variant">{TRIP_DETAIL.paymentTimelineNote}</p>
    </Card>
  );
}

function nextDueLabel(milestones: PaymentMilestoneView[]): string {
  const next = milestones.find((m) => m.status !== "paid" && m.status !== "waived");
  if (!next) return milestones.length > 0 ? "All paid" : "Nothing scheduled";
  return `${formatTripMoney(next.amountCents, next.currency)} ${TRIP_DETAIL.due}${
    next.dueDate ? ` ${formatDay(next.dueDate)}` : ""
  }`;
}

function nightsBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const nights = Math.round((b - a) / 86_400_000);
  return nights > 0 ? nights : null;
}

/** `all_inclusive` → "All-inclusive". The enum is not copy. */
function humaniseTripType(tripType: string): string {
  const map: Record<string, string> = {
    cruise: "Cruise",
    all_inclusive: "All-inclusive",
    multi_destination: "Multi-destination",
    group: "Group trip",
    custom: "Custom",
  };
  return map[tripType] ?? tripType.replace(/_/g, " ");
}
