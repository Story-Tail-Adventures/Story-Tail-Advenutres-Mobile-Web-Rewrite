import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSearchParams } from "@/lib/public/search";
import { renderWithTheme } from "@/test/render";
import { FilterRail } from "./FilterRail";

/**
 * The filter form is a GET form, so the URL owns the filters and a new URL re-renders the
 * SAME rail with new `checked` values. MUI's Checkbox reads `defaultChecked` only at mount:
 * without a key that changes with it, the box kept its old state and MUI logged "changing the
 * default checked state of an uncontrolled SwitchBase" (2026-10-03).
 */
describe("FilterRail when the URL changes the filters", () => {
  afterEach(() => vi.restoreAllMocks());

  const rail = (sp: Record<string, string>) => (
    <FilterRail q={parseSearchParams({ mode: "hotels", dest: "Orlando", ...sp })} idPrefix="t" />
  );

  it("shows the state the new URL says, without MUI's warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderWithTheme(rail({ amenity: "52" }));
    expect(screen.getByRole("checkbox", { name: "All-inclusive" })).toBeChecked();

    rerender(rail({}));
    expect(screen.getByRole("checkbox", { name: "All-inclusive" })).not.toBeChecked();

    rerender(rail({ amenity: "52" }));
    expect(screen.getByRole("checkbox", { name: "All-inclusive" })).toBeChecked();
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/default checked state/);
  });
});
