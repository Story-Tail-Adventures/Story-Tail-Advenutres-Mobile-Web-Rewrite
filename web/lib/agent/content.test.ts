import { describe, expect, it } from "vitest";

import { AGENT_COPY, needsYouLine } from "./content";

/**
 * The agent copy.
 *
 * `.github/scripts/check_copy_parity.py` holds the plain strings against `AgentCopy.kt`
 * byte for byte under its "agent 3.2" row. It skips anything that is not a string literal,
 * so the four FUNCTION entries — the greeting count, the currency note, the cancelled note,
 * the excluded note — are held here and nowhere else.
 */

/**
 * Only the plain strings. Four entries are functions (the greeting, the currency note, the
 * cancelled note, the excluded note) because they take a count, and the copy-parity gate
 * skips functions for the same reason — they are covered by their own assertions below
 * rather than by the whole-set sweeps.
 */
const STRINGS: [string, string][] = Object.entries(AGENT_COPY).flatMap(([k, v]) =>
  typeof v === "string" ? [[k, v] as [string, string]] : [],
);

describe("AGENT_COPY", () => {
  it("every deferral names the section that builds it", () => {
    // Greppable on purpose, the way WalletCopy and AccountCopy are: the unbuilt set should
    // be listable rather than remembered.
    for (const [key, value] of STRINGS) {
      if (!key.endsWith("Deferred")) continue;
      expect(value, key).toMatch(/§3\.\d/);
    }
    expect(STRINGS.filter(([k]) => k.endsWith("Deferred")).length).toBeGreaterThanOrEqual(6);
  });

  it("says `inquiry`, never `lead`, except where it explains the absence", () => {
    // BRD §6.5: a quote request creates a trip in `inquiry` status and the lead domain is
    // deliberately unbuilt. One string is allowed to say the word — the one whose whole job
    // is to point at where the thing actually is.
    for (const [key, value] of STRINGS) {
      if (key === "leadsDeferred") continue;
      expect(value.toLowerCase(), key).not.toMatch(/\blead\b|\bleads\b/);
    }
    expect(AGENT_COPY.leadsDeferred).toMatch(/Inquiry/);
  });

  it("stays out of CRM-vendor register", () => {
    // Design-System §2.6 check 5: would Gyasi say this out loud? These are the words a
    // vendor would sell him.
    const banned = /\bconversion\b|\bfunnel velocity\b|\bnurture\b|\bleverage\b|\bsynerg|\boptimi[sz]e your\b/i;
    for (const [key, value] of STRINGS) {
      expect(value, key).not.toMatch(banned);
    }
  });

  it("the zero state says so and stops", () => {
    // The one place the worldview earns a line on this side. It must not grow a CTA.
    expect(AGENT_COPY.greetingZero).toBe("Nothing urgent today.");
    expect(AGENT_COPY.greetingZeroSub).not.toMatch(/\b(add|create|start|try|check out)\b/i);
  });

  it("the zero state names no time of day", () => {
    // It renders directly beneath the computed part of day. "Nothing urgent this morning."
    // under an "Evening," heading was the shipped bug; any hour word reintroduces it.
    expect(AGENT_COPY.greetingZero).not.toMatch(/\b(morning|afternoon|evening|tonight)\b/i);
  });
});

describe("currencyNote", () => {
  // The argument is a count of OTHER CURRENCIES — `currency_count - 1` — not of trips.
  it("counts currencies, never trips", () => {
    expect(AGENT_COPY.currencyNote("USD", 1)).toBe(
      "USD only. Trips priced in 1 other currency are not counted here.",
    );
    expect(AGENT_COPY.currencyNote("USD", 2)).toBe(
      "USD only. Trips priced in 2 other currencies are not counted here.",
    );
    expect(AGENT_COPY.currencyNote("EUR", 4)).toBe(
      "EUR only. Trips priced in 4 other currencies are not counted here.",
    );
  });

  it("never claims a trip count", () => {
    // The old sentence said "3 trips are priced in another currency", which the caller has
    // no way to know: three other currencies could be thirty trips.
    for (const n of [1, 2, 7]) {
      expect(AGENT_COPY.currencyNote("USD", n)).not.toMatch(/\btrips? (is|are)\b/);
    }
  });
});

describe("cancelledNote", () => {
  it("pluralises the verb with the count, not just the noun", () => {
    // "1 cancelled trips are" is the shape a naive `${n} cancelled trips are` produces.
    // FAILS IF: the `n === 1` in content.ts becomes `n === 0`.
    expect(AGENT_COPY.cancelledNote(1)).toBe(
      "1 cancelled trip is not on the board. Cancelled is a status, not a stage.",
    );
    expect(AGENT_COPY.cancelledNote(4)).toBe(
      "4 cancelled trips are not on the board. Cancelled is a status, not a stage.",
    );
  });
});

describe("excludedNote", () => {
  // It sits UNDER one column's total, directly beneath the page-level `currencyNote`. The
  // two numbers count different things — this one counts TRIPS, that one counts CURRENCIES
  // — so this sentence has to name its unit and must not restate the rule the note above
  // already gave.
  it("counts trips, and pluralises both halves together", () => {
    // FAILS IF: the `n === 1` in content.ts becomes `n === 2` — "+1 trips in other
    // currencies" for a single card.
    expect(AGENT_COPY.excludedNote(1)).toBe("+1 trip in another currency");
    expect(AGENT_COPY.excludedNote(2)).toBe("+2 trips in other currencies");
    expect(AGENT_COPY.excludedNote(7)).toBe("+7 trips in other currencies");
  });

  it("does not restate the page-level currency note", () => {
    // Both sentences render on the pipeline screen at once. If this one grew "are not
    // counted here" it would read as a second, contradicting version of the note above it.
    for (const n of [1, 3]) {
      expect(AGENT_COPY.excludedNote(n)).not.toMatch(/not counted here|only\./);
      expect(AGENT_COPY.excludedNote(n).length).toBeLessThanOrEqual(32);
    }
  });

  it("stays in the same register as the rest of the module", () => {
    // The sweeps at the top only walk plain strings, so a function entry has to be checked
    // by hand for the two rules that bind every line here.
    for (const n of [1, 5]) {
      expect(AGENT_COPY.excludedNote(n).toLowerCase()).not.toMatch(/\blead\b|\bleads\b/);
      expect(AGENT_COPY.excludedNote(n)).not.toMatch(/\bconversion\b|\bnurture\b|\bleverage\b/i);
    }
  });
});

describe("needsYouLine", () => {
  it("pluralises, and never says zero things", () => {
    expect(needsYouLine(0)).toBe(AGENT_COPY.greetingZero);
    expect(needsYouLine(0)).not.toMatch(/\b0\b/);
    expect(needsYouLine(1)).toMatch(/^1 thing\b/);
    expect(needsYouLine(2)).toMatch(/^2 things\b/);
    expect(needsYouLine(11)).toMatch(/^11 things\b/);
  });
});
