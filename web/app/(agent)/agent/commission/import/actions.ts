"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { parseRate } from "@/lib/agent/commissionForm";
import { STATEMENT_COPY } from "@/lib/agent/content";
import { dollarsToCents } from "@/lib/agent/payments";
import {
  clampHeaderCount,
  mapValuesFromForm,
  MAX_STATEMENT_BYTES,
  validateMap,
  type MapFormState,
  type StatementActionState,
  type UploadState,
} from "@/lib/agent/statementForm";
import { statementHref } from "@/lib/agent/statements";

/**
 * §3.7.5 / §3.7.6's writes, through the `commission-import` Edge Function.
 *
 * ONLY `reconcileStatementAction` CHANGES THE LEDGER, so only it revalidates the ledger's
 * pages. Every other action here moves the statement and nothing else.
 *
 * STALENESS IS READ OFF `conflict`, never off the function's English (`lib/supabase/edge.ts`).
 */

const IMPORT_HOME = "/agent/commission/import";

function toSignIn(path: string): never {
  redirect(`/login?next=${encodeURIComponent(path)}`);
}

function readVersion(form: FormData): number | null {
  const v = Number.parseInt((form.get("version") ?? "").toString(), 10);
  return Number.isFinite(v) ? v : null;
}

/** 3.7.5 step 1. The file goes to the function as base64; the function reads and stores it. */
export async function uploadStatementAction(_prev: UploadState, form: FormData): Promise<UploadState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { formError: STATEMENT_COPY.noFile };
  if (file.size > MAX_STATEMENT_BYTES) return { formError: STATEMENT_COPY.tooBig };
  if (/\.(xlsx|xls|numbers|pdf)$/i.test(file.name)) return { formError: STATEMENT_COPY.notCsv };

  const bytes = Buffer.from(await file.arrayBuffer());
  const call = await callAgentFunction("commission-import", {
    op: "upload",
    filename: file.name,
    fileBase64: bytes.toString("base64"),
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(IMPORT_HOME);
    return {
      formError: call.kind === "rejected" ? (call.detail ?? STATEMENT_COPY.uploadFailed) : STATEMENT_COPY.uploadFailed,
    };
  }
  const importId = String(call.data.importId ?? "");
  if (call.data.outcome === "duplicate_file") {
    return { formError: STATEMENT_COPY.duplicate, duplicateHref: importId ? statementHref(importId) : undefined };
  }
  if (call.data.outcome !== "uploaded" || !importId) return { formError: STATEMENT_COPY.uploadFailed };

  revalidatePath(IMPORT_HOME);
  redirect(statementHref(importId));
}

/** 3.7.5 step 2, and "Change columns" on a statement in review. */
export async function mapStatementAction(_prev: MapFormState, form: FormData): Promise<MapFormState> {
  const importId = (form.get("importId") ?? "").toString();
  const version = readVersion(form);
  const headerCount = clampHeaderCount((form.get("headerCount") ?? "").toString());
  const values = mapValuesFromForm(form, headerCount ?? 0);
  if (!importId || version === null || headerCount === null) {
    return { formError: STATEMENT_COPY.mapFailed, values };
  }

  const checked = validateMap(values);
  if (!checked.ok) return { fieldErrors: checked.fieldErrors, values };

  const call = await callAgentFunction("commission-import", {
    op: "map",
    importId,
    expectedVersion: version,
    columnMap: checked.columnMap,
    statementDate: checked.statementDate,
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(statementHref(importId));
    if (call.conflict) return { formError: STATEMENT_COPY.stale, values };
    return {
      formError: call.kind === "rejected" ? (call.detail ?? STATEMENT_COPY.mapFailed) : STATEMENT_COPY.mapFailed,
      values,
    };
  }
  if (call.data.outcome === "not_open") return { formError: STATEMENT_COPY.notOpen, values };

  revalidatePath(statementHref(importId));
  revalidatePath(IMPORT_HOME);
  redirect(statementHref(importId));
}

const RESOLVE_REFUSALS: Record<string, string> = {
  line_unavailable: STATEMENT_COPY.lineUnavailable,
  trip_not_found: STATEMENT_COPY.tripGone,
  supplier_not_found: STATEMENT_COPY.supplierGone,
  not_allowed: STATEMENT_COPY.notAllowed,
  not_open: STATEMENT_COPY.notOpen,
};

/** 3.7.6's Resolve: confirm, match, create or ignore one row. Back to the statement after. */
export async function resolveRowAction(
  _prev: StatementActionState,
  form: FormData,
): Promise<StatementActionState> {
  const importId = (form.get("importId") ?? "").toString();
  const rowId = (form.get("rowId") ?? "").toString();
  const action = (form.get("action") ?? "").toString();
  const version = readVersion(form);
  const refuse = (formError: string): StatementActionState => ({ formError, action });
  if (!importId || !rowId || version === null) return refuse(STATEMENT_COPY.resolveFailed);

  const body: Record<string, unknown> = { op: "resolve", importId, rowId, action, expectedVersion: version };
  if (action === "match") {
    const commissionId = (form.get("commissionId") ?? "").toString();
    if (!commissionId) return refuse(STATEMENT_COPY.lineUnavailable);
    body.commissionId = commissionId;
  }
  if (action === "create") {
    const tripId = (form.get("tripId") ?? "").toString();
    if (!tripId) return refuse(STATEMENT_COPY.createNeedsTrip);
    const gross = dollarsToCents((form.get("gross") ?? "").toString());
    const rate = parseRate((form.get("rate") ?? "").toString());
    if (gross === null || (form.get("gross") ?? "").toString().trim() === "") {
      return refuse(STATEMENT_COPY.createNeedsGross);
    }
    if (rate === null) return refuse(STATEMENT_COPY.createNeedsRate);
    Object.assign(body, {
      tripId,
      supplierId: (form.get("supplierId") ?? "").toString(),
      grossCents: gross,
      commissionPct: rate,
    });
  }

  const call = await callAgentFunction("commission-import", body);
  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(statementHref(importId));
    if (call.conflict) return refuse(STATEMENT_COPY.stale);
    return refuse(call.kind === "rejected" ? (call.detail ?? STATEMENT_COPY.resolveFailed) : STATEMENT_COPY.resolveFailed);
  }
  const outcome = String(call.data.outcome ?? "");
  if (outcome !== "resolved") return refuse(RESOLVE_REFUSALS[outcome] ?? STATEMENT_COPY.resolveFailed);

  revalidatePath(statementHref(importId));
  redirect(statementHref(importId));
}

/** 3.7.6's Mark as reconciled — the one action that changes the ledger. */
export async function reconcileStatementAction(
  _prev: StatementActionState,
  form: FormData,
): Promise<StatementActionState> {
  const importId = (form.get("importId") ?? "").toString();
  const version = readVersion(form);
  if (!importId || version === null) return { formError: STATEMENT_COPY.reconcileFailed };

  const call = await callAgentFunction("commission-import", { op: "reconcile", importId, expectedVersion: version });
  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(statementHref(importId));
    if (call.conflict) return { formError: STATEMENT_COPY.stale };
    // A refusal is certain; a call that never answered may have committed before it was lost.
    return { formError: call.kind === "rejected" ? STATEMENT_COPY.reconcileFailed : STATEMENT_COPY.reconcileUnsure };
  }

  const outcome = String(call.data.outcome ?? "");
  if (outcome === "needs_decisions" || outcome === "not_open") {
    // A row changed under the advisor (a line removed by hand, say). The page refreshes with
    // that row back at the top of the table.
    revalidatePath(statementHref(importId));
    return { formError: outcome === "not_open" ? STATEMENT_COPY.notOpen : STATEMENT_COPY.rowNeedsYouAgain };
  }
  if (outcome !== "reconciled") return { formError: STATEMENT_COPY.reconcileFailed };

  // Every surface the ledger feeds.
  revalidatePath("/agent/commission");
  revalidatePath("/agent/commission/ledger");
  revalidatePath(IMPORT_HOME);
  revalidatePath(statementHref(importId));
  redirect(statementHref(importId));
}

/** Throw a statement away before reconciling it. Nothing in the ledger changes. */
export async function discardStatementAction(
  _prev: StatementActionState,
  form: FormData,
): Promise<StatementActionState> {
  const importId = (form.get("importId") ?? "").toString();
  const version = readVersion(form);
  if (!importId || version === null) return { formError: STATEMENT_COPY.discardFailed };

  const call = await callAgentFunction("commission-import", { op: "discard", importId, expectedVersion: version });
  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(statementHref(importId));
    if (call.conflict) return { formError: STATEMENT_COPY.stale };
    return { formError: STATEMENT_COPY.discardFailed };
  }
  if (call.data.outcome === "not_open") return { formError: STATEMENT_COPY.notOpen };
  if (call.data.outcome !== "discarded") return { formError: STATEMENT_COPY.discardFailed };

  revalidatePath(IMPORT_HOME);
  redirect(IMPORT_HOME);
}
