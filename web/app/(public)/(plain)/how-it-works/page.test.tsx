import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";
import HowItWorksPage, { metadata } from "./page";

describe("2.0.2 how it works page", () => {
  it("renders one h1 and the three steps as an ordered list", () => {
    render(<HowItWorksPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("You ask. We plan together. You go and rest.");
    const steps = screen.getAllByRole("list")[0];
    expect(steps.tagName).toBe("OL");
    expect(steps.querySelectorAll("li")).toHaveLength(3);
  });

  it("routes the CTAs through the link builders", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", { name: /Request a quote/ })).toHaveAttribute(
      "href",
      "/join?intent=quote&next=%2Fhow-it-works",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "message Gyasi without one" }).getAttribute("href")).toMatch(
      /^mailto:/,
    );
  });

  it("renders every desktop FAQ item and the welcome line", () => {
    const { container } = render(<HowItWorksPage />);
    expect(container.querySelectorAll("details")).toHaveLength(HOW_IT_WORKS_FAQ.length);
    expect(screen.getByText("Whatever your faith — you're welcome here.")).toBeInTheDocument();
    // The brief's correction: the heart panel must not describe Story-Tail billing.
    const heart = container.querySelector('section[aria-labelledby="our-heart"]');
    expect(heart?.textContent).toContain("up to the limit you set");
    expect(heart?.textContent).not.toMatch(/invoice/i);
  });

  it("has canonical and Open Graph metadata", () => {
    expect(metadata.alternates?.canonical).toBe("/how-it-works");
    expect(metadata.openGraph?.url).toBe("/how-it-works");
  });
});
