import { describe, expect, it } from "vitest";
import { parseCruiseResponse } from "./cruises";

/**
 * The boundary where a synced sailing becomes something a page may render.
 *
 * Two things are being defended, and neither is happy-path shape.
 *
 * A HOST WE DID NOT NAME. `web/next.config.ts` registers a custom next/image loader, so
 * `remotePatterns` never runs and any URL reaching `<Image src>` is fetched by the visitor's
 * browser from whatever origin it names. The hotel equivalent of this file makes the same
 * argument; the cruise side has a CHECK constraint in front of it as well, and this is what
 * still holds if that constraint is relaxed or a dump is restored around it.
 *
 * AN UNCREDITED PHOTO. The ship photography is CC BY / CC BY-SA. Credit is a licence
 * condition, so a photo that arrives without one must not render — and must not take the
 * page down either, which is the third thing asserted here.
 */

/** A response as the Edge Function sends it. */
function sailing(overrides: Record<string, unknown> = {}) {
  return {
    id: "0199e27d-5f9f-7c8d-b082-db804374dab3",
    title: "7 Night Eastern Caribbean",
    line: "Royal Caribbean",
    ship: "Symphony of the Seas",
    departureDate: "2026-11-14",
    nights: 7,
    destinations: ["Caribbean"],
    ports: ["Miami", "Nassau"],
    shipImage: {
      url: "https://upload.wikimedia.org/wikipedia/commons/1/1d/Ship.jpg",
      credit: "Kiran891 / Wikimedia Commons, CC BY-SA 4.0",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ship.jpg",
    },
    ...overrides,
  };
}

function parseOne(overrides: Record<string, unknown> = {}) {
  const result = parseCruiseResponse({ results: [sailing(overrides)] });
  expect(result.status, "the sailing itself should always survive").toEqual("ok");
  if (result.status !== "ok") throw new Error("unreachable");
  return result.sailings[0];
}

describe("the ship photo", () => {
  it("survives when it is on the allow-listed host and credited", () => {
    const image = parseOne().shipImage;
    expect(image?.url).toContain("upload.wikimedia.org");
    expect(image?.credit).toEqual("Kiran891 / Wikimedia Commons, CC BY-SA 4.0");
  });

  it("is dropped when the host is not allow-listed — and the sailing is not", () => {
    // Every one of these is a URL a visitor's browser would fetch on our say-so. The
    // look-alike hosts are the point: a `.includes("wikimedia.org")` check passes all four.
    for (
      const url of [
        "https://evil.example/ship.jpg",
        "https://upload.wikimedia.org.evil.example/ship.jpg",
        "https://commons.wikimedia.org/wiki/File:Ship.jpg",
        "http://upload.wikimedia.org/ship.jpg",
      ]
    ) {
      const parsed = parseOne({ shipImage: { ...sailing().shipImage, url } });
      expect(parsed.shipImage, `"${url}" reached an <Image src>`).toBeNull();
      expect(parsed.title, "the card should still render without its photo")
        .toEqual("7 Night Eastern Caribbean");
    }
  });

  it("is dropped when the credit is missing, empty, or not a string", () => {
    // Postgres will not store this pair half-set, so each of these means something upstream
    // changed. Rendering the photo anyway is a licence breach; dropping it is a missing
    // picture. The second is the right failure.
    for (const credit of [null, undefined, "", 42]) {
      const parsed = parseOne({ shipImage: { ...sailing().shipImage, credit } });
      expect(parsed.shipImage, `credit ${JSON.stringify(credit)} rendered uncredited`)
        .toBeNull();
    }
  });

  it("keeps a credit far longer than any in the catalog", () => {
    // Commons attribution runs to whole sentences — the longest of the 151 photographs is
    // 214 characters. A bound tight enough to clip one would not drop that photo, it would
    // fail the array and send the WHOLE page to "unavailable".
    const credit = "No machine-readable author provided. ".repeat(6).trim();
    expect(credit.length).toBeGreaterThan(214);
    expect(parseOne({ shipImage: { ...sailing().shipImage, credit } }).shipImage?.credit)
      .toEqual(credit);
  });

  it("accepts a photo with no licence or source recorded", () => {
    const parsed = parseOne({
      shipImage: { ...sailing().shipImage, license: null, sourceUrl: null },
    });
    // Still renders — `credit` alone already carries the licence name, and the card falls
    // back to plain text when there is no Commons page to link to.
    expect(parsed.shipImage?.credit).toBeTruthy();
    expect(parsed.shipImage?.sourceUrl).toBeNull();
  });

  it("null is an ordinary answer — most ships have no photo", () => {
    expect(parseOne({ shipImage: null }).shipImage).toBeNull();
  });
});

describe("one bad photo does not cost the page", () => {
  it("leaves the other sailings intact", () => {
    const result = parseCruiseResponse({
      results: [
        sailing({ id: "a", shipImage: { url: "https://evil.example/x.jpg", credit: "x" } }),
        sailing({ id: "b" }),
      ],
    });
    expect(result.status).toEqual("ok");
    if (result.status !== "ok") return;
    expect(result.sailings).toHaveLength(2);
    expect(result.sailings[0].shipImage).toBeNull();
    expect(result.sailings[1].shipImage).not.toBeNull();
  });

  it("but a broken sailing still is — the photo is the only field that degrades", () => {
    // `.catch(null)` is scoped to shipImage on purpose. A missing departureDate is a bug we
    // want to see as "unavailable", not a card with a blank date.
    const result = parseCruiseResponse({ results: [sailing({ departureDate: "soon" })] });
    expect(result.status).toEqual("unavailable");
  });
});
