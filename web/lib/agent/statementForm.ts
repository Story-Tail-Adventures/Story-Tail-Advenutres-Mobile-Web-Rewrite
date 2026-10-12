import { STATEMENT_COPY, statementFieldTwice } from "@/lib/agent/content";

/**
 * §3.7.5 / §3.7.6's form rules — server-free, so the client forms and the server actions
 * share them, as `commissionForm.ts` is for the line forms.
 *
 * The Edge Function (`_shared/statement.ts`) checks the same rules again. This layer exists so
 * the advisor reads the sentence against the right field instead of a rejection at the top.
 */

/** The platform fields a statement column can hold, in the order the select offers them. */
export const STATEMENT_FIELDS = [
  { value: "reference", label: STATEMENT_COPY.fieldReference },
  { value: "supplier", label: STATEMENT_COPY.fieldSupplier },
  { value: "traveler", label: STATEMENT_COPY.fieldTraveler },
  { value: "gross", label: STATEMENT_COPY.fieldGross },
  { value: "received", label: STATEMENT_COPY.fieldReceived },
  { value: "fee", label: STATEMENT_COPY.fieldFee },
  { value: "paid_on", label: STATEMENT_COPY.fieldPaidOn },
] as const;

export type StatementField = (typeof STATEMENT_FIELDS)[number]["value"];

const FIELD_LABEL = new Map<string, string>(STATEMENT_FIELDS.map((f) => [f.value, f.label]));

export function isStatementField(value: string): value is StatementField {
  return FIELD_LABEL.has(value);
}

/** The select's options: every field, then "ignore" as the empty value. */
export const COLUMN_OPTIONS = [
  { value: "", label: STATEMENT_COPY.ignoreColumn },
  ...STATEMENT_FIELDS.map((f) => ({ value: f.value, label: f.label })),
];

/**
 * One choice per HEADER (the prototype's shape: CSV column → platform field), from the
 * stored map, which is field → header index.
 */
export function selectionsFromMap(map: Record<string, number> | null, headerCount: number): string[] {
  const out = Array.from({ length: headerCount }, () => "");
  for (const [field, idx] of Object.entries(map ?? {})) {
    if (isStatementField(field) && Number.isInteger(idx) && idx >= 0 && idx < headerCount) out[idx] = field;
  }
  return out;
}

export type MapValues = { selections: string[]; statementDate: string };

export type MapFormState = {
  formError?: string;
  fieldErrors?: { map?: string; statementDate?: string };
  values?: MapValues;
};

/**
 * The selections back as field → header index, or the first thing wrong with them: a field on
 * two columns, no commission column, or neither a paid-on column nor a statement date.
 */
export function validateMap(
  values: MapValues,
): { ok: true; columnMap: Partial<Record<StatementField, number>>; statementDate: string | null }
  | { ok: false; fieldErrors: NonNullable<MapFormState["fieldErrors"]> } {
  const columnMap: Partial<Record<StatementField, number>> = {};
  for (const [idx, field] of values.selections.entries()) {
    if (field === "" || !isStatementField(field)) continue;
    if (columnMap[field] !== undefined) {
      return { ok: false, fieldErrors: { map: statementFieldTwice(FIELD_LABEL.get(field) ?? field) } };
    }
    columnMap[field] = idx;
  }
  if (columnMap.received === undefined) {
    return { ok: false, fieldErrors: { map: STATEMENT_COPY.mapNeedsReceived } };
  }
  const date = values.statementDate.trim();
  if (columnMap.paid_on === undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, fieldErrors: { statementDate: STATEMENT_COPY.mapNeedsDate } };
  }
  return { ok: true, columnMap, statementDate: columnMap.paid_on === undefined ? date : null };
}

/** The map form's fields: `col-0`, `col-1`, … and `statementDate`. */
export function mapValuesFromForm(form: FormData, headerCount: number): MapValues {
  return {
    selections: Array.from({ length: headerCount }, (_, i) => (form.get(`col-${i}`) ?? "").toString()),
    statementDate: (form.get("statementDate") ?? "").toString(),
  };
}

export type UploadState = { formError?: string; duplicateHref?: string };

/** `action` is which form asked, so the refusal shows in that form's card. */
export type StatementActionState = { formError?: string; action?: string };

/** A posted header count, clamped: it sizes an array, and a hidden field can be edited. */
export function clampHeaderCount(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null;
}

/** Half a megabyte: the Edge Function's cap, and well under the 1 MB server action body. */
export const MAX_STATEMENT_BYTES = 512 * 1024;
