import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CRUISE_LINES } from "@/content/public/cruise-lines";
import { TRIPS } from "@/content/public/trips";
import { staImg } from "@/lib/images";
import { joinHref } from "@/lib/public/links";
import { countByTopic, resultsHref, tripsForTopic } from "@/lib/public/search";
import {
  CRUISES_LINES_SECTION,
  CRUISES_TRIPS,
  CRUISES_TYPES,
  cruisesSeeAllLabel,
  cruisesTripsOverline,
} from "./content";
import CruisesPage, { metadata } from "./page";

// next/image needs the Next runtime's loader config; a plain <img> is enough for a smoke test.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const TOPIC = "cruises";
const PATH = "/cruises";

describe("2.0.9 Cruises page", () => {
  it("renders one h1 with the headline and its gold script tail", () => {
    render(<CruisesPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("A floating Sabbath, every morning new.");
  });

  it("renders the three audience cards and every cruise line as a chip", () => {
    render(<CruisesPage />);
    for (const type of CRUISES_TYPES) {
      // MediaCard renders a stacked card (md+) and a row (<md); both carry the h3.
      expect(screen.getAllByRole("heading", { level: 3, name: type.title })).toHaveLength(2);
    }
    const lines = screen.getByRole("list", { name: CRUISES_LINES_SECTION.title });
    expect(within(lines).getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      CRUISE_LINES.map((line) => line.name),
    );
  });

  it("renders every sailing on this topic (not five) with derived counts, in the designer's order", () => {
    render(<CruisesPage />);
    const trips = tripsForTopic(TRIPS, TOPIC);
    expect(trips.length).toBeGreaterThan(5);
    expect(screen.getByText(cruisesTripsOverline(trips.length))).toBeInTheDocument();

    const section = screen.getByRole("region", { name: CRUISES_TRIPS.title });
    // TripTile renders a card (md+) and a row (<md) per trip; both title the trip in an h3.
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
      trips.flatMap((trip) => [trip.name, trip.name]),
    );
    for (const trip of trips) {
      for (const link of within(section).getAllByRole("link", { name: trip.name })) {
        expect(link).toHaveAttribute("href", `/explore/${trip.slug}`);
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
      screen.getByRole("link", { name: cruisesSeeAllLabel(countByTopic(TRIPS, TOPIC)) }),
    ).toHaveAttribute("href", resultsHref({ topic: TOPIC }));
  });

  it("sends every quote CTA to the gate with this page as next, and message CTAs to the inquiry email", () => {
    render(<CruisesPage />);
    // Closing band and sticky bar. The inquiry bar used to be a third and is not any more —
    // see below.
    const quoteLinks = screen.getAllByRole("link", { name: "Request a quote" });
    expect(quoteLinks).toHaveLength(2);
    for (const link of quoteLinks) {
      expect(link).toHaveAttribute("href", joinHref({ intent: "quote", next: PATH }));
    }
    expect(screen.getByRole("link", { name: "Message Gyasi first" }).getAttribute("href")).toMatch(/^mailto:/);

    // The page now offers TWO different lists and the labels have to keep them apart:
    // "All sailings" is Gyasi's curated nine, and the inquiry bar opens the live synced
    // catalog. The bar previously sent people to the sign-up gate and back here, which meant
    // a bar summarising a search led nowhere near a result.
    expect(screen.getByRole("link", { name: "All sailings" })).toHaveAttribute("href", resultsHref({ topic: TOPIC }));
    expect(screen.getByRole("link", { name: "See what's sailing" })).toHaveAttribute(
      "href",
      resultsHref({ mode: "cruises", dest: "Caribbean" }),
    );
  });

  it("has canonical and Open Graph metadata with the hero image", () => {
    expect(metadata.title).toBe("Cruises");
    expect(metadata.alternates?.canonical).toBe(PATH);
    expect(metadata.openGraph?.url).toBe(PATH);
    const [image] = [metadata.openGraph?.images].flat();
    expect(image).toEqual({ url: staImg("cruiseAerial", 1200, 630), width: 1200, height: 630 });
  });
});
