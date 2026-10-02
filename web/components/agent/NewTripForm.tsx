"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import OutlinedInput from "@mui/material/OutlinedInput";
import Radio from "@mui/material/Radio";
import Typography from "@mui/material/Typography";

import { createTripAction } from "@/app/(agent)/agent/trips/new/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { NEW_TRIP_COPY, TEMPLATE_COPY } from "@/lib/agent/content";
import {
  EMPTY_NEW_TRIP,
  TRIP_TYPES,
  type NewTripState,
  type TripTypeValue,
} from "@/lib/agent/newTrip";

/**
 * Screen 3.4.3 — pick a shape, pick a client, name it.
 *
 * THE CLIENT PICKER IS A `<datalist>`, NOT A SEARCH-AS-YOU-TYPE. The advisor's whole book is
 * already on the page (it is tens, not thousands), so a live search would be a round trip
 * per keystroke to filter a list the browser can filter itself — and `<datalist>` keeps the
 * control a plain `<input>`, so the form still submits with JavaScript off. When the book
 * outgrows that, §3.3.1's accessor already takes `p_search`.
 *
 * THE TYPE TILES ARE RADIOS, drawn as cards. The prototype draws `<button>`s, which are not
 * a group, not announced as one, and not operable with arrow keys. A `<fieldset>` of radios
 * is the same picture and the right control — the call §3.3.1's status chips made. Which
 * tile reads as chosen is React state since the MUI pass (it was `has-[:checked]` in CSS):
 * the radio inside is still `name="tripType"` and still what the action reads.
 *
 * FIVE TILES, NOT THE PROTOTYPE'S SIX. See `TRIP_TYPES` — "Honeymoon" is not a `trip_type`.
 *
 * "START FROM A TEMPLATE" IS LIVE since §3.4.13 shipped, and renders only when the library
 * has something in it — a picker that opens on nothing is the control §6.4's amendment
 * argues against, and it was disabled for exactly that reason until there were patterns.
 */

/** The legacy `.btn` box on an MUI Button: 40px tall, 24px sides (12px for text), 8px gap. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;
const BTN_TEXT = { minHeight: 40, px: "12px", gap: 1, whiteSpace: "nowrap" } as const;

/** `.t-title-s mb-1 block` — the field headings this form uses above its hint and input. */
const FIELD_HEADING_SX = { display: "block", mb: 0.5, fontWeight: 600 } as const;
const FIELD_HINT_SX = { mb: 0.75, color: "text.secondary" } as const;
const FIELD_ERROR_SX = { mt: 0.5, color: "error.main" } as const;

export function NewTripForm({
  clients,
  presetClientId,
  templates,
}: {
  clients: { id: string; name: string; email: string | null }[];
  presetClientId?: string;
  /**
   * §3.4.13's patterns. A plain array rather than a loader call, because this is a client
   * component and `loadTemplates` reaches `lib/supabase/server.ts` — importing it here
   * would drag `next/headers` into the browser bundle and 500 the route.
   */
  templates: { templateId: string; name: string; shapeLabel: string }[];
}) {
  const [state, formAction, pending] = useActionState<NewTripState, FormData>(
    createTripAction,
    {},
  );

  const values = state.values ?? {
    ...EMPTY_NEW_TRIP,
    clientId: presetClientId ?? "",
  };

  // Which tile is chosen. Starts from the posted value (after a failed submit) or the
  // default, and from then on follows the radio the advisor picks.
  const [tripType, setTripType] = useState<TripTypeValue>(values.tripType);

  // Held here only so the hidden id can follow what was typed. The form still posts without
  // JavaScript: the visible input carries a `list`, and the action reads the id field, which
  // is pre-filled when the page was opened from a client.
  const [clientText, setClientText] = useState(() => {
    const preset = clients.find((c) => c.id === (presetClientId ?? values.clientId));
    return preset ? preset.name : "";
  });

  const matched = clients.find(
    (c) => c.name.toLowerCase() === clientText.trim().toLowerCase(),
  );

  return (
    <Box component="form" action={formAction} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {state.formError && <Alert tone="error">{state.formError}</Alert>}

      {/* ── Type ─────────────────────────────────────────────────────── */}
      <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Typography component="legend" variant="subtitle1" sx={{ p: 0, mb: 1, fontWeight: 600 }}>
          {NEW_TRIP_COPY.typeLabel}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {TRIP_TYPES.map((t) => {
            const on = tripType === t.value;
            return (
              <Card
                key={t.value}
                variant="outlined"
                sx={{
                  borderColor: on ? "primary.main" : "divider",
                  bgcolor: on ? "primary.container" : "background.paper",
                }}
              >
                <Box
                  component="label"
                  sx={{
                    display: "flex",
                    cursor: "pointer",
                    alignItems: "flex-start",
                    gap: 1.5,
                    px: 1.75,
                    py: 1.5,
                  }}
                >
                  <Radio
                    name="tripType"
                    value={t.value}
                    checked={on}
                    onChange={() => setTripType(t.value)}
                    size="small"
                    sx={{ p: 0, mt: 0.25 }}
                  />
                  <Box component="span" sx={{ minWidth: 0 }}>
                    <Typography
                      component="span"
                      variant="subtitle1"
                      sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 600 }}
                    >
                      <Icon name={t.icon} size={13} /> {t.label}
                    </Typography>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ mt: 0.25, display: "block", color: "text.secondary" }}
                    >
                      {t.hint}
                    </Typography>
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Box>
      </Box>

      {/* ── Client ───────────────────────────────────────────────────── */}
      <div>
        <Typography component="label" variant="subtitle1" htmlFor="trip-client" sx={FIELD_HEADING_SX}>
          {NEW_TRIP_COPY.clientLabel}
        </Typography>
        <Typography component="p" variant="body2" sx={FIELD_HINT_SX}>
          {NEW_TRIP_COPY.clientHint}
        </Typography>
        <OutlinedInput
          id="trip-client"
          value={clientText}
          onChange={(e) => setClientText(e.target.value)}
          placeholder={NEW_TRIP_COPY.clientPlaceholder}
          autoComplete="off"
          size="small"
          fullWidth
          inputProps={{
            list: "trip-client-options",
            "aria-describedby": state.fieldErrors?.clientId ? "trip-client-error" : undefined,
          }}
        />
        <datalist id="trip-client-options">
          {clients.map((c) => (
            <option key={c.id} value={c.name}>
              {c.email ?? ""}
            </option>
          ))}
        </datalist>
        {/* What the action actually reads. Kept in step with the visible field rather than
            parsed out of it, so a name that happens to match two clients cannot pick one
            silently — an unmatched name simply posts no id and the action says so. */}
        <input type="hidden" name="clientId" value={matched?.id ?? (clientText ? "" : values.clientId)} />
        {state.fieldErrors?.clientId && (
          <Typography component="p" id="trip-client-error" role="alert" variant="body2" sx={FIELD_ERROR_SX}>
            {state.fieldErrors.clientId[0]}
          </Typography>
        )}
      </div>

      {/* ── Title ────────────────────────────────────────────────────── */}
      <div>
        <Typography component="label" variant="subtitle1" htmlFor="trip-title" sx={FIELD_HEADING_SX}>
          {NEW_TRIP_COPY.titleLabel}
        </Typography>
        <Typography component="p" variant="body2" sx={FIELD_HINT_SX}>
          {NEW_TRIP_COPY.titleHint}
        </Typography>
        <OutlinedInput
          id="trip-title"
          name="title"
          required
          defaultValue={values.title}
          placeholder={NEW_TRIP_COPY.titlePlaceholder}
          size="small"
          fullWidth
          inputProps={{
            maxLength: 160,
            "aria-describedby": state.fieldErrors?.title ? "trip-title-error" : undefined,
          }}
        />
        {state.fieldErrors?.title && (
          <Typography component="p" id="trip-title-error" role="alert" variant="body2" sx={FIELD_ERROR_SX}>
            {state.fieldErrors.title[0]}
          </Typography>
        )}
      </div>

      {/* ── Travelers ────────────────────────────────────────────────── */}
      <Box sx={{ maxWidth: 220 }}>
        <Typography component="label" variant="subtitle1" htmlFor="trip-travelers" sx={FIELD_HEADING_SX}>
          {NEW_TRIP_COPY.travelersLabel}
        </Typography>
        <Typography component="p" variant="body2" sx={FIELD_HINT_SX}>
          {NEW_TRIP_COPY.travelersHint}
        </Typography>
        <OutlinedInput
          id="trip-travelers"
          name="travelerCount"
          type="number"
          defaultValue={values.travelerCount}
          size="small"
          fullWidth
          inputProps={{ min: 1, max: 64 }}
        />
      </Box>

      {/* §3.4.13's "start from a template", live since 2026-09-28. A `<select>` rather than
          the prototype's button-into-a-picker: there are a handful of patterns, the control
          has to survive JS being off like every other field on this form, and it rides in
          the same FormData as the rest.

          RENDERED ONLY WHEN THERE IS SOMETHING TO PICK. An empty library means a picker
          that opens on nothing, which is the control §6.4's amendment argues against — and
          the empty state on /agent/templates says how to make the first one. */}
      {templates.length > 0 && (
        <SelectField
          id="templateId"
          name="templateId"
          label={NEW_TRIP_COPY.templateLabel}
          defaultValue={values.templateId}
          placeholder={NEW_TRIP_COPY.templateNone}
          options={templates.map((t) => ({
            value: t.templateId,
            label: `${t.name} — ${t.shapeLabel}`,
          }))}
          hint={NEW_TRIP_COPY.templateHint}
        />
      )}

      <Typography
        component="p"
        variant="body2"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          borderRadius: 1,
          bgcolor: "surface.2",
          px: 1.5,
          py: 1,
          color: "text.secondary",
        }}
      >
        <Icon name="info" size={12} /> {NEW_TRIP_COPY.startsAsInquiry}
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Button type="submit" variant="orange" disabled={pending}>
          {pending ? NEW_TRIP_COPY.submitting : NEW_TRIP_COPY.submit}
        </Button>
        <MuiButton component={Link} href="/agent/trips" variant="outlined" color="secondary" sx={BTN}>
          {NEW_TRIP_COPY.cancel}
        </MuiButton>
        <MuiButton component={Link} href="/agent/templates" variant="text" sx={{ ...BTN_TEXT, ml: "auto" }}>
          {TEMPLATE_COPY.navLabel}
        </MuiButton>
      </Box>
    </Box>
  );
}
