import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithTheme } from "@/test/render";
import { InquiryBar, type InquiryField } from "./InquiryBar";

const FIELDS: readonly InquiryField[] = [
  { name: "dest", label: "Destination", placeholder: "Anywhere Caribbean", icon: "map", type: "text" },
  { name: "dates", label: "When", placeholder: "Flexible dates", icon: "calendar", type: "dates" },
  { name: "travelers", label: "Travelers", placeholder: "2 adults", icon: "user", type: "number" },
  { name: "vibe", label: "Vibe", placeholder: "Beach + rest", icon: "palm", type: "text" },
];

describe("InquiryBar (topic pages' StickyInquireBar, as a form)", () => {
  it("is a GET search form to the results page when it opens a search", () => {
    renderWithTheme(
      <InquiryBar
        sticky
        fields={FIELDS.slice(0, 3)}
        form={{ to: "results", label: "Find a sailing", hidden: { mode: "cruises" } }}
        action={{ label: "See what's sailing", icon: "search" }}
      />,
    );
    const form = screen.getByRole("search", { name: "Find a sailing" });
    expect(form.tagName).toBe("FORM");
    expect(form).toHaveAttribute("action", "/explore/results");
    expect(form.querySelector('input[type="hidden"][name="mode"]')).toHaveValue("cruises");
    // The picker writes the stay as `in` / `out`, the same two params the results page reads.
    expect(form.querySelector('[name="in"]')).not.toBeNull();
    expect(form.querySelector('[name="out"]')).not.toBeNull();
    // Exactly one submit: a picker button missing type="button" would submit on every day.
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(form.closest(".sticky-under-topbar")).not.toBeNull();
  });

  it("is a plain GET form to /quote when it asks for a quote, and not a search landmark", () => {
    renderWithTheme(
      <InquiryBar
        fields={FIELDS}
        form={{ to: "quote", label: "Ask Gyasi about a Caribbean week", hidden: { topic: "caribbean" } }}
        action={{ label: "Request a quote", icon: "message" }}
      />,
    );
    expect(screen.queryByRole("search")).toBeNull();
    const form = screen.getByRole("form", { name: "Ask Gyasi about a Caribbean week" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/quote");
    expect(form.querySelector('input[type="hidden"][name="topic"]')).toHaveValue("caribbean");
    expect(form.closest(".sticky-under-topbar")).toBeNull();
  });

  it("starts every cell empty, with a visible label tied to its control", () => {
    renderWithTheme(
      <InquiryBar
        fields={FIELDS}
        form={{ to: "quote", label: "Quote", hidden: { topic: "honeymoons" } }}
        action={{ label: "Request a quote" }}
      />,
    );
    const form = screen.getByRole("form", { name: "Quote" });
    for (const field of FIELDS.filter((f) => f.type !== "dates")) {
      const input = within(form).getByLabelText(field.label) as HTMLInputElement;
      expect(input.name).toBe(field.name);
      expect(input.value).toBe("");
      expect(input.placeholder).toBe(field.placeholder);
    }
    const travelers = within(form).getByLabelText("Travelers") as HTMLInputElement;
    expect(travelers.type).toBe("number");
    expect(travelers.min).toBe("1");
    expect(travelers.max).toBe("20");
    // "When" names the picker's own control rather than an input of this bar's.
    expect(within(form).getAllByLabelText("When").length).toBeGreaterThan(0);
  });
});
