import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "@/test/render";

// The server action calls an Edge Function; nothing here submits, so a stub is enough.
vi.mock("./actions", () => ({ sendQuoteRequest: vi.fn() }));

import { QuoteForm } from "./QuoteForm";

const TARGET = { kind: "custom", tripType: "custom", name: "Caribbean week", place: "Aruba" } as const;

describe("QuoteForm note", () => {
  it("starts with the text a topic page's Vibe cell carried in, still editable", () => {
    renderWithTheme(<QuoteForm target={TARGET} initialNote="Hoping for: Quiet beach" />);
    const note = screen.getByRole("textbox", { name: /anything else gyasi should know/i });
    expect(note).toHaveValue("Hoping for: Quiet beach");
    expect(note).not.toHaveAttribute("readonly");
    expect(note).toHaveAttribute("name", "note");
  });

  it("starts empty when nothing was carried in", () => {
    renderWithTheme(<QuoteForm target={TARGET} />);
    expect(screen.getByRole("textbox", { name: /anything else gyasi should know/i })).toHaveValue("");
  });
});
