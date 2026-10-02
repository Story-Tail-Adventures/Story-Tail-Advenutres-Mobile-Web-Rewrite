import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/render";
import { Field } from "./Field";
import { SelectField } from "./Select";
import { TextareaField } from "./Textarea";

/**
 * aria-describedby must only name elements that exist. The hint is hidden while an error
 * shows, and the old markup (and PR 1's port of it) still listed the hint's id then — so on
 * 2.1.2 the password field described itself with an id that was not in the document.
 */
function describedIdsExist(el: HTMLElement) {
  const ids = (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  return ids.map((id) => [id, document.getElementById(id) !== null] as const);
}

describe("field aria wiring", () => {
  it("Field points at the hint, then at the error instead of it", () => {
    const { rerender } = renderWithTheme(<Field id="pw" name="pw" label="Password" hint="12 or more" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "pw-hint");

    rerender(<Field id="pw" name="pw" label="Password" hint="12 or more" error="Too short" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(describedIdsExist(input)).toEqual([["pw-error", true]]);
  });

  it("SelectField and TextareaField point at a hint that is shown", () => {
    renderWithTheme(
      <>
        <SelectField
          id="c"
          name="c"
          label="Country"
          hint="Where you live"
          options={[{ value: "us", label: "United States" }]}
        />
        <TextareaField id="n" name="n" label="Notes" hint="Optional" />
      </>,
    );
    expect(describedIdsExist(screen.getByLabelText("Country"))).toEqual([["c-hint", true]]);
    expect(describedIdsExist(screen.getByLabelText("Notes"))).toEqual([["n-hint", true]]);
  });

  it("SelectField and TextareaField follow the same rule", () => {
    renderWithTheme(
      <>
        <SelectField
          id="c"
          name="c"
          label="Country"
          hint="Where you live"
          error="Pick one"
          options={[{ value: "us", label: "United States" }]}
        />
        <TextareaField id="n" name="n" label="Notes" hint="Optional" error="Too long" />
      </>,
    );
    expect(describedIdsExist(screen.getByLabelText("Country"))).toEqual([["c-error", true]]);
    expect(describedIdsExist(screen.getByLabelText("Notes"))).toEqual([["n-error", true]]);
  });
});
