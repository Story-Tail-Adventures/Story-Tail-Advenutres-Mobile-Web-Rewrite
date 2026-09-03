import { describe, expect, it } from "vitest";
import { flattenIssues } from "./flatten";

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
