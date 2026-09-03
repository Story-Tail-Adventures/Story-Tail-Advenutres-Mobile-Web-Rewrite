import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { breadcrumbList, serializeJsonLd } from "./seo";

describe("breadcrumbList", () => {
  it("lists Explore then the trip, with absolute URLs", () => {
    const data = breadcrumbList({ slug: "couples-negril", name: "Couples Negril" });
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(data.itemListElement[0].name).toBe("Explore");
    expect(data.itemListElement[0].item).toBe(`${env.siteUrl}/explore`);
    expect(data.itemListElement[1].name).toBe("Couples Negril");
    expect(data.itemListElement[1].item).toBe(`${env.siteUrl}/explore/couples-negril`);
    expect(data.itemListElement[1].item.startsWith("http")).toBe(true);
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so text cannot close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><img src=x>" });
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><img src=x>" });
  });
});
