import Link from "next/link";

import { Avatar } from "@/components/public/Avatar";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientCompanion, ClientOverview } from "@/lib/agent/clientDetail";

/**
 * Screens 3.3.2 and 3.3.3 — Snapshot, Preferences, the four mini-stats and the household.
 *
 * THE PROTOTYPE'S SNAPSHOT DRAWS TWO FIELDS THAT DO NOT EXIST, and both are dropped rather
 * than faked. "Anniversary · Sep 14 (surprise flag)" — `important_dates` is
 * `{label, date, recurring}` (Data-Model §6.1) and there is no surprise flag anywhere in
 * the schema. "Frequent flyer · AAdvantage Platinum" is real but lives in
 * `travel_preference.loyalty_programs`, so it moved to the Preferences card where its data
 * is, and the loyalty NUMBER is deliberately not shown: it is an account credential, and
 * the programme and tier are what a booking needs.
 *
 * THE DIETARY NOTE SITS WITH THE CHIPS, not under them. The closed vocabulary has no slug
 * for an allergy, so a real one arrives in `dietary_notes` — "pescatarian" without
 * "shellfish is a hard no" is worse than useless to whoever books the restaurant.
 */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-label text-[var(--md-on-surface-variant)]">{label}</div>
      <div className="t-body mt-0.5">{value}</div>
    </div>
  );
}

function Stat({ label, value, marked }: { label: string; value: string; marked?: boolean }) {
  return (
    <div className="card p-2.5">
      <div className="t-label text-[var(--md-on-surface-variant)]">{label}</div>
      <div className="t-title-s mt-0.5">
        {value}
        {marked && <sup className="ml-0.5 text-[10px] font-semibold">*</sup>}
      </div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <>
      {items.map((t) => (
        <span key={t} className="chip">
          {t}
        </span>
      ))}
    </>
  );
}

export function ClientOverviewTab({
  client,
  companions,
}: {
  client: ClientOverview;
  companions: ClientCompanion[];
}) {
  const prefs = [
    ...client.preferredDestinations,
    ...client.travelStyles,
    ...client.dietaryRestrictions,
    ...client.accessibilityNeeds,
    ...client.loyaltyPrograms.map((p) => (p.tier ? `${p.program} · ${p.tier}` : p.program)),
  ];

  return (
    <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-3">
        <section className="card p-4">
          <div className="flex items-center">
            <h2 className="t-title-l m-0">{CLIENT_COPY.snapshotTitle}</h2>
            <Link
              href={`/agent/clients/${client.clientId}/edit`}
              className="btn btn-text btn-sm ml-auto"
            >
              Edit
              <span className="sr-only"> {client.displayName}</span>
            </Link>
          </div>

          <div className="mt-2 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            <Field label={CLIENT_COPY.labelPhone} value={client.phone ?? "—"} />
            <Field label={CLIENT_COPY.labelEmail} value={client.email ?? CLIENT_COPY.noEmail} />
            <Field
              label={CLIENT_COPY.labelAddress}
              value={client.addressLine ?? CLIENT_COPY.noAddress}
            />
            <Field label={CLIENT_COPY.labelBirthday} value={client.dateOfBirthLabel ?? "—"} />
            {client.importantDates.length > 0 && (
              <div className="sm:col-span-2">
                <div className="t-label text-[var(--md-on-surface-variant)]">
                  {CLIENT_COPY.labelDates}
                </div>
                <div className="t-body mt-0.5">
                  {client.importantDates
                    .map((d) => (d.date ? `${d.label} · ${d.date.slice(5)}` : d.label))
                    .join(" · ")}
                </div>
              </div>
            )}
            {client.budgetBand && (
              <Field label={CLIENT_COPY.labelBudget} value={client.budgetBand} />
            )}
          </div>

          {client.snapshotNote && (
            <p className="t-body-s mt-3 border-t border-[var(--md-outline-variant)] pt-2.5 text-[var(--md-on-surface-variant)]">
              {client.snapshotNote}
            </p>
          )}

          {client.emergencyContact && (
            <div className="mt-3 border-t border-[var(--md-outline-variant)] pt-2.5">
              <div className="t-label text-[var(--md-on-surface-variant)]">
                {CLIENT_COPY.emergencyTitle}
              </div>
              <div className="t-body mt-0.5">
                {[
                  client.emergencyContact.name,
                  client.emergencyContact.relationship,
                  client.emergencyContact.phone,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="t-title-l m-0 mb-2">{CLIENT_COPY.preferencesTitle}</h2>
          {prefs.length === 0 && !client.dietaryNote && !client.accessibilityNote ? (
            <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
              {CLIENT_COPY.noPreferences}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Chips items={prefs} />
              </div>
              {/* The half the chips cannot carry. */}
              {(client.dietaryNote || client.accessibilityNote) && (
                <div className="mt-2.5 flex flex-col gap-1">
                  {client.dietaryNote && (
                    <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
                      {client.dietaryNote}
                    </p>
                  )}
                  {client.accessibilityNote && (
                    <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
                      {client.accessibilityNote}
                    </p>
                  )}
                </div>
              )}
              {client.favouritePastTrips && (
                <p className="t-body-s mt-2.5 border-t border-[var(--md-outline-variant)] pt-2.5 text-[var(--md-on-surface-variant)]">
                  {client.favouritePastTrips}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={CLIENT_COPY.statLifetime}
            value={client.lifetimeLabel ?? CLIENT_COPY.noLifetime}
            marked={client.lifetimeCurrencyCount > 1}
          />
          <Stat
            label={CLIENT_COPY.statTrips}
            value={
              client.activeTripCount > 0
                ? `${client.tripCount} · ${client.activeTripCount} active`
                : String(client.tripCount)
            }
          />
          <Stat
            label={CLIENT_COPY.statCommission}
            value={client.commissionLabel ?? CLIENT_COPY.noLifetime}
            marked={client.lifetimeCurrencyCount > 1}
          />
          <Stat
            label={CLIENT_COPY.statLastContact}
            value={client.lastContactLabel ?? "—"}
          />
        </div>

        {client.lifetimeCurrencyCount > 1 && (
          <p className="t-body-s m-0 text-[var(--md-on-surface-variant)]">
            <span aria-hidden>* </span>
            {CLIENT_COPY.currencyNoteOne}
          </p>
        )}

        <section className="card p-3.5">
          <h2 className="t-title-s m-0">{CLIENT_COPY.householdTitle}</h2>
          {companions.length === 0 ? (
            <p className="t-body-s mt-1.5 m-0 text-[var(--md-on-surface-variant)]">
              {CLIENT_COPY.noHousehold}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {companions.map((c) => (
                <li key={c.companionId} className="flex items-center gap-2.5">
                  <Avatar initials={c.initials} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="t-body-s block truncate">
                      {c.name}
                      {c.relationship ? ` · ${c.relationship}` : ""}
                    </span>
                    {c.passportExpiryLabel && (
                      <span
                        className={
                          c.passportExpiringSoon
                            ? "t-body-s block text-[var(--md-warning)]"
                            : "t-body-s block text-[var(--md-on-surface-variant)]"
                        }
                      >
                        Passport {c.passportExpiryLabel}
                        {c.passportExpiringSoon ? ` · ${CLIENT_COPY.passportExpiringSoon}` : ""}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
