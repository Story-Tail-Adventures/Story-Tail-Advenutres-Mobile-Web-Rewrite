"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { ITINERARY_COPY } from "@/lib/agent/content";
import {
  activityFromFormData,
  dayFromFormData,
  validateActivity,
  validateDay,
  type ItineraryState,
} from "@/lib/agent/itinerary";
import { loadTripItinerary } from "@/lib/agent/tripDetail";

/**
 * §3.4.14's five writes.
 *
 * AUTO-GENERATE RETURNS A MESSAGE RATHER THAN REDIRECTING SILENTLY. Its three outcomes are
 * genuinely different facts — it added things, it found nothing to add, or the trip has no
 * dates to lay days out along — and a page that looked identical in all three would make
 * the advisor press it again to find out which happened.
 */

function itineraryPath(tripId: string): string {
  return `/agent/trips/${tripId}/itinerary`;
}

function revalidateTrip(tripId: string): void {
  revalidatePath(itineraryPath(tripId));
  revalidatePath(`/agent/trips/${tripId}`);
  // The traveler's own itinerary read renders from the same rows.
  revalidatePath(`/trips/${tripId}`);
}

export type GenerateState = { message?: string; kind?: "ok" | "info" | "error" };

/** The Key actions line's "Auto-generate". Additive and idempotent — see the migration. */
export async function generateItineraryAction(
  _prev: GenerateState,
  form: FormData,
): Promise<GenerateState> {
  const tripId = (form.get("tripId") ?? "").toString();
  if (!tripId) return { message: ITINERARY_COPY.generateFailed, kind: "error" };

  const call = await callAgentFunction("agent-itinerary", { op: "generate", tripId });

  if (!call.ok) {
    return {
      message: call.kind === "rejected"
        ? (call.detail ?? ITINERARY_COPY.generateFailed)
        : ITINERARY_COPY.generateFailed,
      kind: "error",
    };
  }

  // `no_dates` arrives as a 200 with an outcome rather than a 4xx, so the sentence can name
  // what to do instead of reading as a server failure.
  if (call.data.outcome === "no_dates") {
    return { message: ITINERARY_COPY.generateNoDates, kind: "error" };
  }

  revalidateTrip(tripId);

  if (call.data.outcome === "noop") {
    return { message: ITINERARY_COPY.generatedNothing, kind: "info" };
  }

  return { message: ITINERARY_COPY.generatedSome, kind: "ok" };
}

export async function saveDayAction(
  _prev: ItineraryState,
  form: FormData,
): Promise<ItineraryState> {
  const tripId = (form.get("tripId") ?? "").toString();
  if (!tripId) return { formError: ITINERARY_COPY.failed };

  const values = dayFromFormData(form);
  const fieldErrors = validateDay(values);
  if (fieldErrors) return { fieldErrors, dayValues: values };

  const call = await callAgentFunction("agent-itinerary", {
    op: "day_upsert",
    tripId,
    dayId: values.dayId || undefined,
    date: values.date || undefined,
    label: values.label || undefined,
    summary: values.summary || undefined,
  });

  if (!call.ok) {
    return {
      formError: call.kind === "rejected" ? (call.detail ?? ITINERARY_COPY.failed) : ITINERARY_COPY.failed,
      dayValues: values,
    };
  }

  revalidateTrip(tripId);
  redirect(itineraryPath(tripId));
}

export async function saveActivityAction(
  _prev: ItineraryState,
  form: FormData,
): Promise<ItineraryState> {
  const tripId = (form.get("tripId") ?? "").toString();
  if (!tripId) return { formError: ITINERARY_COPY.failed };

  const values = activityFromFormData(form);
  const fieldErrors = validateActivity(values);
  if (fieldErrors) return { fieldErrors, activityValues: values };

  const call = await callAgentFunction("agent-itinerary", {
    op: "activity_upsert",
    tripId,
    activityId: values.activityId || undefined,
    dayId: values.dayId || undefined,
    title: values.title,
    // Empty means "derive it from the time", which is what the SQL does with a null block.
    block: values.block || undefined,
    startTime: values.startTime || undefined,
    endTime: values.endTime || undefined,
    body: values.body || undefined,
    location: values.location || undefined,
    address: values.address || undefined,
    phone: values.phone || undefined,
    confirmationNumber: values.confirmationNumber || undefined,
    gyasisTip: values.gyasisTip || undefined,
  });

  if (!call.ok) {
    if (call.conflict) return { formError: ITINERARY_COPY.stale, activityValues: values };
    return {
      formError: call.kind === "rejected" ? (call.detail ?? ITINERARY_COPY.failed) : ITINERARY_COPY.failed,
      activityValues: values,
    };
  }

  revalidateTrip(tripId);
  redirect(itineraryPath(tripId));
}

/** Remove an entry. A hard delete — the booking it came from is untouched. */
export async function deleteActivityAction(form: FormData): Promise<void> {
  const tripId = (form.get("tripId") ?? "").toString();
  const activityId = (form.get("activityId") ?? "").toString();
  if (!tripId || !activityId) return;

  const call = await callAgentFunction("agent-itinerary", {
    op: "activity_delete",
    tripId,
    activityId,
  });

  if (call.ok) revalidateTrip(tripId);
  redirect(itineraryPath(tripId));
}

/**
 * Move an entry within its day.
 *
 * THE WHOLE DAY IS READ FRESH HERE rather than posted from the page, for the reason
 * §3.4.4's component reorder gives: the SQL refuses a partial list, and a hidden field
 * carrying the order as rendered goes stale the moment a second tab adds an entry — turning
 * an ordinary "move up" into a 409 the advisor cannot act on.
 */
export async function moveActivityAction(form: FormData): Promise<void> {
  const tripId = (form.get("tripId") ?? "").toString();
  const dayId = (form.get("dayId") ?? "").toString();
  const activityId = (form.get("activityId") ?? "").toString();
  const direction = (form.get("direction") ?? "").toString();
  if (!tripId || !dayId || !activityId || (direction !== "up" && direction !== "down")) return;

  const itinerary = await loadTripItinerary(tripId);
  if (!itinerary) redirect(itineraryPath(tripId));

  const day = itinerary.days.find((d) => d.dayId === dayId);
  if (!day) redirect(itineraryPath(tripId));

  const ids = day.activities.map((a) => a.activityId);
  const from = ids.indexOf(activityId);
  const to = direction === "up" ? from - 1 : from + 1;
  // Off either end is a no-op, not an error: the buttons are disabled at the ends, so
  // reaching here means the day moved underneath a click.
  if (from < 0 || to < 0 || to >= ids.length) redirect(itineraryPath(tripId));

  [ids[from], ids[to]] = [ids[to], ids[from]];

  const call = await callAgentFunction("agent-itinerary", {
    op: "reorder",
    tripId,
    dayId,
    activityIds: ids,
  });

  if (call.ok) revalidateTrip(tripId);
  redirect(itineraryPath(tripId));
}
