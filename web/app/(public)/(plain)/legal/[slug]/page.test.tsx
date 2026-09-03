import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import { formatLegalDate } from "./content";
import LegalPage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("2.0.7 legal pages", () => {
  it("prerenders exactly the four documents and nothing else", () => {
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual(LEGAL_SLUGS.map((slug) => ({ slug })));
  });

  it("renders one h1, a nav with aria-current, and a section per heading", async () => {
    const { container } = render(await LegalPage(params("privacy")));
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(LEGAL_DOCS.privacy.title);

    const nav = screen.getByRole("navigation", { name: "Legal pages" });
    const current = nav.querySelectorAll('a[aria-current="page"]');
    expect(current.length).toBeGreaterThan(0);
    for (const link of current) expect(link).toHaveAttribute("href", "/legal/privacy");
    for (const slug of LEGAL_SLUGS) {
      expect(nav.querySelectorAll(`a[href="/legal/${slug}"]`).length).toBeGreaterThan(0);
    }

    const sections = container.querySelectorAll("article section");
    expect(sections).toHaveLength(LEGAL_DOCS.privacy.sections.length);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      LEGAL_DOCS.privacy.sections.map((s) => s.heading),
    );
  });

  it("shows the last-updated date, a print button, and the draft notice while unreviewed", async () => {
    render(await LegalPage(params("terms")));
    const doc = LEGAL_DOCS.terms;
    expect(screen.getByText(/Last updated/)).toHaveTextContent(formatLegalDate(doc.lastUpdated));
    expect(document.querySelector("time")).toHaveAttribute("dateTime", doc.lastUpdated);
    expect(screen.getByRole("button", { name: "Print this page" })).toHaveClass("no-print");
    if (doc.status === "reviewed") {
      expect(screen.queryByRole("note")).toBeNull();
    } else {
      expect(screen.getByRole("note")).toHaveTextContent(/^Draft/);
    }
  });

  it("renders bullet sections as real lists", async () => {
    const { container } = render(await LegalPage(params("cookies")));
    const bullets = LEGAL_DOCS.cookies.sections.flatMap((s) => s.bullets ?? []);
    expect(bullets.length).toBeGreaterThan(0);
    expect(container.querySelectorAll("article ul li")).toHaveLength(bullets.length);
  });

  it("404s for a slug that is not a legal document", async () => {
    await expect(LegalPage(params("dpa"))).rejects.toThrow();
    expect(await generateMetadata(params("dpa"))).toEqual({});
  });

  it("has a title and canonical per document", async () => {
    const meta = await generateMetadata(params("accessibility"));
    expect(meta.title).toBe(LEGAL_DOCS.accessibility.title);
    expect(meta.description).toBe(LEGAL_DOCS.accessibility.description);
    expect(meta.alternates?.canonical).toBe("/legal/accessibility");
    expect(meta.openGraph?.url).toBe("/legal/accessibility");
  });
});
