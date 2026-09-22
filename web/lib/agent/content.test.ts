import { describe, expect, it } from "vitest";

import { AGENT_COPY, needsYouLine } from "./content";

/**
 * The agent copy.
 *
 * This file is NOT in `.github/scripts/check_copy_parity.py` yet — there is no KMP agent
 * surface to pair it with — and the gate's own header warns that an unregistered module is a
 * silent gap rather than a covered one. So these assertions are the only thing holding these
 * strings until §3.2's Compose Worklist lands.
 */

/**
 * Only the plain strings. Three entries are functions (the greeting, the currency note, the
 * cancelled note) because they take a count, and the copy-parity gate skips functions for
 * the same reason — they are covered by their own assertions below rather than by the
 * whole-set sweeps.
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
    expect(AGENT_COPY.greetingZero).toBe("Nothing urgent this morning.");
    expect(AGENT_COPY.greetingZeroSub).not.toMatch(/\b(add|create|start|try|check out)\b/i);
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
