"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  createClientAction,
  updateClientAction,
} from "@/app/(agent)/agent/clients/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChipInput } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { COUNTRIES, usesUsAddressLabels } from "@/lib/countries";
import { CLIENT_COPY } from "@/lib/agent/content";
import {
  EMPTY_CLIENT_FORM,
  initialClientFormState,
  type ClientFormValues,
} from "@/lib/agent/clientFormState";

/**
 * Screens 3.3.9 and 3.3.10 — the same form, twice.
 *
 * §3.3.10's own Screen Inventory entry says "Same as Create Client", and it is: the same
 * fields, the same rules, the same schema. What differs is the copy, where the buttons sit
 * (the prototype puts Edit's in the header) and two hidden inputs carrying the id and the
 * version. One component with a `mode` beats two that drift.
 *
 * ── FOUR DEPARTURES FROM THE PROTOTYPE, EACH BECAUSE THE DRAWING CANNOT BE STORED ──
 *
 *  1. ADDRESS IS SIX FIELDS, NOT ONE. The prototype draws a single "Address" input.
 *     `client.mailing_address_id` points at an `address` row with line1, line2, city,
 *     region, postal_code and country, and one text box cannot fill six columns. The
 *     region and postal labels follow the chosen country, the same courtesy §2.1.10 pays —
 *     a Canadian typing their postal code into a box labelled ZIP is being told the form
 *     was not built for them.
 *  2. IMPORTANT DATES ARE A REPEATER, NOT A TEXT INPUT. The prototype draws one box
 *     labelled "Important dates · birthdays, anniversaries". The column is a jsonb array of
 *     `{label, date, recurring}`; a single string cannot produce it, and anything typed
 *     there would be unqueryable prose. Each row is a name, a date and an "every year" box.
 *  3. THE INVITE TOGGLE IS DISABLED WITH ITS REASON. The prototype draws it live and ON.
 *     Nothing in the repository creates a `client_invite` row, no email provider is wired,
 *     and issuing a portal invitation is handing out a bearer credential — it wants its own
 *     expiry, revocation and rate-limit thinking rather than a checkbox on a create form.
 *     §3.9.3 is where emailing a client a one-time link gets built.
 *  4. "SAVE & CREATE TRIP" IS DISABLED. §3.4.3 is not built, so the second half of that
 *     button has nowhere to go. Plain Save is right beside it and does the whole job.
 *
 * TAGS ARE FREE-FORM AND THE SUGGESTIONS COME FROM THE BOOK. `client.tags` has no
 * vocabulary table, so the chips offered are the ones this advisor already uses — read from
 * `agent_client_roster_summary().tag_facets`, the same source the roster's filter chips use.
 *
 * ON MUI (step 2 of the migration, PR 6): the Field / SelectField / TextareaField
 * primitives (labels above inputs, as PR 1 settled), a Card for the body, MUI Chips for the
 * tags — a chosen tag is a filled secondary Chip carrying its hidden `tag` input and a real
 * remove button, a suggestion is an outlined Chip that IS a `<button>` — the ChipInput
 * primitive for the "every year" box, and the Button primitive at the foot. Every field
 * keeps its name, id, error source and aria wiring; a two-column span that used to ride on
 * the Field's className (which Field now puts on the `<input>`) sits on a wrapping Box.
 */

/** The legacy `.btn.btn-text` box on an MUI Button: 40px tall, 12px sides, 8px gap. */
const BTN_TEXT = { minHeight: 40, px: "12px", gap: 1, whiteSpace: "nowrap" } as const;

/** `.t-title-s` section headings on MUI's subtitle1. */
const SECTION_HEADING_SX = { m: 0, fontWeight: 600 } as const;

/** A sentence in the secondary colour under a heading, flush. */
const HINT_SX = { m: 0, color: "text.secondary" } as const;
const ERROR_SX = { m: 0, color: "error.main" } as const;

/** One section of the form: a heading, then its fields 12px apart. */
const SECTION_SX = { display: "flex", flexDirection: "column", gap: 1.5 } as const;

/** The two-up field grid (`grid gap-3 sm:grid-cols-2`). */
const GRID_SX = {
  display: "grid",
  gap: 1.5,
  gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
} as const;

/** A field that spans both columns from `sm` up. */
const SPAN_2_SX = { gridColumn: { sm: "span 2" } } as const;

export function ClientForm({
  mode,
  clientId,
  expectedVersion,
  defaults = EMPTY_CLIENT_FORM,
  suggestedTags = [],
}: {
  mode: "create" | "edit";
  clientId?: string;
  expectedVersion?: number;
  defaults?: ClientFormValues;
  suggestedTags?: string[];
}) {
  const action = mode === "create" ? createClientAction : updateClientAction;
  const [state, formAction, saving] = useActionState(action, initialClientFormState);
  const shown = state.values ?? defaults;

  const [country, setCountry] = useState(shown.addressCountry || "US");
  const usLabels = usesUsAddressLabels(country);

  const [tags, setTags] = useState<string[]>(shown.tags);
  const [newTag, setNewTag] = useState("");
  const [dates, setDates] = useState(shown.importantDates);

  const errors = state.fieldErrors ?? {};
  const first = (key: keyof typeof errors) => errors[key]?.[0];

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag === "" || tags.includes(tag)) return;
    setTags([...tags, tag]);
    setNewTag("");
  }

  return (
    <form action={formAction} noValidate>
      {/* Everything inert while the save is in flight, the same guard §2.1's forms use:
          without it the Enter key in any input fires a second submit, and this endpoint
          writes an `audit_event` on every call. */}
      <Box
        component="fieldset"
        disabled={saving}
        sx={{ m: 0, p: 0, border: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 }}
      >
        {mode === "edit" && (
          <>
            <input type="hidden" name="clientId" value={clientId ?? ""} />
            {/* The optimistic lock. `agent_update_client` answers `stale` when it has
                moved, which is a 409 and the one failure the transport types. */}
            <input type="hidden" name="expectedVersion" value={expectedVersion ?? 0} />
          </>
        )}

        {state.formError && <Alert tone="error">{state.formError}</Alert>}

        <Card>
          <CardContent sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Box component="section" sx={SECTION_SX}>
              <Typography component="h2" variant="subtitle1" sx={SECTION_HEADING_SX}>
                {CLIENT_COPY.groupBasics}
              </Typography>
              <Box sx={GRID_SX}>
                <Field
                  id="firstName" name="firstName" label={CLIENT_COPY.labelFirstName}
                  defaultValue={shown.firstName} error={first("firstName")}
                  required autoComplete="given-name"
                />
                <Field
                  id="lastName" name="lastName" label={CLIENT_COPY.labelLastName}
                  defaultValue={shown.lastName} error={first("lastName")}
                  required autoComplete="family-name"
                />
                <Box sx={SPAN_2_SX}>
                  <Field
                    id="preferredName" name="preferredName"
                    label={CLIENT_COPY.labelPreferredName}
                    hint={CLIENT_COPY.hintPreferredName}
                    defaultValue={shown.preferredName} error={first("preferredName")}
                  />
                </Box>
              </Box>
            </Box>

            <Box component="section" sx={SECTION_SX}>
              <Typography component="h2" variant="subtitle1" sx={SECTION_HEADING_SX}>
                {CLIENT_COPY.groupContact}
              </Typography>
              <Box sx={GRID_SX}>
                <Box sx={SPAN_2_SX}>
                  <Field
                    id="email" name="email" type="email" label={CLIENT_COPY.labelEmail}
                    defaultValue={shown.email} error={first("email")}
                    required autoComplete="email"
                  />
                </Box>
                {/* A duplicate is not just refused — the form offers the record that already
                    exists, which is the whole reason the Edge Function answers 200. */}
                {state.duplicateClientId && (
                  <Typography component="p" variant="body2" sx={{ m: 0, ...SPAN_2_SX }}>
                    <MuiLink
                      component={Link}
                      href={`/agent/clients/${state.duplicateClientId}`}
                      underline="always"
                      color="inherit"
                    >
                      {CLIENT_COPY.duplicateEmailLink}
                    </MuiLink>
                  </Typography>
                )}
                <Field
                  id="phone" name="phone" type="tel" label={CLIENT_COPY.labelPhone}
                  defaultValue={shown.phone} error={first("phone")} autoComplete="tel"
                />
                <Field
                  id="dateOfBirth" name="dateOfBirth" type="date"
                  label={CLIENT_COPY.labelBirthday}
                  defaultValue={shown.dateOfBirth} error={first("dateOfBirth")}
                />
              </Box>
            </Box>

            <Box component="section" sx={SECTION_SX}>
              <Typography component="h2" variant="subtitle1" sx={SECTION_HEADING_SX}>
                {CLIENT_COPY.groupAddress}
              </Typography>
              <Box sx={GRID_SX}>
                <Box sx={SPAN_2_SX}>
                  <Field
                    id="addressLine1" name="addressLine1" label="Street address"
                    defaultValue={shown.addressLine1} error={first("addressLine1")}
                    autoComplete="address-line1"
                  />
                </Box>
                <Box sx={SPAN_2_SX}>
                  <Field
                    id="addressLine2" name="addressLine2" label="Apt, suite, etc."
                    defaultValue={shown.addressLine2} error={first("addressLine2")}
                    autoComplete="address-line2"
                  />
                </Box>
                <Field
                  id="addressCity" name="addressCity" label="City"
                  defaultValue={shown.addressCity} error={first("addressCity")}
                  autoComplete="address-level2"
                />
                <Field
                  id="addressRegion" name="addressRegion"
                  label={usLabels ? "State" : "Region"}
                  defaultValue={shown.addressRegion} error={first("addressRegion")}
                  autoComplete="address-level1"
                />
                <Field
                  id="addressPostalCode" name="addressPostalCode"
                  label={usLabels ? "ZIP code" : "Postal code"}
                  defaultValue={shown.addressPostalCode} error={first("addressPostalCode")}
                  autoComplete="postal-code"
                />
                <SelectField
                  id="addressCountry" name="addressCountry" label="Country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  error={first("addressCountry")}
                  options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                />
              </Box>
            </Box>

            <Box component="section" sx={SECTION_SX}>
              <Typography component="h2" variant="subtitle1" sx={SECTION_HEADING_SX}>
                {CLIENT_COPY.groupTags}
              </Typography>
              <Typography component="p" variant="body2" sx={HINT_SX}>
                {CLIENT_COPY.hintTags}
              </Typography>
              {/* Each chosen tag posts as its own `tag` input; the action reads them with
                  getAll. A hidden input rather than a checkbox because the set is built by
                  typing as well as picking. */}
              <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
                {tags.map((t) => (
                  <Chip
                    key={t}
                    color="secondary"
                    label={
                      <>
                        <input type="hidden" name="tag" value={t} />
                        {t}
                        <IconButton
                          size="small"
                          color="inherit"
                          aria-label={`Remove tag ${t}`}
                          onClick={() => setTags(tags.filter((x) => x !== t))}
                          sx={{ ml: 0.5, p: 0.25 }}
                        >
                          <Icon name="close" size={11} />
                        </IconButton>
                      </>
                    }
                    sx={{ "& .MuiChip-label": { display: "inline-flex", alignItems: "center" } }}
                  />
                ))}
                {suggestedTags
                  .filter((t) => !tags.includes(t))
                  .map((t) => (
                    <Chip
                      key={t}
                      component="button"
                      type="button"
                      clickable
                      variant="outlined"
                      label={`+ ${t}`}
                      onClick={() => addTag(t)}
                    />
                  ))}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <OutlinedInput
                  size="small"
                  placeholder={CLIENT_COPY.newTagPlaceholder}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  // Enter adds the tag rather than submitting the form — on a form with a
                  // required email above, a stray Enter here would otherwise fire a save.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(newTag);
                    }
                  }}
                  inputProps={{ "aria-label": CLIENT_COPY.newTagPlaceholder }}
                  sx={{ maxWidth: 220 }}
                />
                <Button type="button" variant="tonal" size="sm" onClick={() => addTag(newTag)}>
                  {CLIENT_COPY.addTag}
                </Button>
              </Box>
              {first("tags") && (
                <Typography component="p" variant="body2" sx={ERROR_SX}>{first("tags")}</Typography>
              )}
            </Box>

            <Box component="section" sx={SECTION_SX}>
              <Typography component="h2" variant="subtitle1" sx={SECTION_HEADING_SX}>
                {CLIENT_COPY.groupDates}
              </Typography>
              <Typography component="p" variant="body2" sx={HINT_SX}>
                {CLIENT_COPY.hintDates}
              </Typography>
              {dates.map((d, i) => (
                <Box
                  key={i}
                  sx={{
                    display: "grid",
                    alignItems: "end",
                    gap: 1,
                    gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) auto auto auto" },
                  }}
                >
                  <Field
                    id={`dateLabel-${i}`} name="dateLabel" label={CLIENT_COPY.labelDateLabel}
                    defaultValue={d.label}
                  />
                  <Field
                    id={`dateValue-${i}`} name="dateValue" type="date"
                    label={CLIENT_COPY.labelDateValue} defaultValue={d.date}
                  />
                  <Box sx={{ mb: 0.5 }}>
                    <ChipInput
                      type="checkbox" name="dateRecurring" value={String(i)}
                      defaultChecked={d.recurring}
                      label={CLIENT_COPY.labelDateRecurring}
                    />
                  </Box>
                  <Box sx={{ mb: 0.5 }}>
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      onClick={() => setDates(dates.filter((_, j) => j !== i))}
                    >
                      {CLIENT_COPY.removeDate}
                    </Button>
                  </Box>
                </Box>
              ))}
              {first("importantDates") && (
                <Typography component="p" variant="body2" sx={ERROR_SX}>{first("importantDates")}</Typography>
              )}
              <Box sx={{ alignSelf: "flex-start" }}>
                <Button
                  type="button"
                  variant="tonal"
                  size="sm"
                  onClick={() => setDates([...dates, { label: "", date: "", recurring: false }])}
                >
                  <Icon name="plus" size={12} /> {CLIENT_COPY.addDate}
                </Button>
              </Box>
            </Box>

            <Box component="section" sx={SECTION_SX}>
              <Typography component="h2" variant="subtitle1" sx={SECTION_HEADING_SX}>
                {CLIENT_COPY.groupNotes}
              </Typography>
              <TextareaField
                id="notes" name="notes" label={CLIENT_COPY.groupNotes}
                hint={CLIENT_COPY.hintNotes}
                defaultValue={shown.notes} error={first("notes")} rows={3}
              />
            </Box>

            {mode === "create" && (
              <Paper
                elevation={0}
                title={CLIENT_COPY.inviteDeferred}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  p: 1.5,
                  bgcolor: "secondary.container",
                  color: "secondary.onContainer",
                  opacity: 0.6,
                }}
              >
                <Icon name="mail" size={16} />
                <Typography component="span" variant="body2" sx={{ flex: 1 }}>
                  {CLIENT_COPY.inviteLabel}
                </Typography>
                <Typography component="span" variant="body2">
                  {CLIENT_COPY.inviteDeferred}
                </Typography>
              </Paper>
            )}
          </CardContent>
        </Card>

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <MuiButton
            component={Link}
            href={clientId ? `/agent/clients/${clientId}` : "/agent/clients"}
            variant="text"
            color="primary"
            sx={BTN_TEXT}
          >
            {CLIENT_COPY.formCancel}
          </MuiButton>
          <Box sx={{ ml: "auto" }}>
            <Button type="submit" variant="filled">
              {saving ? CLIENT_COPY.formSaving : CLIENT_COPY.formSave}
            </Button>
          </Box>
          {mode === "create" && (
            // Live as of §3.4.3. A SECOND SUBMIT rather than a link: the client does not
            // exist yet, so "and create a trip" can only mean "save this, then take me
            // there with it already picked". Only the pressed button posts its value, so
            // the action learns which of the two was used without any client state.
            <Button type="submit" name="then" value="trip" variant="tonal">
              {CLIENT_COPY.saveAndTrip}
            </Button>
          )}
        </Box>
      </Box>
    </form>
  );
}
