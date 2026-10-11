"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import NativeSelect from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { createLineAction, updateLineAction } from "@/app/(agent)/agent/commission/ledger/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputSx, fieldLabelSx } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import {
  PAYMENT_TERMS_OPTIONS,
  previewExpectedCents,
  type LineFormState,
  type LineValues,
  type SupplierPrefill,
} from "@/lib/agent/commissionForm";
import { COMMISSION_COPY, commissionPrefilledFrom } from "@/lib/agent/content";
import { centsToDollars } from "@/lib/agent/payments";
import type { SupplierGroup } from "@/lib/agent/tripBuilder";
import { formatTripMoney } from "@/lib/trips/money";

/**
 * §3.7.4 Add and §3.7.3 Edit — one form, the fields A373 / A374 draw.
 *
 * EXPECTED IS NOT A FIELD. The artboards draw it as an input; here it is a read-out of
 * gross × rate, because the server computes the stored figure itself and refuses one that
 * disagrees (`commission_expected_matches_rate`). An editable box whose value is thrown away
 * would be a lie about what saving does.
 *
 * UNCONTROLLED INPUTS, RE-SEEDED FROM STATE. React 19 resets a form after its action runs,
 * whatever the action returned; the action echoes the submitted values back and they become
 * the inputs' defaults, which is the §3.4.15 milestone form's answer to the same trap. Only
 * the preview reads the inputs live.
 *
 * THE SUPPLIER FILLS IN WHAT IT KNOWS — on ADD only, and only into fields nobody has typed
 * in: the supplier's usual rate and terms, then, if this trip has bookings with that
 * supplier, their summed cost as gross and their rate. On edit, changing the supplier changes
 * nothing else: a line's figures are what Inteletravel was told, not a supplier default.
 */

type Mode =
  | { kind: "create"; tripId: string; prefill: Record<string, SupplierPrefill> }
  | { kind: "edit"; tripId: string; commissionId: string; version: number };

export function CommissionLineForm({
  mode,
  suppliers,
  initial,
  statusOptions,
  currency,
  cancelHref,
}: {
  mode: Mode;
  suppliers: SupplierGroup[];
  initial: LineValues;
  statusOptions: readonly { value: string; label: string }[];
  currency: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<LineFormState, FormData>(
    mode.kind === "create" ? createLineAction : updateLineAction,
    {},
  );
  const values = state.values ?? initial;
  const err = (name: keyof LineValues) => state.fieldErrors?.[name];

  // The preview's own copy of the two inputs it multiplies. Seeded from the defaults so it
  // is right before anyone types, and kept in step by onChange.
  const [gross, setGross] = useState(values.gross);
  const [rate, setRate] = useState(values.rate);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const grossRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  // Which fields the advisor has typed in. A prefill never overwrites one of these.
  const touched = useRef(new Set<string>());

  const expected = previewExpectedCents(gross, rate);

  function onSupplierChange(supplierId: string) {
    if (mode.kind !== "create") return;
    const option = suppliers.flatMap((g) => g.suppliers).find((s) => s.supplierId === supplierId);
    const fromTrip = mode.prefill[supplierId];

    const put = (key: string, el: HTMLInputElement | HTMLSelectElement | null, value: string, set?: (v: string) => void) => {
      if (!el || touched.current.has(key)) return;
      el.value = value;
      set?.(value);
    };

    if (fromTrip) {
      put("gross", grossRef.current, centsToDollars(fromTrip.grossCents), setGross);
      if (fromTrip.rate !== null) put("rate", rateRef.current, String(fromTrip.rate), setRate);
      setPrefillNote(option ? commissionPrefilledFrom(option.name) : null);
    } else {
      setPrefillNote(null);
    }
    if (option?.defaultCommissionPct != null && !(fromTrip && fromTrip.rate !== null)) {
      put("rate", rateRef.current, String(Number(option.defaultCommissionPct)), setRate);
    }
    // Looked up by id: the Field / SelectField primitives do not forward a ref, and these two
    // are only ever written here, on a supplier change.
    const terms = document.getElementById("line-terms") as HTMLSelectElement | null;
    const lag = document.getElementById("line-lag") as HTMLInputElement | null;
    if (option?.paymentTerms) put("paymentTerms", terms, option.paymentTerms);
    if (option?.paymentLagDays != null) put("paymentLagDays", lag, String(option.paymentLagDays));
  }

  const supplierError = err("supplierId");
  const grossError = err("gross");
  const rateError = err("rate");
  const noSuppliers = suppliers.every((g) => g.suppliers.length === 0);

  return (
    <Box component="form" action={formAction}>
      <input type="hidden" name="tripId" value={mode.tripId} />
      {mode.kind === "edit" && (
        <>
          <input type="hidden" name="commissionId" value={mode.commissionId} />
          <input type="hidden" name="version" value={mode.version} />
        </>
      )}

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}
      {noSuppliers && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="info">{COMMISSION_COPY.noSuppliers}</Alert>
        </Box>
      )}

      <Box sx={GRID_SX}>
        {/* The supplier picker by hand: SelectField takes flat options and this one is grouped
            by kind, the way the §3.4 component sheets group it. */}
        <FormControl fullWidth required error={Boolean(supplierError)} sx={SPAN_2}>
          <FormLabel htmlFor="line-supplier" sx={fieldLabelSx}>
            {COMMISSION_COPY.supplierLabel}
          </FormLabel>
          <NativeSelect
            id="line-supplier"
            name="supplierId"
            defaultValue={values.supplierId}
            required
            onChange={(e) => onSupplierChange(e.target.value)}
            input={<OutlinedInput size="small" sx={fieldInputSx} />}
            inputProps={{
              "aria-invalid": supplierError ? true : undefined,
              "aria-describedby": supplierError ? "line-supplier-error" : undefined,
            }}
          >
            <option value="">{COMMISSION_COPY.supplierPlaceholder}</option>
            {suppliers.map((g) => (
              <optgroup key={g.kindLabel} label={g.kindLabel}>
                {g.suppliers.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>{s.name}</option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
          {supplierError && (
            <FormHelperText id="line-supplier-error" role="alert">{supplierError}</FormHelperText>
          )}
          {prefillNote && !supplierError && <FormHelperText>{prefillNote}</FormHelperText>}
        </FormControl>

        <MoneyInput
          id="line-gross"
          name="gross"
          label={COMMISSION_COPY.grossLabel}
          hint={COMMISSION_COPY.grossHint}
          error={grossError}
          defaultValue={values.gross}
          inputRef={grossRef}
          onChange={(v) => { touched.current.add("gross"); setGross(v); }}
        />

        <FormControl fullWidth error={Boolean(rateError)}>
          <FormLabel htmlFor="line-rate" sx={fieldLabelSx}>{COMMISSION_COPY.rateLabel}</FormLabel>
          <OutlinedInput
            id="line-rate"
            name="rate"
            defaultValue={values.rate}
            inputRef={rateRef}
            size="small"
            endAdornment={<Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>%</Typography>}
            onChange={(e) => { touched.current.add("rate"); setRate(e.target.value); }}
            sx={fieldInputSx}
            inputProps={{
              inputMode: "decimal",
              "aria-invalid": rateError ? true : undefined,
              "aria-describedby": rateError ? "line-rate-error" : "line-rate-hint",
            }}
          />
          {rateError
            ? <FormHelperText id="line-rate-error" role="alert">{rateError}</FormHelperText>
            : <FormHelperText id="line-rate-hint">{COMMISSION_COPY.rateHint}</FormHelperText>}
        </FormControl>

        {/* A read-out, not an input — see the header. `output` names its inputs for AT. */}
        <Box>
          <Typography component="span" sx={{ ...fieldLabelSx, color: "text.secondary" }}>
            {COMMISSION_COPY.expectedLabel}
          </Typography>
          <Box
            component="output"
            htmlFor="line-gross line-rate"
            sx={{ display: "flex", alignItems: "center", minHeight: 44, fontFamily: "mono", fontWeight: 700, color: "primary.main" }}
          >
            {expected === null ? "—" : formatTripMoney(expected, currency)}
          </Box>
          <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
            {COMMISSION_COPY.expectedHint}
          </Typography>
        </Box>

        {/* Its own full-width row: beside another field the select was squeezed to nothing
            once the detail page's 320px aside took its share. */}
        <Box sx={{ ...SPAN_2, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 8rem)", gap: 1 }}>
          <SelectField
            id="line-terms"
            name="paymentTerms"
            label={COMMISSION_COPY.termsLabel}
            defaultValue={values.paymentTerms}
            options={PAYMENT_TERMS_OPTIONS}
            onChange={() => touched.current.add("paymentTerms")}
          />
          <Field
            id="line-lag"
            name="paymentLagDays"
            label={COMMISSION_COPY.lagLabel}
            defaultValue={values.paymentLagDays}
            inputMode="numeric"
            required
            error={err("paymentLagDays")}
            onChange={() => touched.current.add("paymentLagDays")}
          />
        </Box>

        <SelectField
          id="line-status"
          name="status"
          label={COMMISSION_COPY.statusLabel}
          defaultValue={values.status}
          options={statusOptions}
        />

        <Field
          id="line-reference"
          name="inteletravelReference"
          label={COMMISSION_COPY.referenceLabel}
          hint={COMMISSION_COPY.referenceHint}
          defaultValue={values.inteletravelReference}
          maxLength={64}
          error={err("inteletravelReference")}
        />

        <Box sx={SPAN_2}>
          <TextareaField
            id="line-notes"
            name="notes"
            label={COMMISSION_COPY.notesLabel}
            defaultValue={values.notes}
            maxLength={4000}
            rows={3}
          />
        </Box>
      </Box>

      <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Button type="submit" variant="orange" disabled={pending || noSuppliers}>
          {pending ? COMMISSION_COPY.saving : COMMISSION_COPY.saveLine}
        </Button>
        <MuiButton component={Link} href={cancelHref} variant="outlined" color="secondary" sx={BTN}>
          {COMMISSION_COPY.cancel}
        </MuiButton>
      </Box>
    </Box>
  );
}

/** A dollars input in the mono face, with the Field primitive's hint/error wiring. */
function MoneyInput({
  id,
  name,
  label,
  hint,
  error,
  defaultValue,
  inputRef,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange?: (value: string) => void;
}) {
  return (
    <FormControl fullWidth error={Boolean(error)}>
      <FormLabel htmlFor={id} sx={fieldLabelSx}>{label}</FormLabel>
      <OutlinedInput
        id={id}
        name={name}
        defaultValue={defaultValue}
        inputRef={inputRef}
        placeholder="0.00"
        size="small"
        startAdornment={<Typography component="span" variant="body2" sx={{ color: "text.secondary", mr: 0.5 }}>$</Typography>}
        onChange={(e) => onChange?.(e.target.value)}
        sx={{ ...fieldInputSx, fontFamily: "mono" }}
        inputProps={{
          inputMode: "decimal",
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
        }}
      />
      {error
        ? <FormHelperText id={`${id}-error`} role="alert">{error}</FormHelperText>
        : hint && <FormHelperText id={`${id}-hint`}>{hint}</FormHelperText>}
    </FormControl>
  );
}

export { MoneyInput };

/** The legacy `.btn` box on an MUI Button: 40px tall, 24px sides. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** Two columns from `sm`, one on a phone. Tracks are minmax(0, 1fr) so a long value shrinks. */
const GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
  gap: 1.5,
} as const;

const SPAN_2 = { gridColumn: { sm: "span 2" } } as const;
