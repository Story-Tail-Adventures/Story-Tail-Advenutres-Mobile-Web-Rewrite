import { describe, expect, it } from "vitest";
import { JOIN_INTENTS } from "@/lib/public/links";
import { JOIN_TEXT, initialJoinState, joinCopy, submitLabel } from "./state";

describe("joinCopy — headline by intent (fidelity spec §5.4)", () => {
  it("quote", () => {
    expect(joinCopy("quote").title).toBe("Create an account to send Gyasi your trip details.");
  });

  it("quote with a catalog trip name", () => {
    expect(joinCopy("quote", "Beaches Turks & Caicos").title).toBe(
      "Create an account to send Gyasi your trip details for Beaches Turks & Caicos.",
    );
  });

  it("save", () => {
    expect(joinCopy("save").title).toBe("Create an account to save this for later.");
  });

  it("message", () => {
    expect(joinCopy("message").title).toBe("Almost there — tell Gyasi what you're dreaming about.");
  });

  it("tour and no intent share the default", () => {
    const fallback = "Create an account to start planning with Gyasi.";
    expect(joinCopy("tour").title).toBe(fallback);
    expect(joinCopy(undefined).title).toBe(fallback);
  });

  it("only the quote headline mentions the trip", () => {
    for (const intent of JOIN_INTENTS.filter((i) => i !== "quote")) {
      expect(joinCopy(intent, "Some Resort").title).not.toContain("Some Resort");
    }
  });

  it("keeps the overline and body constant across intents", () => {
    for (const intent of [...JOIN_INTENTS, undefined]) {
      const copy = joinCopy(intent);
      expect(copy.overline).toBe("ALMOST THERE");
      expect(copy.body).toBe(JOIN_TEXT.body);
    }
  });
});

describe("submitLabel", () => {
  it("varies by intent and never says 'send quote' (the visitor requests; Gyasi sends)", () => {
    expect(submitLabel("quote")).toBe("Create account & send my request");
    expect(submitLabel("save")).toBe("Create account & save");
    expect(submitLabel("message")).toBe("Create account");
    expect(submitLabel("tour")).toBe("Create account");
    expect(submitLabel(undefined)).toBe("Create account");
    for (const intent of [...JOIN_INTENTS, undefined]) {
      expect(submitLabel(intent)).not.toMatch(/send quote/i);
    }
  });
});

describe("JOIN_TEXT — content integrity", () => {
  it("starts from an empty state", () => {
    expect(initialJoinState).toEqual({});
  });

  it("carries no client-billing vocabulary (CLAUDE.md rule 2)", () => {
    const everything = JSON.stringify(JOIN_TEXT);
    expect(everything).not.toMatch(/\binvoice|\bfee\b|charge you|we charge/i);
  });

  it("keeps the brief's corrected CTA copy", () => {
    expect(JOIN_TEXT.emailInstead).toBe("Email Gyasi instead →");
    expect(JOIN_TEXT.bullets).toEqual([
      "Save searches & favorites",
      "View Gyasi's curated proposals",
      "Authorize cards securely · paid to suppliers, not us",
    ]);
  });
});
