import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StickyCta } from "./StickyCta";

const PRICE = { from: { amountCents: 329_000, currency: "USD" as const }, saveHref: "/join?intent=save" };

describe("StickyCta (Screen Inventory §4.3 Pattern H mobile bottom bar)", () => {
  /**
   * The regression this file exists for. The bar is `position: fixed`, so the page has to
   * reserve its height — but PublicFooter renders *after* {children} in (public)/layout.tsx,
   * and StickyCta renders inside {children}. A spacer emitted here therefore reserved space
   * above the footer and left the footer itself under the bar: measured at 375x812 on
   * /caribbean, 16px of an 82px footer stayed visible and all six legal links (the only route
   * to the 2.0.7 pages on a phone) were unreachable. The reserve now lives on `.pub-surface`
   * in public.css, where it lands after the footer.
   */
  it("renders no spacer of its own — the shell owns the reserve", () => {
    const { container } = render(<StickyCta primary={{ label: "Request a quote", href: "/join" }} />);
    expect(container.querySelector(".sticky-cta-spacer")).toBeNull();
    expect(container.querySelector(".sticky-cta")).not.toBeNull();
  });

  it("renders link CTAs as links and keeps mailto/external as plain anchors", () => {
    render(
      <StickyCta
        primary={{ label: "Request a quote", href: "/join?intent=quote" }}
        secondary={{ label: "Message", href: "mailto:gyasi@example.com" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Request a quote" })).toHaveAttribute(
      "href",
      "/join?intent=quote",
    );
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute(
      "href",
      "mailto:gyasi@example.com",
    );
  });

  /** 2.0.3: M203's card has no button — the bar is the Search, so it must submit the form. */
  it("renders a submitFor CTA as a submit button bound to that form", () => {
    render(<StickyCta primary={{ label: "Search", submitFor: "explore-search-stacked", icon: "search" }} />);
    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("form", "explore-search-stacked");
    expect(screen.queryByRole("link", { name: "Search" })).toBeNull();
  });

  /**
   * 2.0.5, §4.4: "'Message Gyasi without an account' is a sticky bottom button on mobile."
   * Four controls do not fit one 360px row, so the guest path wraps to a second full-width
   * row and the shell reserves the taller height via `.sticky-cta-tall`.
   */
  it("wraps the guest CTA to a second row and flags the taller reserve", () => {
    const { container } = render(
      <StickyCta
        primary={{ label: "Request a quote", href: "/join" }}
        price={PRICE}
        guest={{ label: "Message Gyasi without an account →", href: "mailto:gyasi@example.com" }}
      />,
    );
    const bar = container.querySelector(".sticky-cta");
    expect(bar).toHaveClass("sticky-cta-tall");

    const guest = screen.getByRole("link", { name: "Message Gyasi without an account →" });
    expect(guest).toHaveClass("sticky-cta-row2");
    expect(guest.getAttribute("href")).toMatch(/^mailto:/);
  });

  it("stays single-row when there is no guest CTA", () => {
    const { container } = render(
      <StickyCta primary={{ label: "Request a quote", href: "/join" }} price={PRICE} />,
    );
    expect(container.querySelector(".sticky-cta")).not.toHaveClass("sticky-cta-tall");
    expect(container.querySelector(".sticky-cta-row2")).toBeNull();
  });
});
