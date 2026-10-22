import { describe, expect, it } from "vitest";

import { awayLabel, replyLabel, toAdvisorCard } from "./advisorCard";

describe("advisor card (§3.12 PR 3)", () => {
  it("says the reply-time promise the way people say it", () => {
    expect(replyLabel(2)).toBe("Usually replies within 2 hours");
    expect(replyLabel(12)).toBe("Usually replies within 12 hours");
    expect(replyLabel(24)).toBe("Usually replies within a day");
    expect(replyLabel(48)).toBe("Usually replies within 2 days");
    expect(replyLabel(null)).toBe("Usually replies within a day");
  });

  it("names the first day back, and nothing for a bad date", () => {
    expect(awayLabel("2026-10-20")).toBe("Away until Tuesday, October 20");
    expect(awayLabel(null)).toBeNull();
    expect(awayLabel("soon")).toBeNull();
  });

  it("shapes the row: photo on our origin, https links only, initials", () => {
    const card = toAdvisorCard(
      {
        displayName: "Gyasi Story",
        firstName: "Gyasi",
        pronouns: "he/him",
        bio: "  Plans trips carefully. ",
        avatarPath: "/storage/v1/object/public/agent-avatars/a/b.jpg",
        socialLinks: { instagram: "https://instagram.com/story.tail", website: "javascript:alert(1)", facebook: "http://x.com" },
        responseTimeHours: 4,
        awayUntil: null,
      },
      "https://x.supabase.co",
    );
    expect(card.avatarUrl).toBe("https://x.supabase.co/storage/v1/object/public/agent-avatars/a/b.jpg");
    expect(card.links).toEqual([{ label: "Instagram", href: "https://instagram.com/story.tail" }]);
    expect(card.initials).toBe("GS");
    expect(card.bio).toBe("Plans trips carefully.");
    expect(card.replyLabel).toBe("Usually replies within 4 hours");
    expect(card.awayLabel).toBeNull();
  });
});
