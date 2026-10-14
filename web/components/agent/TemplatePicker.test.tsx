import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.10.3's picker: grouped and searchable, previewed with the thread's real data, and "Insert
 * as-is" off whenever a field has no value here (Gyasi, 2026-10-14).
 */

import { TemplatePicker } from "./TemplatePicker";
import { renderWithTheme } from "@/test/render";
import type { MessageTemplate } from "@/lib/agent/templateLibrary";

const tpl = (id: string, category: MessageTemplate["category"], name: string, body: string, tags: string[] = []) => ({
  id,
  category,
  name,
  body,
  tags,
  archived: false,
  lastEditedLabel: "Last edited Oct 14",
});

const TEMPLATES: MessageTemplate[] = [
  tpl("b", "booking_confirmation", "Booking confirmation", "{{trip.name}} is booked!"),
  tpl("l", "lead_response", "Lead response", "Hi {{client.firstName}}, thanks!", ["Warm"]),
  tpl("p", "payment_reminder", "Payment reminder", "{{payment.amount}} due {{payment.dueDate}}"),
];

function open(props: Partial<React.ComponentProps<typeof TemplatePicker>> = {}) {
  const onInsert = vi.fn();
  renderWithTheme(
    <TemplatePicker
      open
      onClose={() => {}}
      templates={TEMPLATES}
      values={{ "client.firstName": "Maya", "trip.name": "Negril" }}
      clientFirstName="Maya"
      startOn={null}
      onInsert={onInsert}
      {...props}
    />,
  );
  return onInsert;
}

describe("TemplatePicker", () => {
  it("lists in the library's order and starts on the first, merged with the thread's data", () => {
    open();
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Lead response")).toBeLessThan(names.indexOf("Booking confirmation"));
    expect(screen.getByRole("button", { name: "Lead response" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Preview · for Maya")).toBeInTheDocument();
    expect(screen.getByText("Hi Maya, thanks!")).toBeInTheDocument();
  });

  it("Insert as-is hands over the merged words", async () => {
    const user = userEvent.setup();
    const onInsert = open();
    await user.click(screen.getByRole("button", { name: "Insert as-is" }));
    expect(onInsert).toHaveBeenCalledWith("Hi Maya, thanks!", false);
  });

  it("a field with no value turns Insert as-is off and says what is missing; Insert & edit keeps the token", async () => {
    const user = userEvent.setup();
    const onInsert = open();
    await user.click(screen.getByRole("button", { name: "Payment reminder" }));
    const asIs = screen.getByRole("button", { name: "Insert as-is" });
    expect(asIs).toBeDisabled();
    expect(
      screen.getByText(/This one needs a payment, which this thread doesn't have\. Use Insert & edit to fill it in yourself\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Insert & edit" }));
    expect(onInsert).toHaveBeenCalledWith("{{payment.amount}} due {{payment.dueDate}}", true);
  });

  it("searches names, tags and body text", async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "warm");
    expect(screen.getByRole("button", { name: "Lead response" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Booking confirmation" })).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: "Search templates" }));
    await user.type(screen.getByRole("searchbox", { name: "Search templates" }), "nothing like this");
    expect(screen.getByText("No templates match.")).toBeInTheDocument();
  });

  it("startOn opens on that category", () => {
    open({ startOn: "payment_reminder" });
    expect(screen.getByRole("button", { name: "Payment reminder" })).toHaveAttribute("aria-current", "true");
  });

  it("with no templates, points at making one", () => {
    open({ templates: [] });
    expect(screen.getByText(/No templates yet\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New template" })).toHaveAttribute("href", "/agent/messages/templates/new");
  });
});
