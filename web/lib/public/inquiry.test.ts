import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInquiryMailto, inquiryBodyLines, inquiryHref, inquirySubject } from "./inquiry";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildInquiryMailto", () => {
  it("builds a mailto with an encoded subject and CRLF-joined body", () => {
    const href = buildInquiryMailto({ source: "detail", trip: { slug: "x", name: "Sandals Royal Bahamian" } }, "gyasi@example.com");
    expect(href.startsWith("mailto:gyasi@example.com?subject=")).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get("subject")).toBe("Trip inquiry · Sandals Royal Bahamian");
    expect(url.searchParams.get("body")).toContain("Sandals Royal Bahamian");
    expect(url.searchParams.get("body")).toContain("Roughly when:");
  });

  it("collapses CR/LF in interpolated values so nothing can inject a mail header", () => {
    const href = buildInquiryMailto(
      { source: "detail", trip: { slug: "x", name: "Evil\r\nBcc: victim@example.com" } },
      "gyasi@example.com",
    );
    // The href itself carries no raw line breaks anywhere.
    expect(href).not.toMatch(/[\r\n]/);
    const url = new URL(href);
    // The trip name arrives as one line in the subject — the injected "Bcc:" is inert text.
    expect(url.searchParams.get("subject")).toBe("Trip inquiry · Evil Bcc: victim@example.com");
    // Body lines are separated only by the encoded CRLF the mailto format requires.
    const body = url.searchParams.get("body")!;
    expect(body.split("\r\n").some((line) => /^bcc:/i.test(line))).toBe(false);
    // Only the configured address appears before the query string.
    expect(href.split("?")[0]).toBe("mailto:gyasi@example.com");
  });

  it("caps the subject length", () => {
    const name = "A".repeat(500);
    expect(inquirySubject({ source: "detail", trip: { slug: "x", name } }).length).toBeLessThanOrEqual(120);
  });

  it("uses topic and generic subjects when there is no trip", () => {
    expect(inquirySubject({ source: "topic", topic: "honeymoons" })).toBe("Trip inquiry · a honeymoon");
    expect(inquirySubject({ source: "landing" })).toBe("Trip inquiry");
    expect(inquiryBodyLines({ source: "landing" })[2]).toContain("dreaming about a trip");
  });
});

describe("inquiryHref", () => {
  it("uses the configured inquiry address", () => {
    vi.stubEnv("NEXT_PUBLIC_INQUIRY_EMAIL", "hello@story-tail.test");
    expect(inquiryHref({ source: "landing" }).startsWith("mailto:hello@story-tail.test?")).toBe(true);
  });

  it("falls back to the sign-up gate in production when no address is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_INQUIRY_EMAIL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(inquiryHref({ source: "detail", trip: { slug: "sandals-royal-bahamian", name: "x" } })).toBe(
      "/join?intent=message&trip=sandals-royal-bahamian",
    );
  });
});
