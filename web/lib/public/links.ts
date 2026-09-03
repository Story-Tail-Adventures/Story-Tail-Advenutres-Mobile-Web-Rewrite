import { safeNext } from "@/lib/safe-next";

/**
 * Link builders for the public surface, so pages never hand-roll query strings and the
 * sign-up gate can change its parameter names in one place.
 */

export const JOIN_INTENTS = ["quote", "save", "message", "tour"] as const;
export type JoinIntent = (typeof JOIN_INTENTS)[number];

export function isJoinIntent(value: string | undefined | null): value is JoinIntent {
  return typeof value === "string" && (JOIN_INTENTS as readonly string[]).includes(value);
}

export interface JoinLink {
  intent?: JoinIntent;
  /** Catalog slug the visitor was looking at. Resolved against the catalog on /join. */
  trip?: string;
  /** Same-origin path to return to after sign-up. */
  next?: string;
}

/** `/join?intent=quote&trip=<slug>&next=/explore/<slug>` (Screen Inventory 2.0.6). */
export function joinHref({ intent, trip, next }: JoinLink = {}): string {
  const params = new URLSearchParams();
  if (intent) params.set("intent", intent);
  if (trip) params.set("trip", trip);
  if (next) {
    const safe = safeNext(next, "");
    if (safe) params.set("next", safe);
  }
  const qs = params.toString();
  return qs ? `/join?${qs}` : "/join";
}

/** `/login?next=…` with the same open-redirect guard. */
export function loginHref(next?: string): string {
  if (!next) return "/login";
  const safe = safeNext(next, "");
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

export function tripHref(slug: string): string {
  return `/explore/${encodeURIComponent(slug)}`;
}
