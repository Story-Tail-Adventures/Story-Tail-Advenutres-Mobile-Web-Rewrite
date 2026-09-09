import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INSPIRATION_TILES } from "@/content/public/inspiration";
import { trustLine } from "@/content/public/proof";
import { TRIPS } from "@/content/public/trips";
import { filterTrips, resultsHref } from "@/lib/public/search";
import { tileSearchQuery, tripCountLabel } from "./content";
import { STACKED_SEARCH_FORM_ID } from "./SearchBar";
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
      // The dates cell carries the stay as `in` / `out`. Whether they are the native date
      // inputs or the picker's hidden ones, the form submits the same two params — which is
      // the point of the progressive-enhancement split.
      expect(form.querySelector('[name="in"]')).not.toBeNull();
      expect(form.querySelector('[name="out"]')).not.toBeNull();
      expect(form.querySelector('input[name="when"]')).toBeNull();
      const travelers = form.querySelector<HTMLInputElement>('input[name="travelers"]');
      expect(travelers?.type).toBe("number");
      expect(travelers?.min).toBe("1");
      expect(travelers?.max).toBe("20");
      expect(form.querySelector('button[type="submit"]')).toHaveTextContent("Search");
      // EXACTLY one submit per form. A bare <button> inside a <form> defaults to
      // type="submit", so a picker button missing type="button" would turn every day cell,
      // month arrow and Clear into a search submission.
      expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    }
    // Every cell has a visible, associated label. "Dates" names the picker's trigger on the
    // pill and the check-in input on the stacked card, so it resolves twice either way.
    for (const label of ["Destination", "Travelers"]) {
      expect(screen.getAllByLabelText(label)).toHaveLength(2);
    }
    expect(screen.getAllByText("Dates", { selector: "label" })).toHaveLength(2);
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
    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/login?next=%2Fexplore");
    }
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/join");
  });

  // M203's card carries no button of its own — the sticky bar IS the Search. It has to
  // submit the stacked form, or a visitor who types a destination and taps the big blue
  // button lands on unfiltered results with what they typed silently dropped.
  it("makes the sticky Search submit the stacked form rather than link away", () => {
    const { container } = render(<ExplorePage />);

    // Nothing labelled "Search" navigates any more — the bar submits.
    expect(screen.queryByRole("link", { name: "Search" })).toBeNull();

    const bar = container.querySelector(`.sticky-cta button[form="${STACKED_SEARCH_FORM_ID}"]`);
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute("type", "submit");
    expect(bar).toHaveTextContent("Search");

    const form = container.querySelector(`#${STACKED_SEARCH_FORM_ID}`);
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(form).toHaveAttribute("action", "/explore/results");
    // A hidden in-card submit stays the form's default button, so Enter still submits a
    // three-input form, with or without JavaScript.
    expect(form?.querySelector('button[type="submit"].hidden')).not.toBeNull();
  });

  it("keeps the banner link builders intact", () => {
    render(<ExplorePage />);
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
