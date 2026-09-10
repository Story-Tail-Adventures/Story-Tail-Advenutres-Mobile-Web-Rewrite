import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CLIENT_DESTINATIONS,
  activeDestinationId,
  destinationsFor,
} from "./nav";

describe("the client destination registry", () => {
  it("puts six items on the web rail and four on the mobile bar", () => {
    // Gyasi's 2026-09-06 decision: the prototype's ScreenNavRail (6) and StaMobileTabs (4)
    // win over Screen-Inventory §6.1/§6.3. If either count changes, the docs change too.
    expect(destinationsFor("rail").map((d) => d.id)).toEqual([
      "trips",
      "discover",
      "messages",
      "wallet",
      "documents",
      "account",
    ]);
    expect(destinationsFor("bar").map((d) => d.id)).toEqual([
      "trips",
      "discover",
      "messages",
      "account",
    ]);
  });

  it("has three built destinations after §2.5, and Wallet is the last unbuilt P1", () => {
    // The point of `built` being separate from `phase`: after §2.5 the only unbuilt P1
    // destinations are Messages (§2.6) and Wallet (§2.4), while Discover stays P2 — so a
    // phase filter would still leave dead links, and `built` is what the rail renders on.
    const built = CLIENT_DESTINATIONS.filter((d) => d.built);
    expect(built.map((d) => d.id)).toEqual(["trips", "documents", "account"]);

    const unbuiltP1 = CLIENT_DESTINATIONS.filter((d) => !d.built && d.phase === "P1");
    expect(unbuiltP1.map((d) => d.id)).toEqual(["messages", "wallet"]);
  });

  it("names a section for every unbuilt destination, so the reason is greppable", () => {
    for (const d of CLIENT_DESTINATIONS) {
      if (!d.built) {
        expect(d.phase).toBeTruthy();
        expect(d.section).toMatch(/^§/);
      } else {
        expect(d.phase).toBeNull();
      }
    }
  });

  it("gives every destination a unique id and href", () => {
    const ids = CLIENT_DESTINATIONS.map((d) => d.id);
    const hrefs = CLIENT_DESTINATIONS.map((d) => d.href);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("activeDestinationId", () => {
  it("matches a destination and its sub-routes", () => {
    expect(activeDestinationId("/dashboard")).toBe("trips");
    expect(activeDestinationId("/messages")).toBe("messages");
    expect(activeDestinationId("/messages/abc")).toBe("messages");
  });

  it("keeps the rail on Trips for a per-trip sub-route", () => {
    // /trips/x/documents is somewhere you got to THROUGH a trip. The rail should keep
    // saying Trips rather than jumping to the account-wide Documents library.
    expect(activeDestinationId("/trips")).toBe("trips");
    expect(activeDestinationId("/trips/0195a2c0/itinerary")).toBe("trips");
    expect(activeDestinationId("/trips/0195a2c0/documents")).toBe("trips");
    expect(activeDestinationId("/trips/0195a2c0/messages")).toBe("trips");
  });

  it("respects `/` boundaries, so a longer path does not match a shorter destination", () => {
    expect(activeDestinationId("/documents-archive")).toBeNull();
    expect(activeDestinationId("/walletx")).toBeNull();
  });

  it("is null off the client surface", () => {
    expect(activeDestinationId("/")).toBeNull();
    expect(activeDestinationId("/login")).toBeNull();
  });
});

describe("the tablet strip breakpoint", () => {
  it("never pairs an unqualified max-web: with md:", () => {
    // `web:` is px-based and `md:` is rem-based, so Tailwind emits `web:` FIRST. An
    // unqualified `max-web:flex` therefore also applies at 375px, which would render the
    // tablet chrome on a phone alongside the bottom bar. The correct form is `md:max-web:`.
    // This is asserted against the source because it is a class-string mistake that no
    // amount of rendering in jsdom would catch.
    const nav = readFileSync(join(__dirname, "../../components/client/ClientNav.tsx"), "utf8");
    const code = nav
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    const bad = code.match(/(?<!md:)max-web:/g);
    expect(bad).toBeNull();
  });
});
