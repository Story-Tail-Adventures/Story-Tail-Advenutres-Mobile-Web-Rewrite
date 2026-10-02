"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { updateTripNotes } from "@/app/(agent)/agent/trips/[tripId]/actions";
import { Button } from "@/components/ui/Button";
import { AGENT_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

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
      <Box component="label" htmlFor="trip-notes" sx={VISUALLY_HIDDEN}>
        Trip notes
      </Box>
      {/* A plain native textarea inside MUI's outline (`inputComponent="textarea"`, as the
          Textarea primitive does), so it keeps a fixed box and the drag handle the legacy
          `resize-y` gave it. Five rows is the old `min-h-32`. */}
      <OutlinedInput
        id="trip-notes"
        fullWidth
        multiline
        inputComponent="textarea"
        rows={5}
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder={AGENT_COPY.tripNotesPlaceholder}
        sx={{ "& textarea": { resize: "vertical" } }}
      />
      <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
        {/* DISABLED ONCE STALE, not just while pending. After a 409 the version in hand is
            the one the server already rejected, so a second click resubmits it and 409s
            again — a button that can only fail. The copy says to reload; this stops the
            control from offering a way to not do that. */}
        <Button type="button" variant="tonal" size="sm" disabled={pending || stale} onClick={onSave}>
          {AGENT_COPY.notesSaveLabel}
        </Button>
        {saved && !error && (
          <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
            {AGENT_COPY.notesSavedLabel}
          </Typography>
        )}
        {error && (
          <Typography component="p" variant="body2" role="alert" sx={{ color: "error.main" }}>
            {stale ? AGENT_COPY.notesStale : error}
          </Typography>
        )}
      </Box>
    </div>
  );
}
