import { describe, expect, it } from "vitest";
import { isJoinIntent, joinHref, loginHref, tripHref } from "./links";

describe("joinHref", () => {
  it("builds the gate link with intent, trip and a safe next path", () => {
    expect(joinHref({ intent: "quote", trip: "couples-negril", next: "/explore/couples-negril" })).toBe(
      "/join?intent=quote&trip=couples-negril&next=%2Fexplore%2Fcouples-negril",
    );
  });

  it("drops an off-origin next instead of carrying an open redirect", () => {
    expect(joinHref({ intent: "save", next: "//evil.com" })).toBe("/join?intent=save");
    expect(joinHref({ intent: "save", next: "/\\evil.com" })).toBe("/join?intent=save");
    expect(joinHref({ intent: "save", next: "https://evil.com" })).toBe("/join?intent=save");
  });

  it("returns the bare path with no context", () => {
    expect(joinHref()).toBe("/join");
  });
});

describe("loginHref / tripHref / isJoinIntent", () => {
  it("encodes next and refuses unsafe values", () => {
    expect(loginHref("/explore")).toBe("/login?next=%2Fexplore");
    expect(loginHref("//evil.com")).toBe("/login");
    expect(loginHref()).toBe("/login");
  });

  it("encodes trip slugs", () => {
    expect(tripHref("a b")).toBe("/explore/a%20b");
  });

  it("allowlists intents", () => {
    expect(isJoinIntent("quote")).toBe(true);
    expect(isJoinIntent("hack")).toBe(false);
    expect(isJoinIntent(undefined)).toBe(false);
  });
});
