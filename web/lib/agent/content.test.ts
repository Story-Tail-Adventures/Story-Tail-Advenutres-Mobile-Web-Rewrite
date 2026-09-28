import { describe, expect, it } from "vitest";

import { AGENT_COPY, bulkTagResult, CLIENT_COPY, needsYouLine } from "./content";

/**
 * The agent copy.
 *
 * `.github/scripts/check_copy_parity.py` holds the plain strings against `AgentCopy.kt`
 * byte for byte under its "agent 3.2" row. It skips anything that is not a string literal,
 * so the two FUNCTION entries — the greeting count and the cancelled note — are held here
 * and nowhere else. (There were four until 20260930100000: the currency note and the
 * excluded note both went with §3.2's multi-currency rule, which Story-Tail's USD-only
 * constraint made unreachable.)
 */

/**
 * Only the plain strings. Two entries are functions (the greeting and the cancelled note)
 * because they take a count, and the copy-parity gate skips functions for the same reason
 * — they are covered by their own assertions below rather than by the whole-set sweeps.
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

describe("needsYouLine", () => {
  it("pluralises, and never says zero things", () => {
    expect(needsYouLine(0)).toBe(AGENT_COPY.greetingZero);
    expect(needsYouLine(0)).not.toMatch(/\b0\b/);
    expect(needsYouLine(1)).toMatch(/^1 thing\b/);
    expect(needsYouLine(2)).toMatch(/^2 things\b/);
    expect(needsYouLine(11)).toMatch(/^11 things\b/);
  });
});

describe("bulkTagResult", () => {
  /**
   * §3.3.1's receipt. It is a function for the reason `cancelledNote` is: the parity
   * script only walks plain strings, so anything derived is held here and nowhere else.
   */

  it("says what moved, not what was asked for", () => {
    // The gap is three different things — already tagged, at the 20-tag cap, someone else's
    // client — and the SQL function is deliberately unable to tell them apart. The sentence
    // must not claim more than the count it was given.
    expect(bulkTagResult("vip", 4, 6, true)).toBe(
      'Added "vip" to 4 clients. The other 2 were already tagged.',
    );
    expect(bulkTagResult("vip", 4, 6, true)).not.toMatch(/\b6\b(?! were)/);
  });

  it("drops the tail when everything moved", () => {
    expect(bulkTagResult("vip", 3, 3, true)).toBe('Added "vip" to 3 clients.');
    expect(bulkTagResult("vip", 3, 3, false)).toBe('Removed "vip" from 3 clients.');
  });

  it("pluralises BOTH halves, not just the first", () => {
    // The tail is the half that gets forgotten: "The other 1 were already tagged" reached a
    // browser before this test existed, because every case exercised had a plural remainder.
    expect(bulkTagResult("vip", 1, 1, true)).toBe('Added "vip" to 1 client.');
    expect(bulkTagResult("vip", 2, 3, true)).toBe(
      'Added "vip" to 2 clients. The other 1 was already tagged.',
    );
    expect(bulkTagResult("vip", 2, 3, false)).toBe(
      'Removed "vip" from 2 clients. The other 1 wasn\'t tagged.',
    );
    for (const [changed, requested] of [[1, 1], [1, 2], [2, 3], [5, 9]]) {
      for (const added of [true, false]) {
        const line = bulkTagResult("vip", changed, requested, added);
        expect(line, line).not.toMatch(/\b1 clients\b|\bother 1 (were|weren't)\b/);
        expect(line, line).not.toMatch(/\bother [2-9]\d* (was|wasn't)\b/);
      }
    }
  });

  it("says nothing happened without pretending something did", () => {
    // Zero is the case a count-shaped sentence gets wrong: "Added to 0 clients" is a
    // sentence about a thing that did not occur.
    expect(bulkTagResult("vip", 0, 5, true)).toBe('Every client you picked already had "vip".');
    expect(bulkTagResult("vip", 0, 5, false)).toBe('None of the clients you picked had "vip".');
    for (const added of [true, false]) {
      expect(bulkTagResult("vip", 0, 5, added)).not.toMatch(/\b0\b/);
    }
  });

  it("reads in the brand's register on every branch", () => {
    for (const [changed, requested] of [[0, 5], [1, 1], [4, 6], [6, 6]]) {
      for (const added of [true, false]) {
        const line = bulkTagResult("vip", changed, requested, added);
        expect(line).not.toMatch(/\bleverage\b|\bnurture\b|\bconversion\b|\bsynerg/i);
        expect(line.endsWith(".")).toBe(true);
      }
    }
  });
});

describe("the bulk-tag bar's own strings", () => {
  it("never promises a control that is not there", () => {
    // §3.10 is unbuilt, so nothing in this bar may offer messaging.
    const bar = [
      CLIENT_COPY.bulkLegend, CLIENT_COPY.bulkAdd, CLIENT_COPY.bulkRemove,
      CLIENT_COPY.bulkSelectAll, CLIENT_COPY.bulkSelectRow, CLIENT_COPY.bulkTagLabel,
    ].join(" ");
    expect(bar).not.toMatch(/\bmessage\b|\bemail\b|\bexport\b/i);
  });

  it("dropped the four deferrals that came due", () => {
    // A deferral naming a section that now exists is worse than no sentence — it comes due
    // and nothing arrives. §3.3.2, §3.3.10, §3.3.12 and the bulk action all shipped.
    const copy = CLIENT_COPY as Record<string, unknown>;
    for (const gone of ["rowOpenDeferred", "rowEditDeferred", "rowArchiveDeferred", "bulkDeferred"]) {
      expect(copy[gone]).toBeUndefined();
    }
    // §3.9 has not, so this one stays.
    expect(CLIENT_COPY.mergeDeferred).toMatch(/§3\.9/);
  });
});
