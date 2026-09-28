import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import {
  COMPONENT_KINDS,
  payloadKeysFor,
  readCents,
  readCommissionPct,
  readComponentPayload,
  readTime,
  requireComponentKind,
  resolveCommissionCents,
} from "./component.ts";

/**
 * Data-Model §23 traded database-level validation of `trip_component.payload` for one table
 * and no seven-arm unions, and named the Edge Function as the place the validation would
 * live instead. `component.ts` is that place, so this file is the whole of the enforcement
 * the trade gave up — there is no CHECK constraint behind it and no type to fall back on.
 *
 * The cases below are the ones that would otherwise reach Postgres and come back as an
 * opaque 500, or worse, land in the row and be read as truth later.
 *
 * Run: deno test --allow-env --config supabase/functions/deno.json supabase/functions/
 */

Deno.test("seven kinds, matching component_kind exactly", () => {
  assertEquals([...COMPONENT_KINDS], [
    "flight",
    "hotel",
    "cruise",
    "transfer",
    "excursion",
    "insurance",
    "custom",
  ]);
});

Deno.test("dining is not a kind — §23 sends it to custom", () => {
  // The prototype draws A3410_AddDining and the builder rail lists "Dining · manual". If
  // anyone ever adds it here without adding the enum value, this is where it stops.
  assertThrows(() => requireComponentKind("dining"), HttpError);
});

Deno.test("every kind carries notes", () => {
  for (const kind of COMPONENT_KINDS) {
    assertEquals(
      payloadKeysFor(kind).includes("notes"),
      true,
      `${kind} has no notes field — a note with nowhere to go lands in display_name, ` +
        "which is the row title a client reads on the proposal",
    );
  }
});

Deno.test("every payload key is snake_case, like every other jsonb here", () => {
  // The first draft was camelCase and did not match the rows already in the table. The
  // edit sheet rendered blank over a component that had the data, and a save would have
  // written the empty set over it.
  for (const kind of COMPONENT_KINDS) {
    for (const key of payloadKeysFor(kind)) {
      assertEquals(/^[a-z][a-z0-9_]*$/.test(key), true, `${kind}.${key} is not snake_case`);
    }
  }
});

Deno.test("no payload key duplicates a column", () => {
  // §23's boundary, executable: anything a QUERY needs is a column. These twelve are
  // columns on trip_component today, so a payload key by the same name would mean two
  // places holding one fact and a read picking whichever it happened to look at.
  const columns = [
    "kind",
    "display_name",
    "supplier_id",
    "start_date",
    "end_date",
    "start_time",
    "end_time",
    "location",
    "confirmation_number",
    "cost_cents",
    "commission_pct",
    "commission_cents",
    "currency",
    "order_index",
    "api_source",
    "api_reference",
  ];
  for (const kind of COMPONENT_KINDS) {
    for (const key of payloadKeysFor(kind)) {
      assertEquals(
        columns.includes(key),
        false,
        `${kind}.${key} is already a column on trip_component`,
      );
    }
  }
});

Deno.test("an unknown key is refused, not dropped", () => {
  // The whole reason unknown keys throw: a dropped key saves clean and comes back empty.
  assertThrows(
    () => readComponentPayload("flight", { flight_number: "AA 1413", cabin2: "x" }),
    HttpError,
  );
  // And a key that is real for a DIFFERENT kind is still not real for this one.
  assertThrows(() => readComponentPayload("flight", { ship: "Symphony" }), HttpError);
});

Deno.test("empty and absent both come back absent", () => {
  // `agent_upsert_trip_component` decides `noop` by comparing the whole stored payload to
  // the incoming one. If "" and absent differed, every save of an untouched form would read
  // as a real edit, bump updated_at, and re-run the totals trigger for nothing.
  assertEquals(readComponentPayload("custom", {}), {});
  assertEquals(readComponentPayload("custom", { notes: "" }), {});
  assertEquals(readComponentPayload("custom", { notes: "   " }), {});
  assertEquals(readComponentPayload("custom", undefined), {});
  assertEquals(readComponentPayload("custom", null), {});
});

Deno.test("text is trimmed, and length is capped", () => {
  assertEquals(readComponentPayload("flight", { seat: "  14A, 14B  " }), {
    seat: "14A, 14B",
  });
  assertThrows(
    () => readComponentPayload("flight", { seat: "A".repeat(81) }),
    HttpError,
  );
});

Deno.test("a flag is true or absent — never the string \"false\"", () => {
  assertEquals(
    readComponentPayload("cruise", { gratuities_included: true }),
    { gratuities_included: true },
  );
  assertEquals(readComponentPayload("cruise", { gratuities_included: false }), {});
  // An unchecked HTML checkbox submits nothing at all; a checked one submits "on". Anything
  // that arrives as a STRING here means the form sent a raw field value instead of a
  // boolean, and "false" is truthy — which is exactly the bug this refuses.
  assertThrows(
    () => readComponentPayload("cruise", { gratuities_included: "false" }),
    HttpError,
  );
});

Deno.test("a payload is an object, not an array", () => {
  assertThrows(() => readComponentPayload("custom", ["notes"]), HttpError);
  assertThrows(() => readComponentPayload("custom", "notes"), HttpError);
});

Deno.test("times are range-checked, not just shape-checked", () => {
  assertEquals(readTime("14:30", "Start time"), "14:30:00");
  assertEquals(readTime("14:30:15", "Start time"), "14:30:15");
  assertEquals(readTime("", "Start time"), null);
  assertEquals(readTime(null, "Start time"), null);
  // /^\d{2}:\d{2}$/ passes every one of these. Postgres would reject them as an error, not
  // a value, and the 500 would read as the server breaking.
  assertThrows(() => readTime("25:00", "Start time"), HttpError);
  assertThrows(() => readTime("14:99", "Start time"), HttpError);
  assertThrows(() => readTime("2:30 PM", "Start time"), HttpError);
});

Deno.test("cents accept both a number and a digit-string", () => {
  assertEquals(readCents(498000, "Cost"), 498000);
  assertEquals(readCents("498000", "Cost"), 498000);
  assertEquals(readCents("", "Cost"), 0);
  assertEquals(readCents(undefined, "Cost"), 0);
  assertThrows(() => readCents(-1, "Cost"), HttpError);
  assertThrows(() => readCents(4980.5, "Cost"), HttpError);
  assertThrows(() => readCents("4,980", "Cost"), HttpError);
  // Ten digits is $100,000,000. Above that is a typo or an attack, not a cost.
  assertThrows(() => readCents(10_000_000_000, "Cost"), HttpError);
});

Deno.test("commission % fits numeric(5,2)", () => {
  assertEquals(readCommissionPct(15), 15);
  assertEquals(readCommissionPct("12.5"), 12.5);
  assertEquals(readCommissionPct(""), null);
  assertEquals(readCommissionPct(null), null);
  // Rounded, not refused — a third decimal is nobody's intent.
  assertEquals(readCommissionPct(12.505), 12.51);
  assertThrows(() => readCommissionPct(-1), HttpError);
  // 1000 does not fit numeric(5,2). Refusing here makes it a 400 instead of SQLSTATE 22003
  // arriving as a bodyless 500.
  assertThrows(() => readCommissionPct(1000), HttpError);
  assertThrows(() => readCommissionPct("fifteen"), HttpError);
});

Deno.test("a typed commission amount wins over the rate", () => {
  assertEquals(resolveCommissionCents(498000, 12, 50000), 50000);
  assertEquals(resolveCommissionCents(498000, 12, "50000"), 50000);
  // An explicit 0 is an amount, not a blank: it is how an advisor records a component they
  // earn nothing on without having to clear the rate as well.
  assertEquals(resolveCommissionCents(498000, 12, 0), 0);
});

Deno.test("a blank commission amount is derived from the rate", () => {
  assertEquals(resolveCommissionCents(498000, 12, undefined), 59760);
  assertEquals(resolveCommissionCents(498000, 12, ""), 59760);
  assertEquals(resolveCommissionCents(498000, 12, null), 59760);
  // Rounded to the cent rather than truncated.
  assertEquals(resolveCommissionCents(333, 10, ""), 33);
  assertEquals(resolveCommissionCents(335, 10, ""), 34);
});

Deno.test("no rate and no amount is zero, not a guess", () => {
  assertEquals(resolveCommissionCents(498000, null, ""), 0);
  assertEquals(resolveCommissionCents(498000, 0, ""), 0);
  assertEquals(resolveCommissionCents(0, 12, ""), 0);
});
