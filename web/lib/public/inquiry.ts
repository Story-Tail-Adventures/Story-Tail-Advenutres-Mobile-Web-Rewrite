import type { Topic } from "@/content/public/types";

/**
 * Guest inquiry — "Message Gyasi without an account" / "Continue as guest"
 * (Screen Inventory 2.0.5, 2.0.6, 2.0.12; Design-System §2 voice).
 *
 * SINCE 2026-10-21 THIS IS A FORM, NOT AN EMAIL. BRD §6.5: anyone who asks for a quote is a
 * client (an account and a trip in `inquiry`); anyone who only messages Gyasi without an
 * account is a LEAD, and the platform tracks it (Data-Model §11). The email link this module
 * used to build left the site, carried no context and could not be counted. Every guest
 * "message" CTA already called `inquiryHref`, and the September note here promised that
 * "reviving `lead` is the designed fix and `inquiryHref` grows a route without any call site
 * changing". This is that route: `/message`, with where the visitor came from and what they
 * were viewing in the query string.
 *
 * Only allowlisted values go into the URL: a source from `InquirySource`, a catalog slug, a
 * topic. Never anything a visitor typed, so no personal information rides in a URL. The page
 * looks the slug up again and shows only the catalog's name for it.
 */

export type InquirySource =
  | "landing"
  | "how-it-works"
  | "about"
  | "topic"
  | "results"
  | "detail"
  | "join";

export const INQUIRY_SOURCES: readonly InquirySource[] = [
  "landing",
  "how-it-works",
  "about",
  "topic",
  "results",
  "detail",
  "join",
];

export function isInquirySource(value: string | null | undefined): value is InquirySource {
  return typeof value === "string" && (INQUIRY_SOURCES as readonly string[]).includes(value);
}

export interface GuestInquiryContext {
  source: InquirySource;
  trip?: { slug: string; name: string };
  topic?: Topic;
}

/** How the form names a topic: "About: a Caribbean week". */
export const TOPIC_LABEL: Record<Topic, string> = {
  caribbean: "a Caribbean week",
  cruises: "a cruise",
  honeymoons: "a honeymoon",
};

/** The href every guest "message" CTA uses: the 2.0.12 form, carrying where they came from. */
export function inquiryHref(ctx: GuestInquiryContext): string {
  const params = new URLSearchParams({ from: ctx.source });
  if (ctx.trip) params.set("trip", ctx.trip.slug);
  else if (ctx.topic) params.set("topic", ctx.topic);
  return `/message?${params.toString()}`;
}
