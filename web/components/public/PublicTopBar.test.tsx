import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/explore" }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { PublicTopBar } from "./PublicTopBar";

/**
 * The static-HTML contract the whole signed-in-chrome design rests on: the top bar's
 * PRERENDERED markup still carries the signed-out pair, so the marketing pages stay
 * crawlable and work with JavaScript off. PublicAuthCluster swaps them out in the browser;
 * it must never be the thing that puts them there.
 */
describe("PublicTopBar", () => {
  it("ships the sign-in and sign-up links in its first render", () => {
    render(<PublicTopBar />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/join");
  });

  it("links the brand mark home", () => {
    render(<PublicTopBar />);
    expect(screen.getByRole("link", { name: "Story-Tail Adventures home" })).toHaveAttribute("href", "/");
  });

  it("renders the primary nav", () => {
    render(<PublicTopBar />);
    for (const label of ["Explore", "Caribbean", "Cruises", "Honeymoons", "About Gyasi"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
  });
});
