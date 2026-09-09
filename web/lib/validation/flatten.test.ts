import { describe, expect, it } from "vitest";
import { flattenIssues, formLevelIssues } from "./flatten";

const FIELDS = ["email", "password"] as const;

describe("flattenIssues", () => {
  it("groups messages under the field they belong to", () => {
    expect(
      flattenIssues(
        {
          issues: [
            { path: ["email"], message: "one" },
            { path: ["password"], message: "two" },
            { path: ["password"], message: "three" },
          ],
        },
        FIELDS,
      ),
    ).toEqual({ email: ["one"], password: ["two", "three"] });
  });

  it("omits fields with no issues rather than giving them empty arrays", () => {
    const result = flattenIssues({ issues: [{ path: ["email"], message: "one" }] }, FIELDS);
    expect(result).toEqual({ email: ["one"] });
    expect("password" in result).toBe(false);
  });

  it("drops issues that belong to no listed field", () => {
    // A refinement attached to the object as a whole has an empty path. Inventing a field
    // name for it would render an error next to an input that is not the problem.
    expect(
      flattenIssues(
        {
          issues: [
            { path: [], message: "form-level" },
            { path: ["unknown"], message: "elsewhere" },
            { path: ["email"], message: "kept" },
          ],
        },
        FIELDS,
      ),
    ).toEqual({ email: ["kept"] });
  });

  it("ignores a numeric first path segment", () => {
    expect(flattenIssues({ issues: [{ path: [0, "email"], message: "x" }] }, FIELDS)).toEqual({});
  });
});

describe("formLevelIssues", () => {
  it("returns exactly what flattenIssues drops", () => {
    // A rule about a COMBINATION of fields has no single input to point at. Before this
    // existed, such a rule refused the submit and rendered nothing — a dead button.
    const error = {
      issues: [
        { path: [], message: "An address needs a city as well as a street" },
        { path: ["email"], message: "kept by flattenIssues" },
        { path: ["unknown"], message: "belongs to no rendered field" },
      ],
    };

    expect(formLevelIssues(error, FIELDS)).toEqual([
      "An address needs a city as well as a street",
      "belongs to no rendered field",
    ]);
    expect(flattenIssues(error, FIELDS)).toEqual({ email: ["kept by flattenIssues"] });
  });

  it("says the same thing once", () => {
    // Two refinements can reach the same conclusion; the reader does not need it twice.
    const error = {
      issues: [
        { path: [], message: "Fill in the whole address or none of it" },
        { path: [], message: "Fill in the whole address or none of it" },
      ],
    };
    expect(formLevelIssues(error, FIELDS)).toEqual(["Fill in the whole address or none of it"]);
  });

  it("is empty when every issue found a home", () => {
    expect(formLevelIssues({ issues: [{ path: ["email"], message: "x" }] }, FIELDS)).toEqual([]);
  });
});
