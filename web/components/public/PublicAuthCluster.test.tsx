import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { AUTH_FLAG_COOKIE } from "@/lib/auth/chrome-flag";
import { resetAuthChromeForTests } from "@/lib/auth/use-auth-chrome";
import { PublicAuthCluster } from "./PublicAuthCluster";

function setFlag() {
  document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
}

function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
}

function respondWith(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
}

beforeEach(() => {
  clearCookies();
  resetAuthChromeForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCookies();
});

describe("PublicAuthCluster — signed out", () => {
  it("shows both auth links and no avatar", async () => {
    respondWith({ signedIn: false });
    render(<PublicAuthCluster />);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Your account" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/join");
  });

  it("does not ask the server who it is when there is no flag", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicAuthCluster />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PublicAuthCluster — signed in", () => {
  it("replaces the auth links with a linked initials avatar", async () => {
    setFlag();
    respondWith({ signedIn: true, initials: "JH" });

    render(<PublicAuthCluster />);

    const account = await screen.findByRole("link", { name: "Your account" });
    expect(account).toHaveAttribute("href", "/dashboard");
    expect(account).toHaveTextContent("JH");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  });

  // A stale flag cookie outlives its token by design, so the endpoint is the authority.
  it("goes back to the auth links when the server says the flag is stale", async () => {
    setFlag();
    respondWith({ signedIn: false });

    render(<PublicAuthCluster />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Your account" })).not.toBeInTheDocument();
  });

  it("keeps the avatar and falls back to the monogram when the request fails", async () => {
    setFlag();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    render(<PublicAuthCluster />);

    const account = await screen.findByRole("link", { name: "Your account" });
    expect(account).toHaveTextContent("ST");
  });

  it("falls back to the monogram when the account has no usable name", async () => {
    setFlag();
    respondWith({ signedIn: true, initials: "" });

    render(<PublicAuthCluster />);

    expect(await screen.findByRole("link", { name: "Your account" })).toHaveTextContent("ST");
  });
});

/**
 * Coming back to a tab that was left open while another one changed who is signed in.
 *
 * The flag is a boolean, so it cannot tell "still signed in" from "signed in as somebody
 * else now" — the wake-up path therefore re-verifies rather than trusting an unchanged flag.
 */
describe("PublicAuthCluster — returning to the tab", () => {
  it("picks up new initials when the flag has not changed", async () => {
    document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
    let initials = "JH";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ signedIn: true, initials }) })),
    );

    render(<PublicAuthCluster />);
    expect(await screen.findByRole("link", { name: "Your account" })).toHaveTextContent("JH");

    // Another tab switched accounts. This tab never navigated, so its flag is still "1".
    initials = "PS";
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Your account" })).toHaveTextContent("PS");
    });
  });

  it("reverts when the flag has gone", async () => {
    document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ signedIn: true, initials: "JH" }) })),
    );

    render(<PublicAuthCluster />);
    await screen.findByRole("link", { name: "Your account" });

    document.cookie = `${AUTH_FLAG_COOKIE}=; max-age=0; path=/`;
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Your account" })).not.toBeInTheDocument();
  });

  it("makes one request per page, not one per island", async () => {
    document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ signedIn: true, initials: "JH" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    // Three islands share the store on a real page: the cluster, the drawer and the banner.
    render(
      <>
        <PublicAuthCluster />
        <PublicAuthCluster />
        <PublicAuthCluster />
      </>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * The contract the pre-paint CSS gate in styles/public.css depends on.
 *
 * Rendered on the server — which is where "unknown" actually lives, since React reads
 * getServerSnapshot for SSR and for the hydration render. This IS the prerendered HTML: both
 * states present and the container marked unknown, so the gate can hide the wrong one on the
 * first frame. Asserting it through the browser renderer would be impossible, because
 * mounting resolves the store before anything can be read.
 */
describe("PublicAuthCluster — the prerendered snapshot", () => {
  const html = renderToStaticMarkup(<PublicAuthCluster />);

  it("marks itself unknown, so the gate rules apply", () => {
    expect(html).toContain('data-auth="unknown"');
  });

  it("carries both states for CSS to choose between", () => {
    expect(html).toContain("pub-auth-out");
    expect(html).toContain("pub-auth-in");
  });

  // The SEO and no-JS contract: these are in the static HTML, not added by the island.
  it("carries the signed-out links", () => {
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/join"');
    expect(html).toContain("Sign in");
    expect(html).toContain("Create account");
  });

  it("draws no monogram before the letters are known", () => {
    expect(html).not.toContain("ST");
  });
});
