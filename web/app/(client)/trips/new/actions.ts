"use server";

import { revalidatePath } from "next/cache";
import { callTripFunction } from "@/lib/trips/api";
import { QUOTE } from "./content";

/**
 * Send a quote request. Screen 2.3.8 → `supabase/functions/quote-request`.
 *
 * WHY THE ID IS MINTED HERE and not when the page rendered: the function requires a RECENT
 * uuid v7 (Data-Model §21.6), and somebody can sit on this form for an hour before pressing
 * send. An id created at render would be stale exactly for the people who thought about it
 * longest. Minting at submit also means a double-click sends the same id twice and the
 * second one is refused as a duplicate rather than creating a second trip.
 */
export interface QuoteState {
  status: "idle" | "sent" | "error";
  message?: string;
  tripId?: string;
  /** Echoed back on failure so a paragraph somebody typed is not lost. */
  draft?: string;
}

export async function sendQuoteRequest(
  target: QuoteRequestTarget,
  _previous: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  const raw = formData.get("note");
  const note = typeof raw === "string" ? raw.trim() : "";

  const tripId = uuidV7();
  const result = await callTripFunction("quote-request", {
    method: "POST",
    body: {
      tripId,
      kind: target.kind,
      tripType: target.tripType,
      source: target.source,
      name: target.name,
      location: target.place,
      checkIn: target.checkIn,
      checkOut: target.checkOut,
      travelers: target.travelers,
      apiReference: target.ref,
      note: note || undefined,
      snapshot: {
        propertyType: target.propertyType,
        propertyToken: target.ref,
        indicativeRateCents: target.rateCents,
        hotelClass: target.hotelClass,
        rating: target.rating,
      },
    },
  });

  if (!result.ok) {
    if (result.kind === "unauthenticated") {
      return { status: "error", message: QUOTE.errors.signedOut, draft: note };
    }
    // The function returns a 400 with this exact detail when the id is already used, which
    // is the double-submit case rather than anything the traveler did wrong.
    const duplicate = result.kind === "rejected" && result.detail?.includes("already been sent");
    return {
      status: "error",
      message: duplicate ? QUOTE.errors.duplicate : QUOTE.errors.generic,
      draft: note,
    };
  }

  // The new trip shows on both, and neither is this route.
  revalidatePath("/trips");
  revalidatePath("/dashboard");

  return { status: "sent", tripId: typeof result.data.tripId === "string" ? result.data.tripId : tripId };
}

export interface QuoteRequestTarget {
  kind: "hotel" | "cruise" | "excursion" | "custom";
  tripType?: "cruise" | "all_inclusive" | "multi_destination" | "group" | "custom";
  source?: "curated" | "serpapi_google_hotels" | "track_cruises";
  name: string;
  place?: string;
  checkIn?: string;
  checkOut?: string;
  travelers?: number;
  ref?: string;
  rateCents?: number;
  hotelClass?: number;
  rating?: number;
  propertyType?: string;
}

/**
 * UUID v7, time-ordered, per Data-Model §21.6. Same implementation as `lib/trips/actions.ts`
 * — duplicated rather than shared because hoisting it into a lib would put a `crypto` call
 * in a module both server actions and client components import.
 */
function uuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
