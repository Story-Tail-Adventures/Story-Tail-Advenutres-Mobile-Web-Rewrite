"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import {
  COMPONENT_SPECS,
  componentFromFormData,
  dollarsToCents,
  validateComponent,
  type ComponentFormState,
} from "@/lib/agent/components";
import { BUILDER_COPY } from "@/lib/agent/content";
import { loadTripComponents } from "@/lib/agent/tripDetail";

/**
 * §3.4.4's three writes, and §3.4.5 – §3.4.12's one.
 *
 * ALL THREE GO THROUGH `agent-trip`, never through an RPC from the browser. `trip_component`
 * carries a client's money and an advisor's commission, and CLAUDE.md rule 3's reasoning
 * applies to it for the same reason it applies to `client`: a client-role grant on a
 * function taking `p_agent_id` is an act-as-any-agent primitive with no audit_event behind
 * it. The functions are service_role only and `rls_agent_trips.sql` asserts it.
 *
 * A CONFLICT IS THE ONLY TYPED FAILURE. `EdgeCallResult.conflict` is true on an HTTP 409 and
 * on nothing else; the sentence in `detail` is the function's and must never be
 * substring-matched, which is the dead-signal shape that field exists to retire.
 */

/** Where every one of these lands when it is done. */
function builderPath(tripId: string): string {
  return `/agent/trips/${tripId}/builder`;
}

function revalidateTrip(tripId: string): void {
  revalidatePath(builderPath(tripId));
  revalidatePath(`/agent/trips/${tripId}`);
  // The roster and the pipeline both print `trip.total_value_cents`, which the totals
  // trigger has just moved. A stale figure there is the same defect as a stale figure here.
  revalidatePath("/agent/trips");
  revalidatePath("/agent/pipeline");
  revalidatePath("/agent");
}

/**
 * §3.4.5 – §3.4.12. One action for seven "add" sheets and one "edit", because
 * `componentId` is the only thing that differs and the Edge Function reads it the same way:
 * present means edit, absent means create.
 */
export async function saveComponentAction(
  _prev: ComponentFormState,
  form: FormData,
): Promise<ComponentFormState> {
  const tripId = (form.get("tripId") ?? "").toString();
  if (!tripId) return { formError: BUILDER_COPY.failed };

  const values = componentFromFormData(form);

  const fieldErrors = validateComponent(values);
  if (fieldErrors) return { fieldErrors, values };

  // Both already validated above, so the `?? 0` can only be reached by a race with the
  // check and never by a bad value.
  const costCents = dollarsToCents(values.cost) ?? 0;

  // THE DETAIL OBJECT IS BUILT FROM THE SPEC, NOT FROM WHATEVER THE FORM POSTED. A key the
  // spec does not name would be a 400 from the Edge Function — which is the drift signal
  // working — but sending one at all would mean this layer had stopped agreeing with the
  // one file above it.
  const detail: Record<string, string | boolean> = {};
  for (const field of COMPONENT_SPECS[values.kind].detail) {
    const raw = values.detail[field.key];
    if (raw === undefined || raw === "") continue;
    // A checkbox posts the string "on". It must become a real boolean before it leaves
    // here: the Edge Function refuses a string where it expects a flag, and any non-empty
    // string — "false" included — is truthy.
    detail[field.key] = field.kind === "flag" ? true : raw;
  }

  const call = await callAgentFunction("agent-trip", {
    op: "component_upsert",
    tripId,
    componentId: values.componentId || undefined,
    kind: values.kind,
    displayName: values.displayName,
    supplierId: values.supplierId || undefined,
    location: values.location || undefined,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
    startTime: values.startTime || undefined,
    endTime: values.endTime || undefined,
    confirmationNumber: values.confirmationNumber || undefined,
    costCents,
    commissionPct: values.commissionPct || undefined,
    // EMPTY STAYS EMPTY rather than becoming 0. `resolveCommissionCents` derives the amount
    // from the rate only when nothing was typed, and a 0 sent here would be an amount the
    // advisor never entered — silently overriding the rate with nothing.
    commissionCents: values.commission === "" ? undefined : dollarsToCents(values.commission),
    detail,
  });

  if (!call.ok) {
    if (call.conflict) return { formError: BUILDER_COPY.stale, values };
    return {
      formError: call.kind === "rejected" ? (call.detail ?? BUILDER_COPY.failed) : BUILDER_COPY.failed,
      values,
    };
  }

  revalidateTrip(tripId);
  // `redirect` throws, so nothing after it runs and the success branch never returns.
  redirect(builderPath(tripId));
}

/** §3.4.12's "Remove from trip". An archive, never a delete — see the SQL. */
export async function removeComponentAction(form: FormData): Promise<void> {
  const tripId = (form.get("tripId") ?? "").toString();
  const componentId = (form.get("componentId") ?? "").toString();
  if (!tripId || !componentId) return;

  const call = await callAgentFunction("agent-trip", {
    op: "component_archive",
    tripId,
    componentId,
  });

  // A PLAIN FORM POST, so there is no state to return a message in. A failure leaves the
  // row where it is, which is the honest render — the alternative is a redirect carrying an
  // error string in the URL, and a reload would then re-show a message about a write that
  // is long over.
  if (call.ok) revalidateTrip(tripId);
  redirect(builderPath(tripId));
}

/**
 * §3.4.4's reorder, one step at a time.
 *
 * ARROWS RATHER THAN DRAG. The prototype draws a drag handle on every component row, and
 * drag-and-drop is a pointer-only gesture with no keyboard equivalent unless one is built
 * alongside it — so the accessible fallback would be these buttons anyway. They also work
 * with JavaScript off, which a drag never will, and §3.4.4 is a screen an advisor uses all
 * day. Recorded as a deliberate deviation in the Screen Inventory amendment.
 *
 * THE WHOLE LIST IS READ FRESH HERE, not posted from the page. `agent_reorder_trip_components`
 * refuses a partial list, and a hidden field carrying the order as rendered would go stale
 * the moment a second tab added a piece — turning an ordinary "move up" into a 409 the
 * advisor cannot act on. Re-reading means the move applies to the list as it is now, and
 * moving a component by ID is unambiguous whatever else changed around it.
 */
export async function moveComponentAction(form: FormData): Promise<void> {
  const tripId = (form.get("tripId") ?? "").toString();
  const componentId = (form.get("componentId") ?? "").toString();
  const direction = (form.get("direction") ?? "").toString();
  if (!tripId || !componentId || (direction !== "up" && direction !== "down")) return;

  const components = await loadTripComponents(tripId);
  if (!components) redirect(builderPath(tripId));

  const ids = components.map((c) => c.componentId);
  const from = ids.indexOf(componentId);
  const to = direction === "up" ? from - 1 : from + 1;
  // Off either end is a no-op, not an error: the buttons are disabled at the ends, so
  // reaching here means the list moved underneath a click.
  if (from < 0 || to < 0 || to >= ids.length) redirect(builderPath(tripId));

  [ids[from], ids[to]] = [ids[to], ids[from]];

  const call = await callAgentFunction("agent-trip", {
    op: "component_reorder",
    tripId,
    componentIds: ids,
  });

  if (call.ok) revalidateTrip(tripId);
  redirect(builderPath(tripId));
}
