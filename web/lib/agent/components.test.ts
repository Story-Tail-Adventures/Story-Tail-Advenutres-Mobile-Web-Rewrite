import { describe, expect, it } from "vitest";

import {
  COMPONENT_COLUMNS,
  COMPONENT_KINDS,
  COMPONENT_RAIL,
  COMPONENT_SPECS,
  centsToDollars,
  componentFromFormData,
  componentKindFromParam,
  dollarsToCents,
  emptyComponent,
  validateComponent,
} from "@/lib/agent/components";

/**
 * §3.4.5 – §3.4.12's spec and its money handling.
 *
 * The money tests are the reason this file exists. Everything else on this screen either
 * typechecks or fails loudly; `dollarsToCents` is the one place a wrong answer is a
 * plausible-looking number that reaches `cost_cents` and then the trip total, the client's
 * proposal and §3.7's commission reconciliation without anything complaining.
 */

describe("the seven kinds", () => {
  it("matches component_kind exactly", () => {
    expect([...COMPONENT_KINDS]).toEqual([
      "flight",
      "hotel",
      "cruise",
      "transfer",
      "excursion",
      "insurance",
      "custom",
    ]);
  });

  it("puts every kind in the rail, once", () => {
    // A kind with a spec and no rail entry is a sheet nothing can open.
    expect([...COMPONENT_RAIL].sort()).toEqual([...COMPONENT_KINDS].sort());
    expect(new Set(COMPONENT_RAIL).size).toBe(COMPONENT_RAIL.length);
  });

  it("gives every kind a name label and a notes field", () => {
    for (const kind of COMPONENT_KINDS) {
      const spec = COMPONENT_SPECS[kind];
      // `display_name` is NOT NULL, so every sheet must ask for it in that kind's own words.
      expect(spec.nameLabel.length).toBeGreaterThan(0);
      expect(spec.detail.some((f) => f.key === "notes")).toBe(true);
    }
  });

  it("uses snake_case detail keys, matching what is stored", () => {
    // The first draft was camelCase. Nothing refuses a camelCase key — it simply never
    // matches a stored one, so the sheet renders blank over a component that has the data
    // and the save writes the blank over it. `supabase/functions/_shared/component.ts`
    // holds the other copy and asserts the same thing from its side.
    for (const kind of COMPONENT_KINDS) {
      for (const field of COMPONENT_SPECS[kind].detail) {
        expect(field.key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("names no detail field twice within a kind", () => {
    for (const kind of COMPONENT_KINDS) {
      const keys = COMPONENT_SPECS[kind].detail.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("refuses dining, which §23 sends to custom", () => {
    // The prototype draws A3410_AddDining and the builder rail lists "Dining · manual".
    expect(componentKindFromParam("dining")).toBeNull();
    expect(componentKindFromParam("flight")).toBe("flight");
    expect(componentKindFromParam(undefined)).toBeNull();
  });
});

describe("no column can go missing on a save", () => {
  // `agent_upsert_trip_component` writes EVERY column on an update, so a column the form
  // does not post arrives as NULL and clears what was there. The sheet shows the ones its
  // kind names and carries the rest as hidden inputs — these tests hold both halves of
  // that together.
  //
  // It is not hypothetical. The flight sheet shipped without an "Arrives on" field, and
  // saving a seeded flight with no edit at all emptied its `end_date`.

  it("lists every column an upsert writes", () => {
    expect([...COMPONENT_COLUMNS].sort()).toEqual([
      "confirmationNumber",
      "endDate",
      "endTime",
      "location",
      "startDate",
      "startTime",
    ]);
  });

  it("gives every column a slot on the values object", () => {
    // `values[col]` backs the hidden inputs. A column with no slot renders
    // `value={undefined}`, which React drops — and the column clears again.
    const values = emptyComponent("insurance");
    for (const col of COMPONENT_COLUMNS) {
      expect(values).toHaveProperty(col);
      expect(typeof values[col]).toBe("string");
    }
  });

  it("shows or carries every column, for every kind", () => {
    for (const kind of COMPONENT_KINDS) {
      const shown = Object.keys(COMPONENT_SPECS[kind].columns);
      const carried = COMPONENT_COLUMNS.filter((c) => !COMPONENT_SPECS[kind].columns[c]);
      expect([...shown, ...carried].sort()).toEqual([...COMPONENT_COLUMNS].sort());
    }
  });

  it("round-trips a full form back to the same values", () => {
    // The whole invariant in one assertion: what the sheet renders, posts back unchanged.
    const form = new FormData();
    form.append("kind", "flight");
    form.append("displayName", "AA 1413 · MIA → MBJ");
    form.append("location", "Miami International Airport");
    form.append("startDate", "2026-12-04");
    form.append("endDate", "2026-12-05");
    form.append("startTime", "23:40");
    form.append("endTime", "06:30");
    form.append("confirmationNumber", "TLR8QV");

    const values = componentFromFormData(form);
    for (const col of COMPONENT_COLUMNS) {
      expect(values[col]).toBe((form.get(col) ?? "").toString());
    }
  });
});

describe("dollarsToCents", () => {
  it("reads a plain amount", () => {
    expect(dollarsToCents("4980")).toBe(498000);
    expect(dollarsToCents("4980.00")).toBe(498000);
    expect(dollarsToCents("4980.5")).toBe(498050);
    expect(dollarsToCents("0")).toBe(0);
    expect(dollarsToCents("")).toBe(0);
  });

  it("strips what someone pastes out of a supplier confirmation", () => {
    expect(dollarsToCents("$4,980.00")).toBe(498000);
    expect(dollarsToCents("  4 980 ")).toBe(498000);
  });

  it("rounds rather than letting a float through", () => {
    // 4980.1 * 100 is 498010.00000000006 in IEEE 754. Truncating it gives 498009 — a cent
    // lost on a figure that looks exactly right, on every row, forever.
    expect(dollarsToCents("4980.10")).toBe(498010);
    expect(dollarsToCents("0.07")).toBe(7);
    expect(dollarsToCents("1.15")).toBe(115);
    expect(dollarsToCents("2.67")).toBe(267);
  });

  it("refuses what is not an amount", () => {
    expect(dollarsToCents("4980.005")).toBeNull();
    expect(dollarsToCents("four thousand")).toBeNull();
    expect(dollarsToCents("4.9.8")).toBeNull();
    expect(dollarsToCents("-50")).toBeNull();
  });

  it("round-trips through centsToDollars", () => {
    for (const cents of ["0", "7", "498000", "498010", "999999999"]) {
      expect(dollarsToCents(centsToDollars(cents))).toBe(Number(cents));
    }
    expect(centsToDollars(null)).toBe("");
    expect(centsToDollars("")).toBe("");
  });
});

describe("validateComponent", () => {
  const base = { ...emptyComponent("flight"), displayName: "American Airlines" };

  it("passes a filled-in flight", () => {
    expect(validateComponent({ ...base, cost: "462.00", commissionPct: "12" })).toBeNull();
  });

  it("requires a name", () => {
    expect(validateComponent({ ...base, displayName: "" })?.displayName).toHaveLength(1);
  });

  it("catches an amount that is not one", () => {
    expect(validateComponent({ ...base, cost: "lots" })?.cost).toHaveLength(1);
    expect(validateComponent({ ...base, commission: "lots" })?.commission).toHaveLength(1);
  });

  it("holds the rate to numeric(5,2)", () => {
    // 1000 does not fit. Refusing here makes it a field message instead of SQLSTATE 22003
    // arriving from Postgres as a bodyless 500.
    expect(validateComponent({ ...base, commissionPct: "1000" })?.commissionPct).toHaveLength(1);
    expect(validateComponent({ ...base, commissionPct: "-1" })?.commissionPct).toHaveLength(1);
    expect(validateComponent({ ...base, commissionPct: "999.99" })).toBeNull();
  });

  it("catches an end date before its start", () => {
    // Postgres has no constraint for this, so it is caught here or nowhere — and here is
    // also the only place that can say WHICH of the two dates is the wrong one.
    const errors = validateComponent({
      ...base,
      startDate: "2026-08-19",
      endDate: "2026-08-12",
    });
    expect(errors?.endDate).toHaveLength(1);
  });

  it("lets a one-day component share a date", () => {
    expect(
      validateComponent({ ...base, startDate: "2026-08-12", endDate: "2026-08-12" }),
    ).toBeNull();
  });
});

describe("componentFromFormData", () => {
  function form(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
  }

  it("reads only the detail keys its kind declares", () => {
    const values = componentFromFormData(
      form({
        kind: "flight",
        displayName: "American Airlines",
        "detail.seat": "14A, 14B",
        // Real on a cruise, not on a flight. Dropping it here is what keeps the action from
        // ever posting a key `_shared/component.ts` would refuse.
        "detail.ship": "Symphony of the Seas",
      }),
    );
    expect(values.detail).toEqual({ seat: "14A, 14B" });
  });

  it("falls back to custom for a kind it does not know", () => {
    // Not a defence against a typo — a `kind` this form cannot render would otherwise
    // index `COMPONENT_SPECS` with undefined and throw inside the action.
    expect(componentFromFormData(form({ kind: "dining" })).kind).toBe("custom");
  });

  it("leaves an unticked checkbox out entirely", () => {
    // An unticked checkbox submits nothing at all, so absence IS the false. There is no
    // "off" value to read and none to store.
    const off = componentFromFormData(form({ kind: "cruise", displayName: "RCL" }));
    expect(off.detail.gratuities_included).toBeUndefined();

    const on = componentFromFormData(
      form({ kind: "cruise", displayName: "RCL", "detail.gratuities_included": "on" }),
    );
    expect(on.detail.gratuities_included).toBe("on");
  });

  it("trims every field", () => {
    const values = componentFromFormData(
      form({ kind: "custom", displayName: "  Welcome bottle  ", location: " In-room " }),
    );
    expect(values.displayName).toBe("Welcome bottle");
    expect(values.location).toBe("In-room");
  });
});
