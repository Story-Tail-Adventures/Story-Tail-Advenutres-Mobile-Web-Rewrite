import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INSPIRATION_TILES } from "@/content/public/inspiration";
import { trustLine } from "@/content/public/proof";
import { TRIPS } from "@/content/public/trips";
import { filterTrips, resultsHref } from "@/lib/public/search";
import { tileSearchQuery, tripCountLabel } from "./content";
import ExplorePage, { metadata } from "./page";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe("2.0.3 public search landing", () => {
  it("renders one h1 and a real GET search form for each layout", () => {
    render(<ExplorePage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Find your next chapter.");

    // The pill (md+) and the stacked card (below md) are the same form twice.
    const forms = screen.getAllByRole("search");
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(form.tagName).toBe("FORM");
      expect(form).toHaveAttribute("action", "/explore/results");
      expect(form.querySelector('input[name="dest"]')).not.toBeNull();
      expect(form.querySelector('input[name="when"]')).not.toBeNull();
      const travelers = form.querySelector<HTMLInputElement>('input[name="travelers"]');
      expect(travelers?.type).toBe("number");
      expect(travelers?.min).toBe("1");
      expect(travelers?.max).toBe("20");
      expect(form.querySelector('button[type="submit"]')).toHaveTextContent("Search");
    }
    // Every cell has a visible, associated label.
    for (const label of ["Destination", "Dates", "Travelers"]) {
      expect(screen.getAllByLabelText(label)).toHaveLength(2);
    }
  });

  it("links every inspiration tile to a results search with a derived trip count", () => {
    render(<ExplorePage />);
    for (const tile of INSPIRATION_TILES) {
      const link = screen.getByRole("link", { name: (name) => name.startsWith(tile.title) });
      const query = tileSearchQuery(tile);
      expect(link).toHaveAttribute("href", resultsHref(query));
      expect(link).toHaveTextContent(tripCountLabel(filterTrips(TRIPS, query).length));
    }
    expect(screen.getByText(trustLine())).toBeInTheDocument();
  });

  it("routes the sticky bar and the banner through the link builders", () => {
    render(<ExplorePage />);
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/explore/results");
    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/login?next=%2Fexplore");
    }
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/join");
  });

  it("has canonical and Open Graph metadata and is indexable", () => {
    expect(metadata.alternates?.canonical).toBe("/explore");
    expect(metadata.openGraph?.url).toBe("/explore");
    expect(metadata.robots).toBeUndefined();
  });
});
