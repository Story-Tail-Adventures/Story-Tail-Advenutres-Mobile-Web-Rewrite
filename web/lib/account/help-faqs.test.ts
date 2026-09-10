import { describe, expect, it } from "vitest";

import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";

import { helpFaqs } from "./help-faqs";

/**
 * Screen 2.5.11's list.
 *
 * This was inline in the page and claimed, in a comment, to collapse the planning-fee
 * question to one entry. It did not: the two modules phrase it differently, so a normalised
 * question hash kept both and the most important answer on the screen appeared twice in a
 * row. It was only caught when the Kotlin twin was written and the pair was asserted.
 */
describe("helpFaqs", () => {
  it("answers the planning-fee question exactly once", () => {
    const source = [...GYASI_FAQ, ...HOW_IT_WORKS_FAQ].filter((item) =>
      /planning fee/i.test(item.q),
    );
    // The fixture itself is the point: if the modules stop asking it twice, this test has
    // nothing to prove and should be revisited rather than quietly passing.
    expect(source.length).toBeGreaterThan(1);

    expect(helpFaqs().filter((item) => /planning fee/i.test(item.q))).toHaveLength(1);
  });

  it("keeps GYASI_FAQ's phrasing and drops the other module's", () => {
    // BOTH HALVES, because the first one passes against the buggy implementation by
    // accident: with both entries present, `.find()` still returns GYASI_FAQ's, since it is
    // spread first. Only asserting the other one is ABSENT actually distinguishes the two
    // implementations — found by mutation-testing this file against the old version.
    const questions = helpFaqs().map((item) => item.q);
    const kept = GYASI_FAQ.find((item) => /planning fee/i.test(item.q))?.q;
    const dropped = HOW_IT_WORKS_FAQ.find((item) => /planning fee/i.test(item.q))?.q;

    expect(kept).toBeDefined();
    expect(dropped).toBeDefined();
    expect(kept).not.toBe(dropped);

    expect(questions).toContain(kept);
    expect(questions).not.toContain(dropped);
  });

  it("hides everything §2.4 owns, matching the answer as well as the question", () => {
    for (const item of helpFaqs()) {
      expect(`${item.q} ${item.a}`).not.toMatch(/\bcards?\b|authoriz/i);
    }
  });

  it("still returns a useful list", () => {
    // A filter that removed everything would pass the two assertions above.
    expect(helpFaqs().length).toBeGreaterThan(2);
  });

  it("never repeats a question", () => {
    const questions = helpFaqs().map((item) => item.q);
    expect(new Set(questions).size).toBe(questions.length);
  });
});
