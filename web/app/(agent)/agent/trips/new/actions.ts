"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { NEW_TRIP_COPY } from "@/lib/agent/content";
import {
  newTripFromFormData,
  validateNewTrip,
  type NewTripState,
} from "@/lib/agent/newTrip";

/**
 * Screen 3.4.3's write.
 *
 * `no_client` IS A FIELD ERROR, NOT A FAILURE. The Edge Function answers it 200 with an
 * outcome rather than a 4xx, so the message can land against the client picker instead of
 * as a banner the advisor cannot act on — the same shape `agent-client` uses for a duplicate
 * email. It means the id was typed or stale, which on this screen means the client left the
 * book between the page loading and the submit.
 *
 * ON SUCCESS THIS LANDS IN THE BUILDER, not back on the list and no longer on the trip's
 * detail screen. Creating a trip is the first half of a thought whose second half is
 * filling it in; until §3.4.4 existed the nearest place to do that was §3.4.2, and this
 * comment said so. §3.4.4's own Screen-Inventory entry names "Create New Trip flow" as its
 * first entry point, and a brand-new trip has nothing on its detail screen to read.
 */
export async function createTripAction(
  _prev: NewTripState,
  form: FormData,
): Promise<NewTripState> {
  const values = newTripFromFormData(form);

  const fieldErrors = validateNewTrip(values);
  if (fieldErrors) return { fieldErrors, values };

  const travelerCount = Number.parseInt(values.travelerCount, 10);

  const call = await callAgentFunction("agent-trip", {
    op: "create",
    clientId: values.clientId,
    tripType: values.tripType,
    title: values.title,
    travelerCount: Number.isFinite(travelerCount) ? travelerCount : 1,
  });

  if (!call.ok) {
    return {
      formError: call.kind === "rejected"
        ? (call.detail ?? NEW_TRIP_COPY.failed)
        : NEW_TRIP_COPY.failed,
      values,
    };
  }

  if (call.data.outcome === "no_client") {
    return { fieldErrors: { clientId: [NEW_TRIP_COPY.clientMissing] }, values };
  }

  const tripId = call.data.tripId;
  if (typeof tripId !== "string") return { formError: NEW_TRIP_COPY.failed, values };

  // §3.4.13's "start from a template", applied AFTER the trip exists because a pattern
  // needs something to be applied to.
  //
  // A FAILED APPLY DOES NOT FAIL THE CREATE. The trip is real and the advisor is one click
  // from the builder; throwing them back to an empty form with "template failed" would
  // lose a trip they just made in order to recover from a problem with the seeding.
  //
  // BUT IT MUST NOT BE SILENT, and the first version of this was. A trip created with a
  // pattern selected, whose apply then failed, landed in the builder reading "0 pieces /
  // Nothing in it yet" — which is character for character what choosing "Start from
  // scratch" produces. That is the shape of every defect this week: a path that did
  // nothing and reported success. The outcome rides in the URL so the builder can say
  // which of the two happened.
  let seeded: string | null = null;
  if (values.templateId) {
    const applied = await callAgentFunction("agent-template", {
      op: "apply",
      templateId: values.templateId,
      tripId,
    });
    revalidatePath(`/agent/trips/${tripId}/itinerary`);
    revalidatePath("/agent/templates");

    seeded = applied.ok
      ? String(Number(applied.data.componentsAdded ?? 0))
      : "failed";
  }

  revalidatePath("/agent/trips");
  revalidatePath("/agent/pipeline");
  revalidatePath("/agent");
  // `redirect` throws, so nothing after it runs and the success branch never returns.
  redirect(
    seeded === null
      ? `/agent/trips/${tripId}/builder`
      : `/agent/trips/${tripId}/builder?seeded=${seeded}`,
  );
}
