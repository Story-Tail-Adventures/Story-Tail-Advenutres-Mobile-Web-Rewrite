import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TRIPS } from "@/content/public/trips";
import JoinPage, { metadata } from "./page";

// The form binds the server action through useActionState; in jsdom it is never invoked.
vi.mock("./actions", () => ({ signUpAction: vi.fn(async () => ({})) }));

type Params = Record<string, string | string[] | undefined>;

async function renderPage(params: Params = {}) {
  return render(await JoinPage({ searchParams: Promise.resolve(params) }));
}

function hiddenValue(container: HTMLElement, name: string): string | null {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value ?? null;
}

describe("2.0.6 sign-up gate — untrusted URL parameters", () => {
  it("renders one h1 for the quote intent and never echoes an unknown trip", async () => {
    const { container } = await renderPage({
      intent: "quote",
      trip: "<b>evil-resort</b>",
      next: "//evil.com",
    });

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Create an account to send Gyasi your trip details.");
    expect(container.textContent).not.toContain("evil");

    // The open-redirect guard runs before the value reaches the form or the sign-in link.
    expect(hiddenValue(container, "next")).toBe("/dashboard");
    expect(hiddenValue(container, "trip")).toBe("");
    expect(hiddenValue(container, "intent")).toBe("quote");
    expect(screen.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("names a catalog trip in the headline and carries its slug, not the raw parameter", async () => {
    const trip = TRIPS[0];
    const { container } = await renderPage({ intent: "quote", trip: trip.slug });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      `Create an account to send Gyasi your trip details for ${trip.name}.`,
    );
    expect(hiddenValue(container, "trip")).toBe(trip.slug);
    expect(screen.getByRole("link", { name: "Email Gyasi instead →" }).getAttribute("href")).toMatch(
      /^mailto:/,
    );
  });

  it("falls back to the default headline and label for an unknown intent or a repeated key", async () => {
    await renderPage({ intent: ["quote", "save"], trip: ["a", "b"] });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Create an account to start planning with Gyasi.",
    );
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("passes a safe next through to the form and the sign-in link", async () => {
    const next = "/explore/results?topic=cruises";
    const { container } = await renderPage({ intent: "save", next });

    expect(hiddenValue(container, "next")).toBe(next);
    expect(screen.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(next)}`,
    );
    expect(screen.getByRole("button", { name: "Create account & save" })).toBeInTheDocument();
  });
});

describe("2.0.6 sign-up gate — form semantics", () => {
  it("labels every field, uses a real terms checkbox and disables the social buttons", async () => {
    await renderPage({ intent: "quote" });

    expect(screen.getByLabelText("First name")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.getByLabelText("Last name")).toHaveAttribute("autocomplete", "family-name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAccessibleDescription(
      "12+ characters with a number, a capital and a lowercase letter",
    );

    const terms = screen.getByLabelText(/I agree to the/);
    expect(terms).toHaveAttribute("type", "checkbox");
    expect(terms).toHaveAttribute("name", "terms");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/legal/privacy");

    for (const name of ["Continue with Google", "Continue with Apple"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Social sign-in isn't switched on yet — use your email below.");
      expect(button.querySelector("svg")).toBeNull();
    }

    expect(screen.getByRole("button", { name: "Create account & send my request" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("lists the three value-prop bullets as a real list", async () => {
    await renderPage();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Save searches & favorites",
      "View Gyasi's curated proposals",
      "Authorize cards securely · paid to suppliers, not us",
    ]);
  });
});

describe("2.0.6 sign-up gate — metadata", () => {
  it("is noindex/follow with a canonical of /join", () => {
    expect(metadata.title).toBe("Create your account");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/join");
    expect(metadata.openGraph?.url).toBe("/join");
  });
});
