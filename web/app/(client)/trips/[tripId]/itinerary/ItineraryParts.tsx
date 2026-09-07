import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import type { DayWeather, ItineraryActivity, ItineraryView } from "@/lib/trips/queries";
import { BLOCK_LABEL, ITINERARY } from "./content";

/**
 * The pieces 2.2.4 and 2.2.5 share, plus 2.2.8's empty states — which §4.4 places "inline
 * within Itinerary Viewer" rather than on a route of their own.
 */

/**
 * Which glyph an activity gets, inferred from what it says about itself.
 *
 * MATCHES THE TITLE, NOT THE BODY. Matching both put a utensils glyph on "Catamaran to Booby
 * Cay", because its body reads "Snorkel gear and lunch included" — the meal is a detail, not
 * the nature of the activity. Only the title says what the thing IS.
 *
 * Vessels are tested before meals for the same reason: a boat trip that feeds you is a boat
 * trip. The Kotlin twin is `activityMark` in ui/screens/trip/ItineraryScreen.kt.
 */
export function activityIcon(activity: ItineraryActivity): IconName {
  const title = activity.title.toLowerCase();
  if (/flight|→|airport|\baa \d|depart/.test(title)) return "plane";
  if (/transfer|taxi|shuttle|driver/.test(title)) return "trip";
  if (/catamaran|snorkel|boat|cruise|sail|\bcay\b|ferry/.test(title)) return "ship";
  if (/check ?in|resort|hotel|suite|villa/.test(title)) return "building";
  if (/dinner|lunch|breakfast|restaurant|hibachi|table/.test(title)) return "utensils";
  if (/yoga|spa|massage/.test(title)) return "heart";
  return "sparkle";
}

export function ActivityCard({
  activity,
  showDetail = false,
}: {
  activity: ItineraryActivity;
  /** 2.2.5 shows the address, the phone and the actions; 2.2.4 keeps the row compact. */
  showDetail?: boolean;
}) {
  const time = formatTime(activity.startTime, activity.endTime);
  return (
    <Card className="p-3.5">
      <div className="flex gap-3">
        <div className="min-w-[52px]">
          {activity.startTime && (
            <div className="font-sans text-[15px] font-bold leading-none">
              {shortTime(activity.startTime)}
            </div>
          )}
          <div className="t-label-s mt-1 text-brand-orange">{BLOCK_LABEL[activity.block]}</div>
        </div>

        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
          <Icon name={activityIcon(activity)} size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="t-title-s">{activity.title}</div>
          {activity.body && (
            <div className="t-body-s mt-0.5 text-on-surface-variant">{activity.body}</div>
          )}
          {activity.confirmationNumber && (
            <div className="mt-2">
              <span className="t-label-s text-on-surface-variant">{ITINERARY.confirmation} </span>
              <span className="kbd">{activity.confirmationNumber}</span>
            </div>
          )}
          {showDetail && time && !activity.startTime && (
            <span className="kbd mt-2 inline-block">{time}</span>
          )}
        </div>
      </div>

      {/* Design-System §2.4 names the tip as the voice-forward moment inside a day, and
          Screen-Inventory §2.2.4 lists it as a primary element. The desktop artboard omits
          it entirely; M224 draws it, and this follows M224. */}
      {activity.gyasisTip && (
        <div className="mt-3 rounded-xl bg-tertiary-container p-3 text-on-tertiary-container">
          <div className="t-label-s opacity-80">{ITINERARY.tip}</div>
          <p className="t-script mt-0.5 text-[19px] leading-tight">{activity.gyasisTip}</p>
        </div>
      )}

      {showDetail && activity.address && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-surface-2 p-2.5">
          <Icon name="pin" size={13} />
          <span className="t-body-s min-w-0 flex-1 text-on-surface-variant">{activity.address}</span>
          {/* A maps hand-off, which needs no integration: a geo/maps URL is a link. */}
          <a
            className="btn btn-text btn-sm shrink-0"
            href={`https://maps.google.com/?q=${encodeURIComponent(activity.address)}`}
            target="_blank"
            rel="noreferrer"
          >
            {ITINERARY.openInMaps} <Icon name="external" size={12} />
          </a>
        </div>
      )}

      {showDetail && activity.phone && (
        <a href={`tel:${activity.phone}`} className="btn btn-outlined btn-sm mt-2">
          <Icon name="phone" size={13} /> {ITINERARY.call}
        </a>
      )}
    </Card>
  );
}

/**
 * 2.2.8's empty component states.
 *
 * `componentKinds` is what makes these honest: "your flights aren't booked yet" is only
 * true when the trip has no flight component, and saying it about a trip that has one would
 * be worse than saying nothing.
 */
export function EmptyComponentStates({ itinerary }: { itinerary: ItineraryView }) {
  const has = (kind: string) => itinerary.componentKinds.includes(kind);
  const states: Array<{ icon: IconName; title: string; body: string; big?: boolean }> = [];

  if (!has("flight")) {
    states.push({
      icon: "plane",
      title: ITINERARY.emptyFlightsTitle,
      body: ITINERARY.emptyFlightsBody,
      big: true,
    });
  }
  if (!has("excursion") && !has("custom")) {
    states.push({
      icon: "utensils",
      title: ITINERARY.emptyDiningTitle,
      body: ITINERARY.emptyDiningBody,
    });
  }

  if (states.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {states.map((state) => (
        <EmptyComponentCard key={state.title} {...state} tripId={itinerary.tripId} />
      ))}
    </div>
  );
}

export function EmptyComponentCard({
  icon,
  title,
  body,
  big = false,
  tripId,
}: {
  icon: IconName;
  title: string;
  body: string;
  big?: boolean;
  tripId?: string;
}) {
  return (
    <div
      className={`card border-[1.5px] border-dashed border-outline-variant bg-surface-2 ${
        big ? "p-6 text-center" : "flex items-start gap-3 p-4"
      }`}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-surface-3 text-on-surface-variant ${
          big ? "mx-auto mb-2.5 h-13 w-13 rounded-full" : "h-9 w-9 rounded-lg"
        }`}
        style={big ? { height: 52, width: 52 } : undefined}
      >
        <Icon name={icon} size={big ? 26 : 16} />
      </span>
      <div>
        <div className={big ? "t-title-l" : "t-title-s"}>{title}</div>
        <p
          className={`t-body-s text-on-surface-variant ${
            big ? "mx-auto mt-1.5 max-w-sm" : "mt-1"
          }`}
        >
          {body}
        </p>
        {big && tripId && (
          <Link href={`/trips/${tripId}/messages`} className="btn btn-tonal mt-3.5">
            <Icon name="message" size={14} /> {ITINERARY.askGyasi}
          </Link>
        )}
      </div>
    </div>
  );
}

/** The weather panel. Agent-authored — see the DayWeather note in queries.ts. */
export function WeatherCard({ weather }: { weather: DayWeather }) {
  return (
    <Card className="p-3.5">
      <div className="t-label text-on-surface-variant">{ITINERARY.weather}</div>
      <div className="mt-2 flex items-center gap-3">
        <Icon name="sun" size={32} className="text-brand-sunset" />
        <div className="min-w-0 flex-1">
          {weather.highF !== undefined && (
            <div className="font-sans text-[30px] font-bold leading-none">{weather.highF}°F</div>
          )}
          <div className="t-body-s mt-1 text-on-surface-variant">
            {[
              weather.summary,
              weather.windMph !== undefined
                ? `${weather.windMph} mph${weather.windDir ? ` ${weather.windDir}` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
      {weather.uvIndex !== undefined && weather.uvIndex >= 8 && (
        <p className="t-body-s mt-2.5 rounded-lg bg-warning-container p-2.5 font-medium">
          {ITINERARY.uvWarning(weather.uvIndex)}
        </p>
      )}
    </Card>
  );
}

/** What the trip itself can answer. Nothing is asserted that no column holds. */
export function ImportantInfo({ itinerary }: { itinerary: ItineraryView }) {
  const rows: Array<{ icon: IconName; label: string; value: string }> = [];
  if (itinerary.insuranceReference) {
    rows.push({ icon: "shield", label: ITINERARY.insurance, value: itinerary.insuranceReference });
  }
  if (itinerary.emergencyContact?.phone) {
    rows.push({
      icon: "phone",
      label: ITINERARY.emergency,
      value: [itinerary.emergencyContact.name, itinerary.emergencyContact.phone]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 p-3.5">
        <Icon name="info" size={16} className="text-on-surface-variant" />
        <h2 className="t-title-s flex-1">{ITINERARY.importantInfo}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="t-body-s border-t border-outline-variant p-3.5 text-on-surface-variant">
          {ITINERARY.noImportantInfo}
        </p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center gap-2.5 border-t border-outline-variant p-3.5"
            >
              <Icon name={row.icon} size={14} className="text-on-surface-variant" />
              <span className="t-body-s min-w-0 flex-1">
                <span className="text-on-surface-variant">{row.label}: </span>
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Nothing in the schema records a visa requirement, and a wrong answer here is
          somebody turned away at a gate. So it asks rather than asserts. */}
      <div className="border-t border-outline-variant p-3.5">
        <span className="t-body-s text-on-surface-variant">{ITINERARY.visaUnknown}</span>
      </div>
    </Card>
  );
}

/** "06:40" from a Postgres `time` value, which arrives as "06:40:00". */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function formatTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${shortTime(start)} – ${shortTime(end)}` : shortTime(start);
}
