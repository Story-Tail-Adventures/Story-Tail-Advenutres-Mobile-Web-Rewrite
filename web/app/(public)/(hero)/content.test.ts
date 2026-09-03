import { describe, expect, it } from "vitest";
import { claim } from "@/content/public/proof";
import { MARKETING_SITE_URL } from "@/content/public/contact";
import { LANDING, landingJsonLd, serializeJsonLd } from "./content";

describe("landing JSON-LD", () => {
  it("describes the agency with the site url and the marketing site, and nothing unverified", () => {
    const data = landingJsonLd("https://app.example.com");
    expect(data["@type"]).toBe("TravelAgency");
    expect(data.url).toBe("https://app.example.com");
    expect(data.sameAs).toEqual([MARKETING_SITE_URL]);
    expect(data).not.toHaveProperty("address");
    expect(data).not.toHaveProperty("aggregateRating");
  });

  it("escapes < so a value can never close the script element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("landing copy", () => {
  it("carries the brief's corrections to the mobile feature cards", () => {
    const bodies = LANDING.features.items.map((f) => f.body).join(" ");
    expect(bodies).toContain("always in your pocket");
    expect(bodies).not.toMatch(/offline/i);
    expect(bodies).toContain(claim("avgReplyTime"));
    expect(bodies).not.toMatch(/invoice/i);
  });

  it("keeps the hero copy from the desktop artboard", () => {
    expect(LANDING.title).toBe("Plan a rest worthy of the");
    expect(LANDING.script).toBe("world He made.");
    expect(LANDING.scripture).toHaveLength(2);
    expect(LANDING.scripture[0].reference).toBe("GEN 2 : 2");
  });
});
