import type { Topic } from "@/content/public/types";
import { quoteKindFor, requestQuoteHref, type QuoteTarget } from "@/lib/public/links";
import { cleanText, parseSearchParams } from "@/lib/public/search";
import { TOPIC_QUOTE_NAMES } from "./content";

/** Where a topic page's inquiry bar submits when its button asks for a quote. */
export const QUOTE_PATH = "/quote";

/**
 * What a topic page's quote request is about. A cruise is a cruise (the same mapping a cruise
 * trip tile uses); Caribbean and honeymoon requests are custom trips Gyasi shapes.
 */
function topicTarget(topic: Topic): QuoteTarget {
  const kind = topic === "cruises" ? quoteKindFor("cruise") : ({ kind: "custom", tripType: "custom" } as const);
  return { ...kind, name: TOPIC_QUOTE_NAMES[topic] };
}

/**
 * The link every other "Request a quote" CTA on a topic page uses (closing band, sticky bar,
 * the honeymoon card): the topic and nothing else, straight through the gate to the quote
 * form. It used to be the gate with the topic PAGE as `next`, so a signed-in visitor was
 * forwarded back to the page they had just tapped the button on.
 */
export function topicQuoteLink(topic: Topic): string {
  return requestQuoteHref(topicTarget(topic));
}

/**
 * Turn a topic bar's submission into the quote request link, or null when it names no topic.
 *
 * The bar is a plain GET form, so everything here is a URL a visitor could have typed. It
 * goes through the same `parseSearchParams` the results page uses: `topic` is allow-listed,
 * `dest` is trimmed and capped, the dates go through `parseStay` (both or neither, not past,
 * at most 30 nights) and travelers are clamped to 1–20. A field that fails is dropped rather
 * than refused, so a bad date still reaches Gyasi as "flexible" instead of losing the whole
 * request — and the quote form's summary shows the visitor exactly what survived.
 *
 * The vibe travels as the bare value (`cleanText`, ≤ 60 chars). The quote form writes the
 * note's wording around it, so a link can only ever fill in that one short blank.
 *
 * The result always goes through the gate (`requestQuoteHref`): a signed-in visitor is
 * forwarded straight on to the form, and anyone else lands there after signing up.
 */
export function topicQuoteHref(params: URLSearchParams, today?: string): string | null {
  const q = parseSearchParams(params, today);
  if (!q.topic) return null;

  return requestQuoteHref({
    ...topicTarget(q.topic),
    place: q.dest,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    travelers: q.travelers,
    vibe: cleanText(params.get("vibe") ?? undefined),
  });
}
