import { describe, expect, it } from "vitest";

import { mapValuesFromForm, selectionsFromMap, validateMap } from "./statementForm";

/**
 * §3.7.5's column map, as the form holds it (one choice per header) and as the Edge
 * Function takes it (field → header index). The function checks the same rules; these are
 * here so the sentence lands against the map, not as a rejection at the top.
 */

describe("selectionsFromMap", () => {
  it("turns field → index into one choice per header, ignoring what does not fit", () => {
    expect(selectionsFromMap({ reference: 0, received: 2, bogus: 1, fee: 9 }, 3)).toEqual(["reference", "", "received"]);
    expect(selectionsFromMap(null, 2)).toEqual(["", ""]);
  });
});

describe("validateMap", () => {
  it("returns field → index, and no statement date when a column carries the date", () => {
    expect(validateMap({ selections: ["reference", "received", "paid_on"], statementDate: "2026-10-01" })).toEqual({
      ok: true,
      columnMap: { reference: 0, received: 1, paid_on: 2 },
      statementDate: null,
    });
  });

  it("takes the statement date when no column does", () => {
    expect(validateMap({ selections: ["", "received"], statementDate: "2026-10-01" })).toEqual({
      ok: true,
      columnMap: { received: 1 },
      statementDate: "2026-10-01",
    });
  });

  it("names a field chosen twice", () => {
    const r = validateMap({ selections: ["fee", "received", "fee"], statementDate: "2026-10-01" });
    expect(r).toEqual({ ok: false, fieldErrors: { map: "Fee withheld is chosen for two columns. Pick one." } });
  });

  it("needs the commission column, and a date from somewhere", () => {
    expect(validateMap({ selections: ["reference"], statementDate: "2026-10-01" }))
      .toEqual({ ok: false, fieldErrors: { map: "Choose the column that holds the commission paid." } });
    expect(validateMap({ selections: ["received"], statementDate: "" }))
      .toEqual({ ok: false, fieldErrors: { statementDate: "Choose the paid-on column, or enter the date the statement paid." } });
  });
});

describe("mapValuesFromForm", () => {
  it("reads col-0 … col-n and the statement date", () => {
    const form = new FormData();
    form.set("col-0", "reference");
    form.set("col-2", "received");
    form.set("statementDate", "2026-10-01");
    expect(mapValuesFromForm(form, 3)).toEqual({ selections: ["reference", "", "received"], statementDate: "2026-10-01" });
  });
});
