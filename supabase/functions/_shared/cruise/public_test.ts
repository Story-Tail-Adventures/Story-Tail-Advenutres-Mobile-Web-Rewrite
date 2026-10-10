/**
 * Tests for the public cruise read's itinerary line.
 *
 * The first real sync (2026-10-10) filled port lists the seed data never had: sea days written
 * in as stops ("At Sea", "Fun Day At Sea", "Cruising") and round trips that start and end at
 * the same port. The card heading says "Ports of call", so the first kind is wrong to show, and
 * both kinds repeat a name, which the card used to key its chips by.
 */
import { assertEquals } from "jsr:@std/assert@^1";
import type { Db } from "../db.ts";
import { isSeaDay, searchSailings } from "./public.ts";

/** Answers the two reads `searchSailings` makes: the rpc, then the port calls. */
function fakeDb(calls: { sailing_id: string; port_name: string; sequence: number }[]): Db {
  const sailing = {
    id: "s1",
    title: "7 Night Western Caribbean",
    departure_date: "2027-01-10",
    duration_nights: 7,
    destinations: ["Caribbean"],
    cruise_line: { name: "Royal Caribbean" },
    cruise_ship: null,
  };
  const chain = (data: unknown) => {
    const self = {
      select: () => self,
      in: () => self,
      order: () => self,
      limit: () => self,
      // deno-lint-ignore no-explicit-any
      then: (ok: any, err?: any) => Promise.resolve({ data, error: null }).then(ok, err),
    };
    return self;
  };
  return {
    rpc: () => chain([sailing]),
    from: () => chain(calls),
  } as unknown as Db;
}

const call = (port_name: string, sequence: number) => ({ sailing_id: "s1", port_name, sequence });

Deno.test("sea days are not ports of call", async () => {
  const [sailing] = await searchSailings(
    fakeDb([
      call("Fort Lauderdale", 1),
      call("At Sea", 2),
      call("Perfect Day CocoCay", 3),
      call("Fun Day At Sea", 4),
      call("Cruising", 5),
      call("Cozumel, Mexico", 6),
      call("At Sea", 7),
      call("Fort Lauderdale", 8),
    ]),
    { limit: 24 },
  );

  // The round trip's home port stays at both ends: it is a real port, and the card keys
  // its chips by position as well as name.
  assertEquals(sailing.ports, [
    "Fort Lauderdale",
    "Perfect Day CocoCay",
    "Cozumel, Mexico",
    "Fort Lauderdale",
  ]);
});

Deno.test("a sea day between two calls at one port still collapses to one", async () => {
  const [sailing] = await searchSailings(
    fakeDb([call("Nassau, Bahamas", 1), call("At Sea", 2), call("Nassau, Bahamas", 3)]),
    { limit: 24 },
  );
  assertEquals(sailing.ports, ["Nassau, Bahamas"]);
});

Deno.test("only exact sea-day names are dropped, never a port that merely contains the words", () => {
  for (const name of ["At Sea", "at sea", " Fun Day At Sea ", "CRUISING", "Day at  Sea", "Sea Day"]) {
    assertEquals(isSeaDay(name), true, name);
  }
  for (
    const name of [
      "Perfect Day CocoCay",
      "Perfect Day at CocoCay",
      "Seattle, Washington",
      "Hubbard Glacier",
      "Inside Passage",
      "Scenic Cruising Tracy Arm",
    ]
  ) {
    assertEquals(isSeaDay(name), false, name);
  }
});
