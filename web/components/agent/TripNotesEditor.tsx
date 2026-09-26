"use client";

import { useState, useTransition } from "react";

import { updateTripNotes } from "@/app/(agent)/agent/trips/[tripId]/actions";
import { AGENT_COPY } from "@/lib/agent/content";

/**
 * Screen 3.4.2's Notes tab. Same shape as `StageMenu.tsx`: the server action is imported
 * directly rather than passed as a prop (a plain function in a `"use client"` prop object
 * typechecks and throws at runtime across the RSC boundary), and a 409 is its own state
 * rather than a substring of the failure message.
 */
export function TripNotesEditor({
  tripId,
  initialNotes,
  initialVersion,
}: {
  tripId: string;
  initialNotes: string | null;
  initialVersion: number;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [version, setVersion] = useState(initialVersion);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);

  function onSave() {
    setError(null);
    setStale(false);
    setSaved(false);
    startTransition(async () => {
      const result = await updateTripNotes({ tripId, notes: value, expectedVersion: version });
      if (!result.ok) {
        setStale(result.stale === true);
        setError(result.message);
        return;
      }
      // The server's own version, not `version + 1` — a no-op save (submitted text matched
      // what was already stored) leaves `trip.version` untouched, and assuming otherwise
      // goes stale against your own unchanged save on the very next edit.
      setVersion(result.version);
      setSaved(true);
    });
  }

  return (
    <div>
      <label className="sr-only" htmlFor="trip-notes">
        Trip notes
      </label>
      <textarea
        id="trip-notes"
        className="input min-h-32 w-full resize-y p-3"
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder={AGENT_COPY.tripNotesPlaceholder}
      />
      <div className="mt-2 flex items-center gap-3">
        {/* DISABLED ONCE STALE, not just while pending. After a 409 the version in hand is
            the one the server already rejected, so a second click resubmits it and 409s
            again — a button that can only fail. The copy says to reload; this stops the
            control from offering a way to not do that. */}
        <button
          type="button"
          className="btn btn-tonal btn-sm"
          disabled={pending || stale}
          onClick={onSave}
        >
          {AGENT_COPY.notesSaveLabel}
        </button>
        {saved && !error && (
          <span className="t-body-s text-[var(--md-on-surface-variant)]">
            {AGENT_COPY.notesSavedLabel}
          </span>
        )}
        {error && (
          <p className="t-body-s text-[var(--md-error)]" role="alert">
            {stale ? AGENT_COPY.notesStale : error}
          </p>
        )}
      </div>
    </div>
  );
}
