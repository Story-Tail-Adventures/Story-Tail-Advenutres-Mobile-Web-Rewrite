"use server";

import { headers } from "next/headers";
import { findTrip } from "@/content/public/trips";
import type { Topic } from "@/content/public/types";
import { isInquirySource, TOPIC_LABEL } from "@/lib/public/inquiry";
import { visitorAddressFrom } from "@/lib/client-address";
import { sendLeadMessage } from "@/lib/public/leadMessage";
import { MESSAGE_TEXT, type MessageState } from "./state";

/**
 * Screen 2.0.12 Message Gyasi: the send. P2 (BRD §6.5, 2026-10-21; Data-Model §11).
 *
 * Works without JavaScript, like /join. The field rules (and the refusal of a card number in
 * the note, CLAUDE.md rule 1) live in `lead-message`, which answers a 400 with a sentence; this
 * action shows that sentence rather than keeping a second copy of the rules to drift.
 *
 * WHAT IT NEVER DOES: tell the visitor whether their address belongs to a client (every
 * accepted send is the same thank-you), email them anything, or log what they typed.
 *
 * The "about" context is rebuilt from the catalog: the hidden `trip` / `topic` inputs carry a
 * slug, and only a slug that exists becomes a label, so nothing a visitor edits in the page
 * reaches Gyasi as "what they were looking at".
 */
const TOPICS: readonly Topic[] = ["caribbean", "cruises", "honeymoons"];

export async function sendMessageAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  const echo = {
    firstName: text(formData.get("firstName")),
    lastName: text(formData.get("lastName")),
    email: text(formData.get("email")),
    phone: text(formData.get("phone")),
    message: text(formData.get("message")),
  };

  const source = text(formData.get("from"));
  const tripSlug = text(formData.get("trip"));
  const topic = text(formData.get("topic"));
  const trip = tripSlug ? findTrip(tripSlug) : undefined;
  const about = trip
    ? { kind: "trip" as const, slug: trip.slug, label: trip.name }
    : (TOPICS as readonly string[]).includes(topic)
      ? { kind: "topic" as const, slug: topic, label: TOPIC_LABEL[topic as Topic] }
      : null;

  const startedAt = Number(text(formData.get("startedAt")));
  // The whole header set, not one name: `visitorAddressFrom` prefers `cf-connecting-ip` over
  // `x-forwarded-for`, because only the first is unforgeable from outside.
  const requestHeaders = await headers();

  const result = await sendLeadMessage(
    {
      ...echo,
      page: isInquirySource(source) ? source : null,
      about,
      utm: {
        source: text(formData.get("utm_source")) || undefined,
        medium: text(formData.get("utm_medium")) || undefined,
        campaign: text(formData.get("utm_campaign")) || undefined,
      },
      website: text(formData.get("website")),
      startedAt: Number.isFinite(startedAt) ? startedAt : 0,
    },
    visitorAddressFrom(requestHeaders),
  );

  if (result.ok) return { outcome: "sent" };
  if (result.kind === "invalid") return { formError: result.detail, ...echo };
  if (result.kind === "throttled") return { formError: MESSAGE_TEXT.throttled, ...echo };
  return { formError: MESSAGE_TEXT.unavailable, ...echo };
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
