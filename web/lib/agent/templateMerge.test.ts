import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MERGE_FIELDS,
  SAMPLE_CONTEXT,
  TEMPLATE_CATEGORIES,
  insertAtCursor,
  joinDestinations,
  mergeValues,
  renderTemplate,
  unfilledFields,
  unknownTokens,
  type MergeContext,
} from "./templateMerge";

const ROOT = resolve(__dirname, "../../..");
const quoted = (s: string | undefined) => [...(s ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
const doubleQuoted = (s: string | undefined) => [...(s ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

describe("the three copies of the field list agree", () => {
  // The Deno tests run without file access, so this side checks all three.
  const sql = readFileSync(resolve(ROOT, "supabase/migrations/20261016120000_agent_message_templates.sql"), "utf8");
  const deno = readFileSync(resolve(ROOT, "supabase/functions/_shared/messageTemplate.ts"), "utf8");

  it("merge fields: migration, Edge Functions and web", () => {
    const fromSql = quoted(sql.match(/message_template_fields\(\)[\s\S]*?ARRAY\[([\s\S]*?)\]::text\[\]/)?.[1]);
    const fromDeno = doubleQuoted(deno.match(/MERGE_FIELDS = \[([\s\S]*?)\] as const/)?.[1]);
    expect(fromSql).toEqual([...MERGE_FIELDS]);
    expect(fromDeno).toEqual([...MERGE_FIELDS]);
  });

  it("categories: migration, Edge Functions and web", () => {
    const fromSql = quoted(sql.match(/message_template_category CHECK \(category IN \(([\s\S]*?)\)\)/)?.[1]);
    const fromDeno = doubleQuoted(deno.match(/TEMPLATE_CATEGORIES = \[([\s\S]*?)\] as const/)?.[1]);
    expect(fromSql).toEqual([...TEMPLATE_CATEGORIES]);
    expect(fromDeno).toEqual([...TEMPLATE_CATEGORIES]);
  });

  it("every starter uses only known fields", () => {
    const bodies = [...sql.matchAll(/\$body\$([\s\S]*?)\$body\$/g)].map((m) => m[1]);
    expect(bodies).toHaveLength(7);
    for (const body of bodies) expect(unknownTokens(body)).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("fills what has a value and leaves the rest as raw tokens, reported once each", () => {
    const out = renderTemplate("Hi {{client.firstName}}, see you {{ trip.dates }} and {{trip.dates}}.", {
      "client.firstName": "Maya",
    });
    expect(out.text).toBe("Hi Maya, see you {{ trip.dates }} and {{trip.dates}}.");
    expect(out.missing).toEqual(["trip.dates"]);
  });

  it("treats a blank value as missing, never as an empty gap", () => {
    expect(renderTemplate("Your trip on {{trip.dates}}.", { "trip.dates": "  " }).missing).toEqual(["trip.dates"]);
  });

  it("leaves unknown tokens untouched and does not call them missing", () => {
    expect(renderTemplate("{{client.firstname}}", {})).toEqual({ text: "{{client.firstname}}", missing: [] });
  });
});

describe("token scans", () => {
  it("unknownTokens names each unknown once", () => {
    expect(unknownTokens("{{a}} {{ client.firstName }} {{a}} {{trip.when}}")).toEqual(["a", "trip.when"]);
  });
  it("unfilledFields finds known raw tokens only", () => {
    expect(unfilledFields("A {{braces}} note, {{payment.amount}} and {{ payment.amount }}")).toEqual(["payment.amount"]);
  });
});

describe("mergeValues", () => {
  const maya: MergeContext = {
    clientFirstName: "Maya",
    agentFirstName: "Gyasi",
    tripTitle: "Saint Lucia · Between Semesters",
    tripDestinations: ["Soufriere, Saint Lucia", "Castries"],
    tripStartDate: "2026-10-12",
    tripEndDate: "2026-10-19",
    paymentLabel: "Final balance",
    paymentOwedCents: "200000",
    paymentCurrency: "USD",
    paymentDueDate: "2026-11-02",
  };

  it("formats every field", () => {
    expect(mergeValues(maya)).toEqual({
      "client.firstName": "Maya",
      "agent.firstName": "Gyasi",
      "trip.name": "Saint Lucia · Between Semesters",
      "trip.destination": "Soufriere, Saint Lucia and Castries",
      "trip.dates": "Oct 12 – 19, 2026",
      "payment.label": "Final balance",
      "payment.amount": "$2,000",
      "payment.dueDate": "Nov 2, 2026",
    });
  });

  it("leaves out what a general thread does not have, and never writes 'Dates to come'", () => {
    const general = mergeValues({
      ...maya,
      tripTitle: null,
      tripDestinations: null,
      tripStartDate: null,
      tripEndDate: null,
      paymentLabel: null,
      paymentOwedCents: null,
      paymentCurrency: null,
      paymentDueDate: null,
    });
    expect(Object.keys(general).sort()).toEqual(["agent.firstName", "client.firstName"]);
  });

  it("an owed amount of zero is still a value", () => {
    expect(mergeValues({ ...maya, paymentOwedCents: "0" })["payment.amount"]).toBe("$0");
  });

  it("the editor's sample fills every field", () => {
    expect(Object.keys(mergeValues(SAMPLE_CONTEXT)).sort()).toEqual([...MERGE_FIELDS].sort());
  });
});

describe("joinDestinations", () => {
  it.each([
    [[], ""],
    [["Bahamas"], "Bahamas"],
    [["Bahamas", "St. Maarten"], "Bahamas and St. Maarten"],
    [["Aruba", " Curaçao ", "", "Bonaire"], "Aruba, Curaçao and Bonaire"],
  ])("%j → %s", (list, joined) => {
    expect(joinDestinations(list)).toBe(joined);
  });
});

describe("insertAtCursor", () => {
  it("fills an empty box", () => {
    expect(insertAtCursor("  ", "Hello", 0, 0)).toEqual({ value: "Hello", caret: 5 });
  });
  it("goes in at the cursor without replacing the draft", () => {
    expect(insertAtCursor("Hi there", " X", 2, 2)).toEqual({ value: "Hi X there", caret: 4 });
  });
  it("keeps a selection, inserting after it", () => {
    expect(insertAtCursor("abcdef", "X", 1, 3)).toEqual({ value: "abcXdef", caret: 4 });
  });
  it("appends when there is no cursor", () => {
    expect(insertAtCursor("abc", "X", null, null)).toEqual({ value: "abcX", caret: 4 });
  });
});
