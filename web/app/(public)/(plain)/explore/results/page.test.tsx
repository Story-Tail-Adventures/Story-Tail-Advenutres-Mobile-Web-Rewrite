import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { tripRating } from "@/content/public/proof";
import { TRIP_SLUGS, TRIPS } from "@/content/public/trips";
import { joinHref } from "@/lib/public/links";
import { parseSearchParams, resultsHref, searchTrips, type RawSearchParams } from "@/lib/public/search";
import ResultsPage, { metadata } from "./page";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

async function renderResults(sp: RawSearchParams) {
  return render(await ResultsPage({ searchParams: Promise.resolve(sp) }));
}

/** Parse a same-origin href into its path and query. */
function parts(href: string) {
  const url = new URL(href, "http://localhost");
  return { path: url.pathname, params: url.searchParams };
}

const SEARCH: RawSearchParams = { dest: "Caribbean", when: "Aug 12 – 19", travelers: "2" };

describe("2.0.4 public search results", () => {
  it("renders one h1 with the derived count and every result in both layouts", async () => {
    await renderResults(SEARCH);
    const expected = searchTrips(TRIPS, parseSearchParams(SEARCH), tripRating);
    expect(expected.length).toBeGreaterThan(0);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(`${expected.length} trips · Caribbean`);

    // Row (web) and stacked (mobile/tablet) cards are both in the DOM; each names the trip
    // once and links it to the detail page.
    for (const trip of expected) {
      const links = screen.getAllByRole("link", { name: trip.name });
      expect(links).toHaveLength(2);
      for (const link of links) expect(link).toHaveAttribute("href", `/explore/${trip.slug}`);
    }
    expect(screen.getByText("* Requires creating an account — takes 60 seconds.")).toBeInTheDocument();
  });

  it("gates quote and save on the sign-up gate with the trip and the return path", async () => {
    await renderResults(SEARCH);
    const current = resultsHref(parseSearchParams(SEARCH));

    const quotes = screen.getAllByRole("link", { name: "Request quote*" });
    expect(quotes.length).toBeGreaterThan(0);
    for (const link of quotes) {
      const { path, params } = parts(link.getAttribute("href") ?? "");
      expect(path).toBe("/join");
      expect(params.get("intent")).toBe("quote");
      expect(TRIP_SLUGS).toContain(params.get("trip"));

      // `next` is the QUOTE FORM, not the page they were on. That is what lets one CTA serve
      // both visitors: the proxy forwards a signed-in client straight to it, and an
      // anonymous one arrives there after registering. Pointing `next` back at the results
      // page would land a new account back where it started, with the request unsent.
      const next = parts(params.get("next") ?? "");
      expect(next.path).toBe("/trips/new");
      expect(TRIP_SLUGS).toContain(next.params.get("trip"));
      // `kind` is a component_kind, not a UI category — the catalog's four types map onto
      // three of them. Sending the literal "trip" is what the function rejected.
      expect(["hotel", "cruise", "excursion", "custom"]).toContain(next.params.get("kind"));
      expect(next.params.get("source")).toBe("curated");
    }
    for (const link of screen.getAllByRole("link", { name: /^Save/ })) {
      const { path, params } = parts(link.getAttribute("href") ?? "");
      expect(path).toBe("/join");
      expect(params.get("intent")).toBe("save");
      expect(params.get("next")).toBe(current);
    }

    // Mobile sticky bar: the corrected label, and "Filter" is the no-JS anchor to the sheet.
    expect(screen.getByRole("link", { name: "Create account to save" })).toHaveAttribute(
      "href",
      joinHref({ intent: "save", next: current }),
    );
    expect(screen.getByRole("link", { name: "Filter" })).toHaveAttribute("href", "#filters");
  });

  it("keeps the search in the filter forms and reflects the URL in checkboxes and chips", async () => {
    const { container } = await renderResults({ ...SEARCH, type: "cruise" });

    // The rail and the sheet each carry the same GET form.
    const forms = container.querySelectorAll('aside[aria-label="Filters"] form');
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(form).toHaveAttribute("action", "/explore/results");
      expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="dest"]')?.value).toBe("Caribbean");
      expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="when"]')?.value).toBe("Aug 12 – 19");
      expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="travelers"]')?.value).toBe("2");
      expect(Array.from(form.querySelectorAll("fieldset legend")).map((l) => l.textContent)).toEqual([
        "Trip type",
        "Vibe",
        "Budget",
      ]);
      expect(form.querySelector<HTMLInputElement>('input[name="type"][value="cruise"]')?.defaultChecked).toBe(true);
      expect(form.querySelector<HTMLInputElement>('input[name="type"][value="hotel"]')?.defaultChecked).toBe(false);
      expect(form.querySelector('select[name="sort"]')).not.toBeNull();
      expect(form.querySelector('button[type="submit"]')).toHaveTextContent("Apply filters");
    }
    expect(screen.getAllByRole("link", { name: "Clear all" })[0]).toHaveAttribute("href", "/explore/results");

    // Quick-filter chips: the active one toggles itself off, an inactive one toggles on.
    const cruise = screen.getByRole("link", { name: "Cruise" });
    expect(cruise).toHaveClass("is-on");
    expect(cruise).toHaveAttribute("aria-current", "true");
    expect(parts(cruise.getAttribute("href") ?? "").params.getAll("type")).toEqual([]);
    const hotel = screen.getByRole("link", { name: "Hotel" });
    expect(hotel).not.toHaveClass("is-on");
    expect(parts(hotel.getAttribute("href") ?? "").params.getAll("type")).toEqual(["cruise", "hotel"]);
    expect(screen.getByRole("button", { name: /Filters · 1/ })).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("shows the empty state, never a dead end", async () => {
    await renderResults({ dest: "Antarctica" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("0 trips · Antarctica");
    expect(screen.getByText("No trips match that week yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/explore/results");
    expect(screen.getByRole("link", { name: "Message Gyasi" }).getAttribute("href")).toMatch(/^mailto:/);
  });

  it("is not indexed and points canonical at /explore", () => {
    expect(metadata.title).toBe("Trip ideas");
    // `follow` is false because Hotels mode spends a metered provider request per distinct
    // URL, and every chip, sort and mode link on this page is a plain anchor. Flipping this
    // back to true lets a crawler walk that space at 250 searches a month.
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe("/explore");
  });
});
