import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ISLANDS } from "@/content/public/islands";
import { TRIPS } from "@/content/public/trips";
import { staImg } from "@/lib/images";
import { joinHref } from "@/lib/public/links";
import { countByTopic, resultsHref, tripsForTopic } from "@/lib/public/search";
import { CARIBBEAN_INTRO, CARIBBEAN_TRIPS, caribbeanSeeAllLabel, caribbeanTripsOverline } from "./content";
import CaribbeanPage, { metadata } from "./page";

// next/image needs the Next runtime's loader config; a plain <img> is enough for a smoke test.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const TOPIC = "caribbean";
const PATH = "/caribbean";

describe("2.0.8 Caribbean page", () => {
  it("renders one h1 with the headline and its gold script tail", () => {
    render(<CaribbeanPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("A region built for rest.");
  });

  it("renders the three intro points once per layout", () => {
    render(<CaribbeanPage />);
    for (const point of CARIBBEAN_INTRO) {
      // Icon-square row (<md) and bare-icon stack (md+), toggled by breakpoint classes.
      expect(screen.getAllByRole("heading", { level: 3, name: point.title })).toHaveLength(2);
    }
  });

  it("links every island tile — grid and snap strip — to a destination search", () => {
    render(<CaribbeanPage />);
    for (const island of ISLANDS) {
      const links = screen.getAllByRole("link", { name: island.name });
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", resultsHref({ dest: island.name }));
      }
    }
  });

  it("renders every Caribbean trip (not five) with derived counts, in the designer's order", () => {
    render(<CaribbeanPage />);
    const trips = tripsForTopic(TRIPS, TOPIC);
    expect(trips.length).toBeGreaterThan(5);
    expect(screen.getByText(caribbeanTripsOverline(trips.length))).toBeInTheDocument();
    expect(screen.getByText(CARIBBEAN_TRIPS.sub)).toBeInTheDocument();

    const section = screen.getByRole("region", { name: CARIBBEAN_TRIPS.title });
    // TripTile renders a card (md+) and a row (<md) per trip; both title the trip in an h3.
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
      trips.flatMap((trip) => [trip.name, trip.name]),
    );
    for (const trip of trips) {
      for (const link of within(section).getAllByRole("link", { name: trip.name })) {
        expect(link).toHaveAttribute("href", `/explore/${trip.slug}`);
      }
      for (const link of within(section).getAllByRole("link", { name: `Save ${trip.name} for later` })) {
        expect(link).toHaveAttribute("href", joinHref({ intent: "save", trip: trip.slug, next: PATH }));
      }
    }
    const quoteHrefs = within(section)
      .getAllByRole("link", { name: "Request quote" })
      .map((link) => link.getAttribute("href"));
    expect(quoteHrefs).toHaveLength(trips.length * 2);
    expect(new Set(quoteHrefs)).toEqual(
      new Set(trips.map((trip) => joinHref({ intent: "quote", trip: trip.slug, next: PATH }))),
    );

    expect(
      screen.getByRole("link", { name: caribbeanSeeAllLabel(countByTopic(TRIPS, TOPIC)) }),
    ).toHaveAttribute("href", resultsHref({ topic: TOPIC }));
  });

  it("sends every quote CTA to the gate with this page as next, and message CTAs to the inquiry email", () => {
    render(<CaribbeanPage />);
    // Inquiry bar, closing band, sticky bar.
    const quoteLinks = screen.getAllByRole("link", { name: "Request a quote" });
    expect(quoteLinks).toHaveLength(3);
    for (const link of quoteLinks) {
      expect(link).toHaveAttribute("href", joinHref({ intent: "quote", next: PATH }));
    }
    expect(screen.getByRole("link", { name: "Message Gyasi first" }).getAttribute("href")).toMatch(/^mailto:/);
    expect(screen.getByRole("link", { name: "Browse all" })).toHaveAttribute("href", resultsHref({ topic: TOPIC }));
  });

  it("has canonical and Open Graph metadata with the hero image", () => {
    expect(metadata.title).toBe("Caribbean vacations");
    expect(metadata.alternates?.canonical).toBe(PATH);
    expect(metadata.openGraph?.url).toBe(PATH);
    const [image] = [metadata.openGraph?.images].flat();
    expect(image).toEqual({ url: staImg("turks", 1200, 630), width: 1200, height: 630 });
  });
});
