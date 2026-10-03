"use client";

import { useActionState, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import NativeSelect from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { saveComponentAction } from "@/app/(agent)/agent/trips/[tripId]/builder/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Field as UiField, fieldInputSx, fieldLabelSx } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TextareaField } from "@/components/ui/Textarea";
import {
  COMPONENT_COLUMNS,
  COMPONENT_SPECS,
  emptyComponent,
  type ComponentFormState,
  type ComponentKind,
  type ComponentValues,
} from "@/lib/agent/components";
import { BUILDER_COPY } from "@/lib/agent/content";
import type { SupplierGroup } from "@/lib/agent/tripBuilder";

/**
 * §3.4.5 – §3.4.12, all eight of them.
 *
 * ONE COMPONENT, EIGHT SCREENS. The Screen Inventory draws seven "add" sheets and one
 * "edit", and §3.4.12's own entry says *"Same form as the corresponding Add screen,
 * pre-filled"*. They differ only in which fields they show and what those fields are
 * called, which is `COMPONENT_SPECS` — so the difference is data and this is one file.
 * The design prototype reached the same conclusion from the other side: its `CompModal` is
 * a single parametrised component and the eight screens are calls to it.
 *
 * NOT A MODAL. The prototype draws one, over a dimmed backdrop. A dialog would put the
 * form behind JavaScript, and the builder is the screen where an advisor types for an hour
 * — a panel beside the canvas keeps the list they are adding to visible while they do it.
 * It is also what makes edit a plain URL (`?edit=<id>`), which means the browser's back
 * button closes the sheet and a half-typed row survives a refresh as the row it came from.
 *
 * THE SEARCH TAB IS NOT DRAWN AT ALL. §3.4.5, §3.4.6 and §3.4.8 each specify a
 * "Search | Manual" tab pair over Amadeus, Hotelbeds and Viator. All three are Phase 2 and
 * none is wired. A disabled tab is honest when the thing behind it is a planned screen —
 * that is the call §3.4.2's "Account admin" tab got — but a whole search panel rendered
 * dead is half the sheet doing nothing. One line says what is coming instead.
 *
 * ON MUI (step 2 of the migration): the form is a Card, the fields are the shared
 * primitives (Field / DateField / TextareaField, label above the input), the supplier
 * picker is MUI's NativeSelect so it keeps its `<optgroup>`s, and the flags are Checkboxes.
 * Every `name`, `id` and hidden input is the one the server action reads — the jsonb
 * payload keys in particular (`detail.<key>`) must not change.
 */

/** The legacy .btn box (40px, 24px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_MD = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** Two equal columns, as the dates / times / money pairs were laid out. */
const GRID_2 = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 } as const;

/** JetBrains Mono on the input inside a Field — confirmation numbers and money. */
const MONO_INPUT = { "& .MuiInputBase-input": { fontFamily: "mono" } } as const;

export function TripComponentSheet({
  tripId,
  kind,
  suppliers,
  initial,
}: {
  tripId: string;
  kind: ComponentKind;
  suppliers: SupplierGroup[];
  /** Absent for an add; §3.4.12 passes the row being edited. */
  initial?: ComponentValues;
}) {
  const [state, formAction, pending] = useActionState<ComponentFormState, FormData>(
    saveComponentAction,
    {},
  );

  const spec = COMPONENT_SPECS[kind];
  // A rejected submit hands back what was typed; a fresh sheet starts from the row being
  // edited, or from nothing.
  const values = state.values ?? initial ?? emptyComponent(kind);
  const isEdit = values.componentId !== "";

  // Held so picking a supplier can fill in their usual rate. It NEVER overwrites a rate
  // already typed — the default is a convenience, and an advisor who entered 18 because
  // this booking is 18 would not expect it to snap back to 12.
  const [commissionPct, setCommissionPct] = useState(values.commissionPct);

  const flat = suppliers.flatMap((g) => g.suppliers);

  function onSupplierChange(supplierId: string) {
    if (commissionPct.trim() !== "") return;
    const picked = flat.find((s) => s.supplierId === supplierId);
    if (picked?.defaultCommissionPct != null) {
      setCommissionPct(String(picked.defaultCommissionPct));
    }
  }

  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <Card component="form" action={formAction} sx={{ p: 2 }}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="kind" value={kind} />
      {isEdit && <input type="hidden" name="componentId" value={values.componentId} />}

      {/* A COLUMN THIS KIND DOES NOT SHOW STILL HAS TO BE POSTED.
          `agent_upsert_trip_component` writes every column on an update, so anything the
          form leaves out arrives as NULL and clears whatever was there. That is not
          theoretical: the flight sheet had no "Arrives on" field, and saving a seeded
          flight — with no edit at all — emptied its `end_date`. An insurance policy has
          no place and no times, so those three are carried here on every save.

          Carrying them rather than teaching the RPC to distinguish "absent" from "clear"
          keeps the write contract one sentence long: the upsert replaces the row with
          what it was given. The alternative needs a sentinel per column and a reason for
          each one. */}
      {COMPONENT_COLUMNS.filter((col) => !spec.columns[col]).map((col) => (
        <input key={col} type="hidden" name={col} value={values[col]} />
      ))}

      <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1.25 }}>
        <Avatar
          variant="rounded"
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            bgcolor: "primary.container",
            color: "primary.onContainer",
          }}
        >
          <Icon name={spec.icon} size={17} />
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            variant="overline"
            sx={{ display: "block", lineHeight: 1.3, color: "brand.main" }}
          >
            {isEdit ? BUILDER_COPY.editHeading : BUILDER_COPY.addHeading}
          </Typography>
          <Typography component="h2" variant="h5" noWrap>
            {isEdit ? spec.shortLabel : spec.addLabel}
          </Typography>
        </Box>
      </Box>

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}

      {/* `useFlexGap` so a child's own negative margin (the two hints that tuck up under
          their pair of fields) still applies on top of the gap. */}
      <Stack spacing={1.5} useFlexGap>
        <SheetField
          name="displayName"
          label={spec.nameLabel}
          defaultValue={values.displayName}
          placeholder={spec.namePlaceholder}
          required
          maxLength={200}
          error={err("displayName")}
          hint={BUILDER_COPY.nameHint}
        />

        {/* ── Supplier ─────────────────────────────────────────────── */}
        {/* MUI's NativeSelect rather than the SelectField primitive: the groups are
            `<optgroup>`s, which that primitive's flat `options` cannot express. Same label,
            same box, same wiring. */}
        <FormControl fullWidth>
          <FormLabel htmlFor="component-supplier" sx={fieldLabelSx}>
            {BUILDER_COPY.supplierLabel}
          </FormLabel>
          <NativeSelect
            id="component-supplier"
            name="supplierId"
            defaultValue={values.supplierId}
            onChange={(e) => onSupplierChange(e.target.value)}
            input={<OutlinedInput size="small" sx={fieldInputSx} />}
          >
            <option value="">{BUILDER_COPY.supplierNone}</option>
            {suppliers.map((group) => (
              <optgroup key={group.kindLabel} label={group.kindLabel}>
                {group.suppliers.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
          <FormHelperText>{BUILDER_COPY.supplierHint}</FormHelperText>
        </FormControl>

        {/* ── The shared columns this kind shows ───────────────────── */}
        {spec.columns.location && (
          <SheetField
            name="location"
            label={spec.columns.location}
            defaultValue={values.location}
            maxLength={200}
          />
        )}

        <Box sx={GRID_2}>
          {spec.columns.startDate && (
            <DateField
              id="component-startDate"
              name="startDate"
              label={spec.columns.startDate}
              defaultValue={values.startDate}
            />
          )}
          {spec.columns.endDate && (
            <DateField
              id="component-endDate"
              name="endDate"
              label={spec.columns.endDate}
              defaultValue={values.endDate}
              error={err("endDate")}
            />
          )}
          {spec.columns.startTime && (
            <SheetField
              name="startTime"
              type="time"
              label={spec.columns.startTime}
              defaultValue={values.startTime}
            />
          )}
          {spec.columns.endTime && (
            <SheetField
              name="endTime"
              type="time"
              label={spec.columns.endTime}
              defaultValue={values.endTime}
            />
          )}
        </Box>

        {spec.columns.confirmationNumber && (
          <SheetField
            name="confirmationNumber"
            label={spec.columns.confirmationNumber}
            defaultValue={values.confirmationNumber}
            maxLength={80}
            mono
          />
        )}

        {/* ── The kind's own detail ────────────────────────────────── */}
        {spec.detail.map((field) =>
          field.kind === "flag" ? (
            <FormControlLabel
              // The default is in the key: MUI's Checkbox reads `defaultChecked` only at mount,
              // and a failed save swaps `values` from the saved row to what was submitted.
              // Remounting takes the new default instead of a MUI "changing the default
              // checked state" warning.
              key={`${field.key}:${values.detail[field.key] === "on" ? "on" : "off"}`}
              sx={{ m: 0, ml: -1.125 }}
              control={
                <Checkbox
                  size="small"
                  name={`detail.${field.key}`}
                  defaultChecked={values.detail[field.key] === "on"}
                />
              }
              label={field.label}
              slotProps={{ typography: { variant: "body2" } }}
            />
          ) : field.kind === "long" ? (
            <TextareaField
              key={field.key}
              id={`component-detail-${field.key}`}
              name={`detail.${field.key}`}
              label={field.label}
              rows={3}
              maxLength={2000}
              defaultValue={values.detail[field.key] ?? ""}
            />
          ) : (
            <SheetField
              key={field.key}
              name={`detail.${field.key}`}
              label={field.label}
              defaultValue={values.detail[field.key] ?? ""}
              maxLength={200}
            />
          ),
        )}

        {/* ── Money ────────────────────────────────────────────────── */}
        <Box sx={GRID_2}>
          <SheetField
            name="cost"
            label={BUILDER_COPY.fieldCost}
            defaultValue={values.cost}
            inputMode="decimal"
            placeholder="0.00"
            mono
            error={err("cost")}
          />
          <SheetField
            name="commissionPct"
            label={BUILDER_COPY.fieldCommissionPct}
            value={commissionPct}
            onChange={setCommissionPct}
            inputMode="decimal"
            placeholder="0"
            mono
            error={err("commissionPct")}
          />
        </Box>
        <Typography
          component="p"
          variant="caption"
          sx={{ display: "block", mt: -0.5, color: "text.secondary" }}
        >
          {BUILDER_COPY.costHint}
        </Typography>
        <SheetField
          name="commission"
          label={BUILDER_COPY.fieldCommission}
          defaultValue={values.commission}
          inputMode="decimal"
          placeholder="0.00"
          mono
          error={err("commission")}
        />
        <Typography
          component="p"
          variant="caption"
          sx={{ display: "block", mt: -0.5, color: "text.secondary" }}
        >
          {BUILDER_COPY.commissionHint}
        </Typography>

        <Paper
          elevation={0}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 1,
            bgcolor: "surface.2",
            color: "text.secondary",
          }}
        >
          <Icon name="info" size={12} />
          <Typography variant="caption">{BUILDER_COPY.searchDeferred}</Typography>
        </Paper>
      </Stack>

      <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Button type="submit" variant="orange" disabled={pending}>
          {pending ? BUILDER_COPY.saving : BUILDER_COPY.save}
        </Button>
        <MuiButton
          component={NextLink}
          href={`/agent/trips/${tripId}/builder`}
          variant="outlined"
          color="secondary"
          sx={BTN_MD}
        >
          {BUILDER_COPY.cancel}
        </MuiButton>
      </Box>
    </Card>
  );
}

/**
 * One input, its label, its hint and its error — the shared Field primitive with this
 * sheet's id scheme (`component-<name>`, dots to dashes for the payload keys).
 *
 * Uncontrolled by default (`defaultValue`) so the browser owns what is typed, and
 * controlled only where something else has to write into it — the commission rate, which
 * the supplier picker fills in. Both shapes rather than making every field controlled:
 * a form of fifteen controlled inputs re-renders the whole sheet on every keystroke.
 */
function SheetField({
  name,
  label,
  defaultValue,
  value,
  onChange,
  type = "text",
  error,
  hint,
  required,
  maxLength,
  placeholder,
  inputMode,
  mono,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (next: string) => void;
  type?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "decimal";
  mono?: boolean;
}) {
  const id = `component-${name.replace(".", "-")}`;
  const field = (
    <UiField
      id={id}
      name={name}
      label={label}
      type={type}
      required={required}
      maxLength={maxLength}
      placeholder={placeholder}
      inputMode={inputMode}
      error={error}
      hint={hint}
      {...(onChange
        ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
        : { defaultValue: defaultValue ?? "" })}
    />
  );
  return mono ? <Box sx={MONO_INPUT}>{field}</Box> : field;
}
