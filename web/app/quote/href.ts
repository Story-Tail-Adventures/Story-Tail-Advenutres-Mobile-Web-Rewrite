import type { Topic } from "@/content/public/types";
import { requestQuoteHref } from "@/lib/public/links";
import { cleanText, parseSearchParams } from "@/lib/public/search";
import { TOPIC_QUOTE } from "./content";

/** Where a topic page's inquiry bar submits when its button asks for a quote. */
export const QUOTE_PATH = "/quote";

/** The topic pages whose bar ends in "Request a quote". Cruises opens a search instead. */
export const QUOTE_TOPICS = ["caribbean", "honeymoons"] as const satisfies readonly Topic[];
export type QuoteTopic = (typeof QUOTE_TOPICS)[number];

function isQuoteTopic(topic: Topic | undefined): topic is QuoteTopic {
  return (QUOTE_TOPICS as readonly string[]).includes(topic ?? "");
}

/**
 * Turn a topic bar's submission into the quote request link, or null when it names no
 * topic we quote from.
 *
 * The bar is a plain GET form, so everything here is a URL a visitor could have typed. It
 * goes through the same `parseSearchParams` the results page uses: `dest` is trimmed and
 * capped, `topic` is allow-listed, the dates go through `parseStay` (both or neither, not
 * past, at most 30 nights) and travelers are clamped to 1–20. A field that fails is dropped
 * rather than refused, so a bad date still reaches Gyasi as "flexible" instead of losing the
 * whole request. The vibe is free text, so it gets `cleanText` and nothing more.
 *
 * The result always goes through the gate (`requestQuoteHref`): a signed-in visitor is
 * forwarded straight on to the form, and anyone else lands there after signing up.
 */
export function topicQuoteHref(params: URLSearchParams, today?: string): string | null {
  const q = parseSearchParams(params, today);
  if (!isQuoteTopic(q.topic)) return null;

  const vibe = cleanText(params.get("vibe") ?? undefined);

  return requestQuoteHref({
    kind: "custom",
    tripType: "custom",
    name: TOPIC_QUOTE.names[q.topic],
    place: q.dest,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    travelers: q.travelers,
    note: vibe ? TOPIC_QUOTE.vibeNote(vibe) : undefined,
  });
}
