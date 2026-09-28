"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { saveComponentAction } from "@/app/(agent)/agent/trips/[tripId]/builder/actions";
import { Icon } from "@/components/ui/Icon";
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
 * NOT A MODAL. The prototype draws one, over a dimmed backdrop. A `<dialog>` would put the
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
 */
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
    <form action={formAction} className="card p-4">
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

      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]">
          <Icon name={spec.icon} size={17} />
        </span>
        <div className="min-w-0">
          <p className="t-label-s text-[var(--brand-orange)]">
            {isEdit ? BUILDER_COPY.editHeading : BUILDER_COPY.addHeading}
          </p>
          <h2 className="t-title-l m-0 truncate">
            {isEdit ? spec.shortLabel : spec.addLabel}
          </h2>
        </div>
      </div>

      {state.formError && (
        <p
          role="alert"
          className="t-body-s mb-3 rounded-xl bg-[var(--md-error-container)] px-3 py-2 text-[var(--md-on-error-container)]"
        >
          {state.formError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <Field
            name="displayName"
            label={spec.nameLabel}
            defaultValue={values.displayName}
            placeholder={spec.namePlaceholder}
            required
            maxLength={200}
            error={err("displayName")}
          />
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {BUILDER_COPY.nameHint}
          </p>
        </div>

        {/* ── Supplier ─────────────────────────────────────────────── */}
        <div>
          <label className="field-label" htmlFor="component-supplier">
            {BUILDER_COPY.supplierLabel}
          </label>
          <select
            id="component-supplier"
            name="supplierId"
            defaultValue={values.supplierId}
            onChange={(e) => onSupplierChange(e.target.value)}
            className="input h-10 w-full rounded-xl px-3"
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
          </select>
          <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
            {BUILDER_COPY.supplierHint}
          </p>
        </div>

        {/* ── The shared columns this kind shows ───────────────────── */}
        {spec.columns.location && (
          <Field
            name="location"
            label={spec.columns.location}
            defaultValue={values.location}
            maxLength={200}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          {spec.columns.startDate && (
            <Field
              name="startDate"
              type="date"
              label={spec.columns.startDate}
              defaultValue={values.startDate}
            />
          )}
          {spec.columns.endDate && (
            <Field
              name="endDate"
              type="date"
              label={spec.columns.endDate}
              defaultValue={values.endDate}
              error={err("endDate")}
            />
          )}
          {spec.columns.startTime && (
            <Field
              name="startTime"
              type="time"
              label={spec.columns.startTime}
              defaultValue={values.startTime}
            />
          )}
          {spec.columns.endTime && (
            <Field
              name="endTime"
              type="time"
              label={spec.columns.endTime}
              defaultValue={values.endTime}
            />
          )}
        </div>

        {spec.columns.confirmationNumber && (
          <Field
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
            <label key={field.key} className="t-body-s flex items-center gap-2">
              <input
                type="checkbox"
                name={`detail.${field.key}`}
                defaultChecked={values.detail[field.key] === "on"}
                className="size-4 accent-[var(--md-primary)]"
              />
              {field.label}
            </label>
          ) : field.kind === "long" ? (
            <div key={field.key}>
              <label className="field-label" htmlFor={`component-detail-${field.key}`}>
                {field.label}
              </label>
              <textarea
                id={`component-detail-${field.key}`}
                name={`detail.${field.key}`}
                rows={3}
                maxLength={2000}
                defaultValue={values.detail[field.key] ?? ""}
                className="input w-full rounded-xl px-3 py-2"
              />
            </div>
          ) : (
            <Field
              key={field.key}
              name={`detail.${field.key}`}
              label={field.label}
              defaultValue={values.detail[field.key] ?? ""}
              maxLength={200}
            />
          ),
        )}

        {/* ── Money ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="cost"
            label={BUILDER_COPY.fieldCost}
            defaultValue={values.cost}
            inputMode="decimal"
            placeholder="0.00"
            mono
            error={err("cost")}
          />
          <Field
            name="commissionPct"
            label={BUILDER_COPY.fieldCommissionPct}
            value={commissionPct}
            onChange={setCommissionPct}
            inputMode="decimal"
            placeholder="0"
            mono
            error={err("commissionPct")}
          />
        </div>
        <p className="t-body-s -mt-1 text-[var(--md-on-surface-variant)]">
          {BUILDER_COPY.costHint}
        </p>
        <Field
          name="commission"
          label={BUILDER_COPY.fieldCommission}
          defaultValue={values.commission}
          inputMode="decimal"
          placeholder="0.00"
          mono
          error={err("commission")}
        />
        <p className="t-body-s -mt-1 text-[var(--md-on-surface-variant)]">
          {BUILDER_COPY.commissionHint}
        </p>

        <p className="t-body-s rounded-xl bg-[var(--md-surface-2)] px-3 py-2 text-[var(--md-on-surface-variant)]">
          <Icon name="info" size={12} /> {BUILDER_COPY.searchDeferred}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-orange">
          {pending ? BUILDER_COPY.saving : BUILDER_COPY.save}
        </button>
        <Link href={`/agent/trips/${tripId}/builder`} className="btn btn-tonal">
          {BUILDER_COPY.cancel}
        </Link>
      </div>
    </form>
  );
}

/**
 * One input, its label and its error.
 *
 * Uncontrolled by default (`defaultValue`) so the browser owns what is typed, and
 * controlled only where something else has to write into it — the commission rate, which
 * the supplier picker fills in. Both shapes rather than making every field controlled:
 * a form of fifteen controlled inputs re-renders the whole sheet on every keystroke.
 */
function Field({
  name,
  label,
  defaultValue,
  value,
  onChange,
  type = "text",
  error,
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
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "decimal";
  mono?: boolean;
}) {
  const id = `component-${name.replace(".", "-")}`;
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        {...(onChange
          ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
          : { defaultValue: defaultValue ?? "" })}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`input h-10 w-full rounded-xl px-3 ${mono ? "font-mono" : ""}`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="t-body-s mt-1 text-[var(--md-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
