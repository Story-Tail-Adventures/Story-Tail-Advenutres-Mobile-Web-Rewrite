import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { TESTIMONIALS } from "@/content/public/proof";
import AboutGyasiPage, { metadata } from "./page";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe("2.0.11 about Gyasi page", () => {
  it("renders one h1 with the script name, and no photograph of Gyasi", () => {
    render(<AboutGyasiPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Hi, I'm Gyasi.");
    expect(screen.getByRole("img", { name: "Gyasi Story" })).toHaveTextContent("GS");
  });

  it("renders stats, credentials, six testimonials and the full FAQ", () => {
    const { container } = render(<AboutGyasiPage />);
    expect(container.querySelectorAll("dl dd")).toHaveLength(4);
    expect(screen.getByText("Hosted by Inteletravel")).toBeInTheDocument();
    expect(container.querySelectorAll("figure")).toHaveLength(TESTIMONIALS.length);
    expect(container.querySelectorAll("details")).toHaveLength(GYASI_FAQ.length);
    expect(screen.getByText("— Gyasi")).toBeInTheDocument();
  });

  it("sends every quote CTA to the gate and every message CTA to the inquiry link", () => {
    render(<AboutGyasiPage />);
    for (const link of screen.getAllByRole("link", { name: /Request a quote/ })) {
      expect(link).toHaveAttribute("href", "/join?intent=quote&next=%2Fabout");
    }
    for (const name of ["Message me first", "Message Gyasi", "Message me"]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toMatch(/^mailto:/);
    }
  });

  it("has canonical and Open Graph metadata", () => {
    expect(metadata.title).toBe("About Gyasi");
    expect(metadata.alternates?.canonical).toBe("/about");
  });
});
