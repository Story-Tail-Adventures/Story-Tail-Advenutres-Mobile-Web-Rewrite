import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TRIPS } from "@/content/public/trips";
import { staImg } from "@/lib/images";
import { joinHref } from "@/lib/public/links";
import { resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  HONEYMOONS_CHRISTIAN_CARD,
  HONEYMOONS_FEATURED,
  HONEYMOONS_NOTE,
  HONEYMOONS_STYLES,
  honeymoonsFeaturedOverline,
} from "./content";
import HoneymoonsPage, { metadata } from "./page";

// next/image needs the Next runtime's loader config; a plain <img> is enough for a smoke test.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const TOPIC = "honeymoons";
const PATH = "/honeymoons";

describe("2.0.10 Honeymoons page", () => {
  it("renders one h1 with the headline and its gold script tail", () => {
    render(<HoneymoonsPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("The first rest, after the I-do's.");
  });

  it("renders Gyasi's note with the italic question, and no photograph of Gyasi", () => {
    const { container } = render(<HoneymoonsPage />);
    const question = container.querySelector("i");
    expect(question).toHaveTextContent(HONEYMOONS_NOTE.question);
    expect(question?.parentElement).toHaveTextContent(
      `${HONEYMOONS_NOTE.before}${HONEYMOONS_NOTE.question}${HONEYMOONS_NOTE.after}`,
    );
    expect(screen.getByText(HONEYMOONS_NOTE.overline)).toBeInTheDocument();
    expect(screen.getByText("GS")).toBeInTheDocument();
  });

  it("renders the three styles and every featured package (all six) with a derived count", () => {
    render(<HoneymoonsPage />);
    for (const style of HONEYMOONS_STYLES) {
      // MediaCard renders a stacked card (md+) and a row (<md); both carry the h3.
      expect(screen.getAllByRole("heading", { level: 3, name: style.title })).toHaveLength(2);
    }
    const trips = tripsForTopic(TRIPS, TOPIC);
    expect(trips.length).toBeGreaterThan(4);
    expect(screen.getByText(honeymoonsFeaturedOverline(trips.length))).toBeInTheDocument();

    const section = screen.getByRole("region", { name: HONEYMOONS_FEATURED.title });
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
      trips.flatMap((trip) => [trip.name, trip.name]),
    );
    const quoteHrefs = within(section)
      .getAllByRole("link", { name: "Request quote" })
      .map((link) => link.getAttribute("href"));
    expect(new Set(quoteHrefs)).toEqual(
      new Set(trips.map((trip) => joinHref({ intent: "quote", trip: trip.slug, next: PATH }))),
    );
  });

  it("renders the Christian-couples card as designed, with both CTAs", () => {
    render(<HoneymoonsPage />);
    const card = screen.getByRole("region", { name: HONEYMOONS_CHRISTIAN_CARD.title });
    expect(within(card).getByText(HONEYMOONS_CHRISTIAN_CARD.overline)).toBeInTheDocument();
    expect(within(card).getByText(HONEYMOONS_CHRISTIAN_CARD.body)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Request a quote" })).toHaveAttribute(
      "href",
      joinHref({ intent: "quote", next: PATH }),
    );
    expect(within(card).getByRole("link", { name: "See the curated list →" })).toHaveAttribute(
      "href",
      resultsHref({ vibes: ["honeymoon"] }),
    );
  });

  it("sends every quote CTA to the gate with this page as next, and message CTAs to the inquiry email", () => {
    render(<HoneymoonsPage />);
    // Inquiry bar, Christian-couples card, closing band, sticky bar.
    const quoteLinks = screen.getAllByRole("link", { name: "Request a quote" });
    expect(quoteLinks).toHaveLength(4);
    for (const link of quoteLinks) {
      expect(link).toHaveAttribute("href", joinHref({ intent: "quote", next: PATH }));
    }
    for (const name of ["Message Gyasi first", "Message Gyasi"]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toMatch(/^mailto:/);
    }
  });

  it("has canonical and Open Graph metadata with the hero image", () => {
    expect(metadata.title).toBe("Honeymoons");
    expect(metadata.alternates?.canonical).toBe(PATH);
    expect(metadata.openGraph?.url).toBe(PATH);
    const [image] = [metadata.openGraph?.images].flat();
    expect(image).toEqual({ url: staImg("overwater", 1200, 630), width: 1200, height: 630 });
  });
});
