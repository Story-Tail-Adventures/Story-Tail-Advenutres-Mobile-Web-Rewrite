import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { AUTH_FLAG_COOKIE } from "@/lib/auth/chrome-flag";
import { resetAuthChromeForTests } from "@/lib/auth/use-auth-chrome";
import { StickyCtaSecondary } from "./StickyCtaSecondary";

const SIGNED_OUT = { label: "Sign in", href: "/login?next=%2Fexplore" } as const;
const SIGNED_IN = { label: "Your trips", href: "/dashboard" } as const;

function subject() {
  return (
    <StickyCtaSecondary
      signedOut={SIGNED_OUT}
      signedIn={SIGNED_IN}
      className="btn btn-text min-h-11 shrink-0"
    />
  );
}

function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
}

beforeEach(() => {
  clearCookies();
  resetAuthChromeForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCookies();
});

describe("StickyCtaSecondary", () => {
  it("offers sign-in to a visitor", async () => {
    render(subject());

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Your trips" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", SIGNED_OUT.href);
  });

  it("offers their trips to somebody signed in", async () => {
    document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ signedIn: true, initials: "JH" }) })),
    );

    render(subject());

    const trips = await screen.findByRole("link", { name: "Your trips" });
    expect(trips).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });
});

/**
 * The bar is the mobile stand-in for the /explore sign-in banner, so it carries the same
 * pre-paint gate as the top bar: both controls in the prerendered HTML, each tagged so CSS
 * can hide the wrong one on the first frame. Without this, a signed-in visitor would watch
 * "Sign in" become "Your trips" — the flash AuthChromeScript exists to prevent.
 */
describe("StickyCtaSecondary — the prerendered snapshot", () => {
  const html = renderToStaticMarkup(subject());

  it("carries both controls", () => {
    expect(html).toContain("Sign in");
    expect(html).toContain("Your trips");
  });

  it("tags each one for the gate, marked unknown", () => {
    expect(html).toMatch(/class="[^"]*pub-cta-out[^"]*"[^>]*data-auth="unknown"/);
    expect(html).toMatch(/class="[^"]*pub-cta-in[^"]*"[^>]*data-auth="unknown"/);
  });

  // The gate outranks .btn only because nothing in the passed class string sets display.
  it("keeps the caller's classes, none of which set display", () => {
    expect(html).toContain("btn btn-text min-h-11 shrink-0");
    expect(html).not.toMatch(/class="[^"]*\b(hidden|block|flex|inline-flex)\b[^"]*"/);
  });
});
