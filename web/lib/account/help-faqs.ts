import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";

type Faq = { q: string; a: string };

/**
 * Questions the two published FAQ sets both answer in different words.
 *
 * A NORMALISED QUESTION STRING IS NOT ENOUGH, and 2.5.11 shipped believing it was. The two
 * modules ask "Do you charge a planning fee?" and "Do I pay a planning fee?" — the same
 * question, different sentences, so hashing the text keeps both and the most important answer
 * on the screen appears twice in a row. Paraphrase is what a union of two curated sets
 * actually produces; identical strings are the rare case.
 *
 * Each entry matches a TOPIC. The first item matching one wins and every later match is
 * dropped, so the order of the union decides which phrasing survives — GYASI_FAQ is spread
 * first because its first-person voice is the right one under a heading about talking to
 * Gyasi directly.
 *
 * Keep this list short. It is a curation decision, not a search index: an entry belongs here
 * only when two published answers genuinely say the same thing.
 */
const SAME_TOPIC: RegExp[] = [/planning fee/i];

/**
 * Cards and authorization, which §2.4 has not built.
 *
 * Matched against the QUESTION AND THE ANSWER: two of the entries mention card authorization
 * only in the answer, and an FAQ that explains an unreachable screen is worse than no FAQ.
 */
const UNREACHABLE = /\bcards?\b|authoriz/i;

/**
 * Screen 2.5.11's question list — the Kotlin twin is `helpFaqs()` in
 * `mobile/.../ui/screens/account/HelpScreen.kt`, and the two must produce the same list.
 *
 * Extracted from the page so it can be tested. It was inline, and inline is how it came to
 * claim a dedupe it did not perform.
 */
export function helpFaqs(): Faq[] {
  const seen = new Set<string>();
  return [...GYASI_FAQ, ...HOW_IT_WORKS_FAQ].filter((item) => {
    if (UNREACHABLE.test(`${item.q} ${item.a}`)) return false;
    const key = topicKey(item.q);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A shared topic if the question has one, otherwise the question's own letters. */
function topicKey(question: string): string {
  const topic = SAME_TOPIC.find((pattern) => pattern.test(question));
  return topic ? topic.source : question.toLowerCase().replace(/[^a-z]/g, "");
}
