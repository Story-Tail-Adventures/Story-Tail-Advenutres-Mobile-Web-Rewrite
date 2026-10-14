import { describe, expect, it } from "vitest";

import {
  EMPTY_INBOX_QUERY,
  inboxHref,
  inboxQueryFromParams,
  isNarrowed,
  newMessageHref,
  threadHref,
} from "./messageQuery";

const C = "0195a2c0-1a00-7000-8000-000000000101";
const T = "0195a2c0-1a00-7000-8000-000000000040";

describe("the inbox's filters as a URL (§3.10.1)", () => {
  it("reads what it knows and drops what it does not", () => {
    expect(inboxQueryFromParams({})).toEqual(EMPTY_INBOX_QUERY);
    expect(
      inboxQueryFromParams({ view: "archived", unread: "1", overdue: "1", client: C.toUpperCase(), trip: T, q: "  passport  ", page: "3" }),
    ).toEqual({ archived: true, unread: true, overdue: true, clientId: C, tripId: T, search: "passport", page: 3 });
    // Not a uuid, not a page, not a known view: ignored rather than sent to the database.
    expect(inboxQueryFromParams({ view: "trash", client: "nope", trip: "1; drop", page: "-2", unread: "yes" })).toEqual(EMPTY_INBOX_QUERY);
    expect(inboxQueryFromParams({ q: "x".repeat(300) }).search).toHaveLength(100);
  });

  it("round-trips, with a plain inbox as a plain URL", () => {
    expect(inboxHref(EMPTY_INBOX_QUERY)).toBe("/agent/messages");
    const q = inboxQueryFromParams({ unread: "1", client: C, q: "dive & snorkel", page: "2" });
    const href = inboxHref(q);
    expect(href).toBe(`/agent/messages?unread=1&client=${C}&q=dive+%26+snorkel&page=2`);
    expect(inboxQueryFromParams(Object.fromEntries(new URL(`http://x${href}`).searchParams))).toEqual(q);
  });

  it("keeps the filters on a thread link, so the list beside it stays put", () => {
    expect(threadHref("abc", { ...EMPTY_INBOX_QUERY, overdue: true })).toBe("/agent/messages/abc?overdue=1");
    expect(threadHref("abc")).toBe("/agent/messages/abc");
  });

  it("addresses a new message to a client, and optionally a trip", () => {
    expect(newMessageHref(C)).toBe(`/agent/messages/new?client=${C}`);
    expect(newMessageHref(C, T)).toBe(`/agent/messages/new?client=${C}&trip=${T}`);
  });

  it("knows a narrowed list from an empty inbox", () => {
    expect(isNarrowed(EMPTY_INBOX_QUERY)).toBe(false);
    expect(isNarrowed({ ...EMPTY_INBOX_QUERY, archived: true })).toBe(false);
    expect(isNarrowed({ ...EMPTY_INBOX_QUERY, search: "x" })).toBe(true);
  });
});
