import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TRIPS } from "@/content/public/trips";
import MessagePage, { metadata } from "./page";

// The form binds the server action through useActionState; in jsdom it is never invoked.
vi.mock("./actions", () => ({ sendMessageAction: vi.fn(async () => ({})) }));

type Params = Record<string, string | string[] | undefined>;

async function renderPage(params: Params = {}) {
  return render(await MessagePage({ searchParams: Promise.resolve(params) }));
}

function hiddenValue(container: HTMLElement, name: string): string | null {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value ?? null;
}

describe("2.0.12 Message Gyasi — untrusted URL parameters", () => {
  it("names a catalog trip by its catalog name, and nothing a visitor typed", async () => {
    const trip = TRIPS[0];
    const { container } = await renderPage({ from: "detail", trip: trip.slug });
    expect(screen.getByText(`About: ${trip.name}`)).toBeTruthy();
    expect(hiddenValue(container, "trip")).toBe(trip.slug);
    expect(hiddenValue(container, "from")).toBe("detail");
  });

  it("drops an unknown trip, source or topic", async () => {
    const { container } = await renderPage({ from: "<evil>", trip: "<b>evil</b>", topic: "evil" });
    expect(container.textContent).not.toContain("evil");
    expect(container.textContent).not.toContain("About:");
    expect(hiddenValue(container, "trip")).toBe("");
    expect(hiddenValue(container, "topic")).toBe("");
    expect(hiddenValue(container, "from")).toBe("");
  });

  it("names a topic", async () => {
    await renderPage({ from: "topic", topic: "honeymoons" });
    expect(screen.getByText("About: a honeymoon")).toBeTruthy();
  });

  it("keeps only plain characters of a campaign tag", async () => {
    const { container } = await renderPage({ utm_source: "insta<script>gram" });
    expect(hiddenValue(container, "utm_source")).toBe("instascriptgram");
  });
});

describe("2.0.12 Message Gyasi — the form", () => {
  it("asks for the five fields, two of them optional, and says how the note is used", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Send Gyasi a note");
    expect(screen.getByLabelText("First name")).toBeRequired();
    expect(screen.getByLabelText("Last name (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Phone (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Your note")).toBeRequired();
    expect(screen.getByText(/Gyasi will only use this to reply to you/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/legal/privacy");
    expect(screen.getByRole("button", { name: "Send to Gyasi" })).toBeTruthy();
  });

  it("carries the hidden field only a bot fills, out of the tab order, and when the form was drawn", async () => {
    const before = Date.now();
    const { container } = await renderPage();
    const honeypot = container.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot?.tabIndex).toBe(-1);
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(Number(hiddenValue(container, "startedAt"))).toBeGreaterThanOrEqual(before);
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
