import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithTheme } from "@/test/render";
import { ExportCenterForm } from "./ExportCenterForm";

/**
 * §3.11.8's form submits exactly what the route expects: dates for the dated types, nothing but
 * the contact switch for Clients, and the switch never carried across a type change. The route
 * and the function refuse a mismatch too; this keeps the advisor from ever meeting a refusal.
 */

function fields(form: HTMLFormElement) {
  return [...new FormData(form).entries()];
}

describe("ExportCenterForm", () => {
  it("sends the type and a Jan 1 to today range by default", () => {
    renderWithTheme(<ExportCenterForm today="2026-10-21" />);
    const form = screen.getByRole("button", { name: /Download CSV/ }).closest("form")!;
    expect(form.getAttribute("action")).toBe("/agent/reports/download");
    expect(form.getAttribute("method")).toBe("get");
    expect(fields(form)).toEqual([["type", "ledger"], ["from", "2026-01-01"], ["to", "2026-10-21"]]);
  });

  it("for Clients: no dates, and contact details only once ticked", () => {
    renderWithTheme(<ExportCenterForm today="2026-10-21" />);
    fireEvent.change(screen.getByLabelText("What to export"), { target: { value: "clients" } });
    const form = screen.getByRole("button", { name: /Download CSV/ }).closest("form")!;
    expect(fields(form)).toEqual([["type", "clients"]]);
    const box = screen.getByRole("checkbox", { name: /Include contact details/ });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(fields(form)).toEqual([["type", "clients"], ["contact", "1"]]);
  });

  it("never carries the switch to another type, and keeps the dates picked before", () => {
    renderWithTheme(<ExportCenterForm today="2026-10-21" />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("What to export"), { target: { value: "clients" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Include contact details/ }));
    fireEvent.change(screen.getByLabelText("What to export"), { target: { value: "trips" } });
    const form = screen.getByRole("button", { name: /Download CSV/ }).closest("form")!;
    expect(fields(form)).toEqual([["type", "trips"], ["from", "2026-03-01"], ["to", "2026-10-21"]]);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("lets the browser refuse a reversed range: To cannot be before From", () => {
    renderWithTheme(<ExportCenterForm today="2026-10-21" />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-05-01" } });
    expect(screen.getByLabelText("To")).toHaveAttribute("min", "2026-05-01");
    expect(screen.getByLabelText("From")).toHaveAttribute("max", "2026-10-21");
  });
});
