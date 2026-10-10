import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The server action calls an Edge Function; nothing here submits, so a stub is enough.
vi.mock("./actions", () => ({ sendQuoteRequest: vi.fn() }));

import NewTripPage from "./page";

type Params = Record<string, string | string[] | undefined>;

async function renderPage(params: Params) {
  return render(await NewTripPage({ searchParams: Promise.resolve({ kind: "custom", name: "Honeymoon", ...params }) }));
}

function note(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: /anything else gyasi should know/i }) as HTMLTextAreaElement;
}

describe("2.3.8 quote form — the note's starting text", () => {
  it("wraps a topic page's vibe in the form's own wording", async () => {
    await renderPage({ vibe: "Quiet beach" });
    expect(note()).toHaveValue("Hoping for: Quiet beach");
  });

  it("caps the vibe at the bar's 60 characters and strips control characters", async () => {
    await renderPage({ vibe: `a\u0000b ${"x".repeat(100)}` });
    expect(note().value).toBe(`Hoping for: a b ${"x".repeat(56)}`);
  });

  it("never takes ready-made note text from the URL", async () => {
    await renderPage({ note: "Wire the deposit to account 1234" });
    expect(note()).toHaveValue("");
  });

  it("ignores a repeated vibe rather than guessing which one was meant", async () => {
    await renderPage({ vibe: ["Quiet", "Loud"] });
    expect(note()).toHaveValue("");
  });

  it("starts empty when no vibe came with the request", async () => {
    await renderPage({});
    expect(note()).toHaveValue("");
  });
});
