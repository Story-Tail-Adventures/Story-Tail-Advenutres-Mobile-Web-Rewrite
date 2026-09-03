import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TRIP_REVIEWS } from "@/content/public/proof";
import { findTrip, TRIP_SLUGS } from "@/content/public/trips";
import { joinHref, tripHref } from "@/lib/public/links";
import { formatMoney } from "@/lib/public/money";
import { advisorTitle } from "./content";
import TripDetailPage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const SLUG = "sandals-royal-bahamian";
const trip = findTrip(SLUG);
if (!trip) throw new Error(`fixture trip ${SLUG} missing from the catalog`);
const PATH = tripHref(SLUG);

async function renderDetail(slug: string) {
  return render(await TripDetailPage({ params: Promise.resolve({ slug }) }));
}

describe("2.0.5 public trip detail", () => {
  it("renders one h1, the badge and meta, the amenities and the ordered itinerary", async () => {
    const { container } = await renderDetail(SLUG);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(trip.name);

    expect(screen.getByText("All-inclusive · 7 nights")).toBeInTheDocument();
    expect(screen.getByText(trip.destination.place)).toBeInTheDocument();
    expect(screen.getByText(TRIP_REVIEWS[SLUG].display)).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "What it is" })).toBeInTheDocument();
    expect(screen.getByText(trip.description)).toBeInTheDocument();
    const amenities = container.querySelector("ul");
    expect(amenities?.querySelectorAll("li")).toHaveLength(trip.highlights.length);
    for (const highlight of trip.highlights) expect(screen.getByText(highlight.text)).toBeInTheDocument();

    const itinerary = container.querySelector("ol");
    expect(itinerary?.querySelectorAll("li")).toHaveLength(trip.sampleItinerary.length);
  });

  it("shows the price from the catalog and routes quote, save and message correctly", async () => {
    await renderDetail(SLUG);
    const quote = joinHref({ intent: "quote", trip: SLUG, next: PATH });
    const save = joinHref({ intent: "save", trip: SLUG, next: PATH });

    // Price card (md+) and the mobile sticky bar both quote the same figure.
    expect(screen.getAllByText(formatMoney(trip.from, { whole: true })).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("STARTING AT")).toBeInTheDocument();
    expect(screen.getByText(trip.priceNote)).toBeInTheDocument();

    const quotes = screen.getAllByRole("link", { name: "Request a quote" });
    expect(quotes).toHaveLength(2); // PriceCard + StickyCta
    for (const link of quotes) expect(link).toHaveAttribute("href", quote);

    expect(screen.getByRole("link", { name: "Favorite" })).toHaveAttribute("href", save);
    expect(screen.getByRole("link", { name: `Save ${trip.name} for later` })).toHaveAttribute("href", save);
    expect(screen.getByRole("link", { name: "Save this trip" })).toHaveAttribute("href", save);

    expect(screen.getByRole("link", { name: "Message Gyasi without an account →" }).getAttribute("href")).toMatch(
      /^mailto:/,
    );
    expect(screen.getByRole("link", { name: "Message →" }).getAttribute("href")).toMatch(/^mailto:/);
    // The advisor line comes from the claims registry (rail + mobile card).
    expect(screen.getAllByText(advisorTitle(SLUG))).toHaveLength(2);
  });

  it("embeds a BreadcrumbList and exposes per-trip metadata", async () => {
    const { container } = await renderDetail(SLUG);
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? "{}") as {
      "@type": string;
      itemListElement: Array<{ name: string; item: string }>;
    };
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement.map((i) => i.name)).toEqual(["Explore", trip.name]);
    expect(data.itemListElement[1].item.endsWith(PATH)).toBe(true);

    const meta = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) });
    expect(meta.title).toBe(trip.name);
    expect(meta.description).toBe(trip.description);
    expect(meta.alternates?.canonical).toBe(PATH);
    expect(meta.openGraph?.url).toBe(PATH);
  });

  it("statically generates exactly the catalog slugs", () => {
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams().map((p) => p.slug)).toEqual([...TRIP_SLUGS]);
  });
});
