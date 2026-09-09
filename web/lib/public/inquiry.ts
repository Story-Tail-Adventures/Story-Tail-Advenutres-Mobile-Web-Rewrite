import type { Topic } from "@/content/public/types";
import { env } from "@/lib/env";
import { joinHref } from "./links";

/**
 * Guest inquiry — "Message Gyasi without an account" / "Continue as guest"
 * (Screen Inventory 2.0.5, 2.0.6; Design-System §2 voice).
 *
 * A prefilled email, and — as of 2026-09-09 — permanently so rather than a placeholder.
 * BRD §6.5 was amended: a quote request creates a Trip in `inquiry` status, which requires
 * an account, because `trip.client_id` and `client.first_name`/`last_name` are all NOT NULL.
 * The Lead entity that could have absorbed an anonymous visitor is deferred (Data-Model §11).
 *
 * So this IS the no-account path, not a stand-in for one. It carries no search context and
 * lands in a mailbox rather than a queue, which is the accepted cost of that decision; if it
 * proves lossy, reviving `lead` is the designed fix and `inquiryHref` grows a route without
 * any call site changing.
 *
 * Security notes: every part is `encodeURIComponent`-ed and CR/LF are stripped before
 * encoding (mail clients decode into headers), the subject is capped, and the body only
 * ever contains catalog fields plus blank prompts — never anything the visitor typed, so
 * no PII rides in a URL.
 */

export type InquirySource =
  | "landing"
  | "how-it-works"
  | "about"
  | "topic"
  | "results"
  | "detail"
  | "join";

export interface GuestInquiryContext {
  source: InquirySource;
  trip?: { slug: string; name: string };
  topic?: Topic;
}

const SUBJECT_MAX = 120;

function oneLine(value: string): string {
  return value.replace(/[\r\n\p{Cc}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const TOPIC_LABEL: Record<Topic, string> = {
  caribbean: "a Caribbean week",
  cruises: "a cruise",
  honeymoons: "a honeymoon",
};

export function inquirySubject(ctx: GuestInquiryContext): string {
  let subject: string;
  if (ctx.trip) subject = `Trip inquiry · ${oneLine(ctx.trip.name)}`;
  else if (ctx.topic) subject = `Trip inquiry · ${TOPIC_LABEL[ctx.topic]}`;
  else subject = "Trip inquiry";
  return subject.slice(0, SUBJECT_MAX);
}

export function inquiryBodyLines(ctx: GuestInquiryContext): string[] {
  const lines = ["Hi Gyasi,", ""];
  if (ctx.trip) lines.push(`I'm looking at ${oneLine(ctx.trip.name)} and would love your take.`, "");
  else if (ctx.topic) lines.push(`I'm thinking about ${TOPIC_LABEL[ctx.topic]} and would love your take.`, "");
  else lines.push("I'm dreaming about a trip and would love your take.", "");
  lines.push(
    "Roughly when: ",
    "Who's coming: ",
    "What kind of rest we're after: ",
    "Budget range (optional): ",
    "",
    "Thanks!",
  );
  return lines;
}

export function buildInquiryMailto(ctx: GuestInquiryContext, email: string): string {
  const to = oneLine(email);
  const subject = encodeURIComponent(inquirySubject(ctx));
  const body = inquiryBodyLines(ctx).map((l) => encodeURIComponent(oneLine(l))).join("%0D%0A");
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/**
 * The href every guest "message" CTA uses. Email when an address is configured;
 * otherwise the sign-up gate with the `message` intent, so the CTA is never dead.
 */
export function inquiryHref(ctx: GuestInquiryContext): string {
  const email = env.inquiryEmail;
  if (email) return buildInquiryMailto(ctx, email);
  return joinHref({ intent: "message", trip: ctx.trip?.slug });
}

/** Whether `inquiryHref` will open a mail client (true) or the gate (false). */
export function inquiryIsEmail(): boolean {
  return Boolean(env.inquiryEmail);
}
