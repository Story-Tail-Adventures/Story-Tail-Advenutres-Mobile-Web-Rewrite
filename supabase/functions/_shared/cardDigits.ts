/**
 * The one rule for finding a card number in free text (Data-Model §18). The guard
 * (`hasCardNumber`, payLink.ts) REFUSES what it finds; the maskers (`maskCardNumbers`,
 * push.ts, which email.ts and email-inbox reuse) MASK it. Both read the same spans, so a
 * number the guard would refuse can never reach a lock screen or an inbox in full.
 * Twins: web/lib/trips/payLink.ts, SQL `public.text_has_card_digits`, and `maskCardNumbers`
 * in mobile/shared/…/domain/agent/AgentNotifications.kt.
 */

/**
 * ASCII digit groups joined by up to three spaces, dots, dashes or no-break / thin spaces:
 * the ways people write a card number. Letters, underscores and other punctuation end a run
 * but never hide one, so `ref4111…` and `x_4111…` are still found. ASCII only, like the SQL
 * twin `public.text_has_card_digits`, so the two can never disagree.
 */
const DIGIT_RUN = /[0-9]+(?:[ .   -]{1,3}[0-9]+)*/g;
const GROUP = /[0-9]+/g;

export function luhnValid(digits: string): boolean {
  let total = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
    double = !double;
  }
  return total % 10 === 0;
}

/** A card number found in text: where it sits, and its digits with the separators taken out. */
export interface CardSpan {
  start: number;
  end: number;
  digits: string;
}

/**
 * Every span of whole digit groups in a run that joins to 13 to 19 digits passing Luhn.
 * Every starting group is tried, so a short number in front ("Paid 12 4111…") cannot swallow
 * the card the way one greedy match did. From each start the longest such span wins (it errs
 * toward hiding more), and the search goes on after it, so spans never overlap.
 */
export function findCardSpans(text: string): CardSpan[] {
  const spans: CardSpan[] = [];
  for (const run of text.matchAll(DIGIT_RUN)) {
    const groups = [...run[0].matchAll(GROUP)].map((g) => ({
      start: run.index! + g.index!,
      end: run.index! + g.index! + g[0].length,
      digits: g[0],
    }));
    let i = 0;
    while (i < groups.length) {
      let digits = "";
      let best = -1;
      let bestDigits = "";
      for (let j = i; j < groups.length; j++) {
        digits += groups[j].digits;
        if (digits.length > 19) break;
        if (digits.length >= 13 && luhnValid(digits)) {
          best = j;
          bestDigits = digits;
        }
      }
      if (best < 0) {
        i++;
        continue;
      }
      spans.push({ start: groups[i].start, end: groups[best].end, digits: bestDigits });
      i = best + 1;
    }
  }
  return spans;
}

export function hasCardNumber(text: string): boolean {
  return findCardSpans(text).length > 0;
}

/** Each card number in the text becomes `•••• ` and its last four digits; the rest stays. */
export function maskCardNumbers(text: string): string {
  let out = "";
  let at = 0;
  for (const span of findCardSpans(text)) {
    out += text.slice(at, span.start) + `•••• ${span.digits.slice(-4)}`;
    at = span.end;
  }
  return out + text.slice(at);
}
