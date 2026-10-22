import { describe, expect, it } from "vitest";
import { inquiryHref, isInquirySource } from "./inquiry";

describe("inquiryHref", () => {
  it("opens the Message Gyasi form with where the visitor came from", () => {
    expect(inquiryHref({ source: "about" })).toBe("/message?from=about");
  });

  it("carries the trip's catalog slug, never its name", () => {
    expect(inquiryHref({ source: "detail", trip: { slug: "sandals-royal-bahamian", name: "Evil\r\nName" } })).toBe(
      "/message?from=detail&trip=sandals-royal-bahamian",
    );
  });

  it("carries a topic when there is no trip", () => {
    expect(inquiryHref({ source: "topic", topic: "honeymoons" })).toBe("/message?from=topic&topic=honeymoons");
  });

  it("is never an email link any more (BRD §6.5, 2026-10-21)", () => {
    expect(inquiryHref({ source: "join" }).startsWith("mailto:")).toBe(false);
  });
});

describe("isInquirySource", () => {
  it("allows only the known pages", () => {
    expect(isInquirySource("detail")).toBe(true);
    expect(isInquirySource("evil")).toBe(false);
    expect(isInquirySource(null)).toBe(false);
  });
});
