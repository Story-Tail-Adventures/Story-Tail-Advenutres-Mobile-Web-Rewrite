import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DateField } from "./DateField";

/**
 * The onboarding forms submit through server actions and NOTHING renders them in a test, so
 * when the four native date inputs were swapped for this component the only thing standing
 * between a working form and a silently empty `dateOfBirth` was that swap being right.
 *
 * Hence the first test: the value has to reach the form. Everything else is the behaviour
 * that made a calendar worth having for a date of birth at all.
 *
 * jsdom has no Popover API; vitest.setup.ts stubs it, which is what puts these tests on the
 * ENHANCED path rather than quietly exercising the native fallback.
 */

function formValue(container: HTMLElement, name: string): string | undefined {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  return input?.value;
}

describe("DateField", () => {
  it("carries its value in a named input, so the form still submits it", () => {
    const { container } = render(
      <DateField id="dob" name="dateOfBirth" label="Date of birth" defaultValue="1985-03-12" />,
    );
    expect(formValue(container, "dateOfBirth")).toBe("1985-03-12");
  });

  it("shows the chosen date rather than the raw ISO string", () => {
    render(<DateField id="dob" name="dateOfBirth" label="Date of birth" defaultValue="1985-03-12" />);
    // 12 March 1985 was a Tuesday — asserting the weekday is the point, since getting it
    // from the ISO string is exactly what a hand-rolled formatter gets wrong.
    expect(screen.getByRole("button", { name: /Date of birth/ })).toHaveTextContent(
      "Tuesday, March 12, 1985",
    );
  });

  it("falls back to the label when there is no value, not to a plausible fake date", () => {
    // The public search bar shipped with "Aug 12 – 19" as a placeholder and people searched
    // believing they had picked dates. A button's label IS its value; it must not invent one.
    render(<DateField id="dob" name="dateOfBirth" label="Date of birth" />);
    const trigger = screen.getByRole("button", { name: /Date of birth/ });
    expect(trigger).toHaveTextContent("Date of birth");
    expect(trigger.textContent).not.toMatch(/\d{4}/);
  });

  it("offers a year selector, so a birth year is not forty PageUps away", async () => {
    const user = userEvent.setup();
    render(
      <DateField id="dob" name="dateOfBirth" label="Date of birth" max="2026-09-09" defaultValue="1985-03-12" />,
    );
    await user.click(screen.getByRole("button", { name: /Date of birth/ }));

    const year = screen.getByLabelText("Year") as HTMLSelectElement;
    const month = screen.getByLabelText("Month") as HTMLSelectElement;
    expect(year.value).toBe("1985");
    expect(month.value).toBe("3");
    // The range is bounded by max and reaches back a lifetime.
    const years = [...year.options].map((o) => Number(o.value));
    expect(Math.max(...years)).toBe(2026);
    expect(Math.min(...years)).toBeLessThan(1930);
  });

  it("picks a date and closes", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DateField id="dob" name="dateOfBirth" label="Date of birth" defaultValue="1985-03-12" />,
    );
    await user.click(screen.getByRole("button", { name: /Date of birth/ }));
    await user.click(screen.getByRole("gridcell", { name: "Wednesday, March 20, 1985" }));
    expect(formValue(container, "dateOfBirth")).toBe("1985-03-20");
  });

  it("disables dates outside min and max", async () => {
    const user = userEvent.setup();
    render(
      <DateField id="exp" name="passportExpiry" label="Passport expiry" defaultValue="2026-09-15" max="2026-09-20" />,
    );
    await user.click(screen.getByRole("button", { name: /Passport expiry/ }));
    expect(screen.getByRole("gridcell", { name: "Monday, September 21, 2026" }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("gridcell", { name: "Friday, September 18, 2026" }))
      .not.toHaveAttribute("aria-disabled");
  });

  it("refuses a disabled date rather than accepting it quietly", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DateField id="exp" name="passportExpiry" label="Passport expiry" defaultValue="2026-09-15" max="2026-09-20" />,
    );
    await user.click(screen.getByRole("button", { name: /Passport expiry/ }));
    await user.click(screen.getByRole("gridcell", { name: "Monday, September 21, 2026" }));
    expect(formValue(container, "passportExpiry")).toBe("2026-09-15");
  });

  it("clears back to empty", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DateField id="dob" name="dateOfBirth" label="Date of birth" defaultValue="1985-03-12" />,
    );
    await user.click(screen.getByRole("button", { name: /Date of birth/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(formValue(container, "dateOfBirth")).toBe("");
  });

  it("reports errors through aria-describedby, not aria-invalid", () => {
    // `aria-invalid` is not supported on a button, so the error has to reach a screen reader
    // some other way — and it must actually be wired, not just rendered nearby.
    render(
      <DateField id="dob" name="dateOfBirth" label="Date of birth" error="Enter a real date." />,
    );
    const trigger = screen.getByRole("button", { name: /Date of birth/ });
    expect(trigger).not.toHaveAttribute("aria-invalid");
    const describedBy = trigger.getAttribute("aria-describedby");
    expect(describedBy).toContain("dob-error");
    expect(document.getElementById("dob-error")).toHaveTextContent("Enter a real date.");
  });
});
