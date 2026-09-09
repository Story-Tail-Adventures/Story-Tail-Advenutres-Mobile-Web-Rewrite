import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MARKETING_SITE_URL } from "@/content/public/contact";
import LandingPage, { metadata } from "./page";

// next/image needs the Next runtime's loader config; a plain <img> is enough for a smoke test.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe("2.0.1 landing page", () => {
  it("renders one h1 with the hero headline and its gold script tail", () => {
    render(<LandingPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Plan a rest worthy of the world He made.");
  });

  it("links every CTA to a real route (both the desktop and mobile orderings)", () => {
    render(<LandingPage />);
    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/login");
    }
    for (const link of screen.getAllByRole("link", { name: "Create an account" })) {
      expect(link).toHaveAttribute("href", "/join");
    }
    for (const link of screen.getAllByRole("link", { name: "Take a quick tour →" })) {
      expect(link).toHaveAttribute("href", "/how-it-works");
    }
    expect(screen.getByRole("link", { name: "Browse trip ideas →" })).toHaveAttribute("href", "/explore");
    const marketing = screen.getByRole("link", { name: /adventures\.story-tail\.com/ });
    expect(marketing).toHaveAttribute("href", MARKETING_SITE_URL);
    expect(marketing).toHaveAttribute("target", "_blank");
    expect(marketing).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the three mobile feature cards as h3s under a labelled section", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 2, name: "WHAT YOU CAN DO HERE" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "View your trips",
      "Authorize cards",
      "Message Gyasi",
    ]);
  });

  it("emits TravelAgency JSON-LD", () => {
    const { container } = render(<LandingPage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? "{}");
    expect(data["@type"]).toBe("TravelAgency");
    expect(data.sameAs).toEqual([MARKETING_SITE_URL]);
  });

  it("uses an absolute title so the layout template does not double the brand", () => {
    expect(metadata.title).toEqual({ absolute: "Story-Tail Adventures · Your travel portal" });
    expect(metadata.alternates?.canonical).toBe("/");
  });
});
