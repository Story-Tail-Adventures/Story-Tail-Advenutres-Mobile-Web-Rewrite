import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/public/Photo";
import { formatTripDates } from "@/lib/trips/format";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { loadPastTrip } from "@/lib/trips/queries";
import { MEMORIES } from "./content";
import { ReflectionForm } from "./ReflectionForm";

export const metadata: Metadata = { title: "Memories" };

/**
 * Screen 2.2.11 Past Trip Detail / Memory View — docs/Screen-Inventory.md §2.2.11, §4.4
 * (Pattern I plus a gallery, "photo grid is 1-col on mobile"), and
 * design/source-prototype/screens/client-trip.jsx (C2211_PastTrip) +
 * client-trip-mobile.jsx (M2211_PastTrip). P1.
 *
 * A ROUTE OF ITS OWN, not a branch inside 2.2.3. The workflow that planned this section left
 * 2.2.10 and 2.2.11 as "the detail route when the trip is cancelled/past", and that was the
 * one under-specified thing in it. A cancelled trip genuinely IS the overview with a
 * different summary card — §4.4 calls it a Pattern C variant and that is how it is built. A
 * past trip is not: it is a gallery and a note where the other has tiles and a payment
 * timeline, and §2.2.11's own purpose line says "nostalgic, scaled-back". So `/trips/[id]`
 * redirects here, and this screen redirects back if the trip is not actually past — a URL
 * somebody bookmarked should not show a memory view of a trip they are about to take.
 *
 * THE NOTE FROM GYASI LEADS, above the photos. On the desktop artboard it sits in the right
 * rail; the mobile artboard moves it first and says why, and web follows the mobile artboard
 * here rather than the desktop one: this screen exists for the feeling, and the emotional
 * beat should not be the last thing somebody scrolls past.
 *
 * "Book a similar trip" repoints at the thread. §2.3 is Phase 2, so there is no search to
 * seed — and "Gyasi still has your notes" is both true and the thing a traveler would
 * actually want.
 */
export default async function MemoriesPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const past = await loadPastTrip(tripId);

  if (!past) notFound();

  // Guard the other direction. `/trips/[id]` sends `completed` trips here; anything else
  // arriving is a stale link or a hand-typed URL, and the overview is the right screen for
  // it. Without this, a booked trip would render as a memory of something that has not
  // happened.
  if (past.trip.status !== "completed") redirect(`/trips/${tripId}`);

  const { trip } = past;
  // Whole dollars, as the trip-detail glance does: cents on a memory of a trip that ended
  // two years ago is precision nobody asked for.
  const money = formatTripMoney(trip.totalValueCents, trip.currency);

  const snapshot = [
    past.nights !== null ? MEMORIES.snapshotNights(past.nights) : null,
    MEMORIES.snapshotTravelers(trip.travelerCount),
    money ? MEMORIES.snapshotAllIn(money) : null,
  ].filter(Boolean) as string[];

  return (
    <div className="pb-10">
      <div className="relative h-[230px] overflow-hidden">
        <Photo image={imageKeyForTrip(trip)} alt="" fill sizes="100vw" className="object-cover" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--brand-navy) 34%, transparent) 0%, transparent 32%, color-mix(in srgb, var(--brand-navy) 78%, transparent) 100%)",
          }}
        />
        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
            <Link
              href="/trips?filter=past"
              className="t-body-s inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-white backdrop-blur"
            >
              <Icon name="arrow_left" size={14} /> {MEMORIES.back}
            </Link>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-3xl p-4 text-white md:p-6">
            <span className="chip-status past">{trip.statusLabel}</span>
            <h1 className="t-headline mt-2">{trip.title}</h1>
            <p className="t-body-s opacity-90">
              {[formatTripDates(trip.startDate, trip.endDate), trip.destinations.join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
        {past.noteFromGyasi && (
          <section className="card relative overflow-hidden border-0 bg-secondary-container p-5 text-on-secondary-container">
            <span
              aria-hidden="true"
              className="absolute -right-6 -top-6 h-[104px] w-[104px] rounded-full bg-white/15"
            />
            <div className="relative">
              <p className="t-label-s opacity-75">{MEMORIES.noteOverline}</p>
              <p className="t-script mt-1 text-[27px] leading-tight">
                {MEMORIES.noteFallbackScript}
              </p>
              <p className="t-body-s mt-2 opacity-90">{past.noteFromGyasi}</p>
            </div>
          </section>
        )}

        <section>
          <h2 className="t-title-s mb-2">{MEMORIES.photosHeading(past.photos.length)}</h2>
          {past.photos.length === 0 ? (
            <EmptyState
              icon="sun"
              title={MEMORIES.photosEmptyTitle}
              body={MEMORIES.photosEmptyBody}
            />
          ) : (
            // §4.4: "Photo grid is 1-col on mobile, 3-col on tablet, 4-col on web."
            // This was 1/2/2, and the comment claimed §4.4 sanctioned the two-up — it does
            // not, and attributing my own choice to the doc is worse than the wrong column
            // count. `web:` rather than `lg:` because §4.1's web breakpoint is 1200.
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-3 web:grid-cols-4">
              {past.photos.map((photo) => (
                <li
                  key={photo.id}
                  // Shorter as the columns narrow, so a tile stays roughly square rather
                  // than becoming a letterbox at a quarter of the width.
                  className="relative h-[200px] overflow-hidden rounded-2xl bg-surface-2 md:h-[150px] web:h-[130px]"
                >
                  {/* The stored object is NOT rendered here. Showing it would mean signing a
                      URL per photograph on every page load — a five-minute URL and an
                      `audit_event` each, for images nobody may look at. The library at
                      2.2.6 is where a photograph gets opened, and it signs on demand. So
                      this is the filename over the trip's own hero image, which is honest
                      about being a placeholder rather than pretending to be the photo. */}
                  <Photo
                    image={imageKeyForTrip(trip)}
                    alt=""
                    fill
                    sizes="(min-width: 1200px) 25vw, (min-width: 768px) 33vw, 100vw"
                    className="object-cover opacity-45"
                  />
                  <div className="absolute inset-0 flex items-end p-3">
                    <Link
                      href={`/trips/${tripId}/documents`}
                      className="t-body-s inline-flex max-w-full items-center gap-1.5 rounded-lg bg-black/45 px-2 py-1 text-white backdrop-blur"
                    >
                      <Icon name="external" size={12} />
                      <span className="truncate">{photo.filename}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="btn btn-outlined mt-2.5 w-full border-dashed"
            disabled
            aria-disabled="true"
            title={MEMORIES.addPhotosDeferred}
          >
            <Icon name="upload" size={14} /> {MEMORIES.addPhotos}
          </button>
        </section>

        <ReflectionForm tripId={tripId} reflection={past.reflection} />

        {snapshot.length > 0 && (
          <section className="card p-4">
            <h2 className="t-label text-on-surface-variant">{MEMORIES.snapshotHeading}</h2>
            <p className="t-body mt-2">{snapshot.join(" · ")}</p>
          </section>
        )}

        <div className="flex flex-col gap-2.5 md:flex-row">
          {/* Only offered when there is a readable itinerary. An unpublished one is
              invisible to this session, so the link would land on "not published yet" for a
              trip that finished two years ago — which reads as broken, not as absent. */}
          {past.itineraryReady && (
            <Link href={`/trips/${tripId}/itinerary`} className="btn btn-tonal flex-1">
              <Icon name="calendar" size={14} /> {MEMORIES.itineraryCta}
            </Link>
          )}
          {past.documentCount > 0 && (
            <Link href={`/trips/${tripId}/documents`} className="btn btn-outlined flex-1">
              <Icon name="passport" size={14} /> {MEMORIES.documentsCta}
            </Link>
          )}
        </div>

        <section className="card border-0 bg-primary-container p-4 text-on-primary-container">
          <h2 className="t-title-s">{MEMORIES.againHeading}</h2>
          <p className="t-body-s mt-1 opacity-90">{MEMORIES.againBody}</p>
          <Link
            href={`/trips/${tripId}/messages`}
            className="btn mt-2.5 w-full bg-on-primary-container text-primary-container"
          >
            <Icon name="message" size={14} /> {MEMORIES.againCta}
          </Link>
        </section>
      </div>
    </div>
  );
}
