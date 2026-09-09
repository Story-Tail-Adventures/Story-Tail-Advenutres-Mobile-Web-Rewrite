/**
 * Tests for the track.cruises client.
 *
 * The costly failures this pins down are all about a metered budget: a retry that cannot
 * succeed spends requests to learn nothing, an unrecorded attempt makes the ledger lie, and
 * an error shape we do not parse turns a 429 into an unhandled crash mid-run.
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@^1";
import {
  createTrackCruisesClient,
  type RequestRecord,
  TRACK_CRUISES_HOST,
  TrackCruisesError,
} from "./client.ts";
import {
  CRUISE_LINES_PAGE,
  CRUISES_PAGE_ONE,
  CRUISES_PAGE_TWO,
  PROBLEM_403,
  PROBLEM_429,
  quotaHeaders,
  RELAY_401,
  RELAY_429,
  stubFetch,
  type StubResponse,
} from "./__fixtures__/provider.ts";

const KEY = "test-rapidapi-key-do-not-use";

function harness(responses: StubResponse[]) {
  const stub = stubFetch(responses);
  const records: RequestRecord[] = [];
  const client = createTrackCruisesClient({
    apiKey: KEY,
    fetchImpl: stub.impl,
    onRequest: (record) => {
      records.push(record);
    },
    // Tests must not actually wait out a backoff.
    sleep: () => Promise.resolve(),
  });
  return { client, stub, records };
}

Deno.test("sends both RapidAPI headers and keeps the key out of the URL", async () => {
  const { client, stub } = harness([
    { body: CRUISE_LINES_PAGE, headers: quotaHeaders(99) },
  ]);
  await client.cruiseLines();

  const call = stub.calls[0];
  assertEquals(call.headers["x-rapidapi-key"], KEY);
  assertEquals(call.headers["x-rapidapi-host"], TRACK_CRUISES_HOST);
  // A key in a query string ends up in every access log between here and there.
  assertEquals(call.url.includes(KEY), false);
  assertEquals(call.url, `https://${TRACK_CRUISES_HOST}/cruise-lines`);
});

Deno.test("captures the quota triple from the response headers", async () => {
  const { client, records } = harness([
    { body: CRUISE_LINES_PAGE, headers: quotaHeaders(87, 100, 604_800) },
  ]);
  const page = await client.cruiseLines();

  assertEquals(page.quota, { limit: 100, remaining: 87, resetSeconds: 604_800 });
  assertEquals(records[0].quota.remaining, 87);
});

Deno.test("survives a response with no quota headers at all", async () => {
  const { client } = harness([{ body: CRUISE_LINES_PAGE }]);
  const page = await client.cruiseLines();
  assertEquals(page.quota, { limit: null, remaining: null, resetSeconds: null });
});

Deno.test("records rows_returned, which is what exposes a silent tier clamp", async () => {
  // The provider clamps an over-tier `limit` down to the cap and still answers 200, so a
  // run that asks for 100 and is handed 10 looks healthy without this column.
  const { client, records } = harness([
    { body: CRUISE_LINES_PAGE, headers: quotaHeaders(99) },
  ]);
  await client.cruiseLines();
  assertEquals(records[0].rowsReturned, 3);
  assertEquals(records[0].endpoint, "cruise_lines");
  assertEquals(records[0].path, "/cruise-lines");
});

Deno.test("paginates by cursor, and sends no page or offset parameter", async () => {
  const { client, stub } = harness([
    { body: CRUISES_PAGE_ONE, headers: quotaHeaders(98) },
    { body: CRUISES_PAGE_TWO, headers: quotaHeaders(97) },
  ]);

  const first = await client.cruises({ limit: 10, company: "holland-america" });
  assertEquals(first.hasMore, true);
  assertEquals(first.nextCursor, "cursor-page-2");

  const second = await client.cruises({
    limit: 10,
    company: "holland-america",
    startingAfter: first.nextCursor!,
  });
  assertEquals(second.hasMore, false);
  assertEquals(second.nextCursor, null);

  const url = new URL(stub.calls[1].url);
  assertEquals(url.searchParams.get("starting_after"), "cursor-page-2");
  assertEquals(url.searchParams.get("limit"), "10");
  // Their pagination is cursor-only; sending these is silently ignored, which reads as a
  // loop paying for page one forever.
  assertEquals(url.searchParams.has("page"), false);
  assertEquals(url.searchParams.has("offset"), false);
  assertEquals(url.searchParams.has("cursor"), false);
});

Deno.test("omits empty and undefined query parameters entirely", async () => {
  const { client, stub, records } = harness([
    { body: CRUISES_PAGE_TWO, headers: quotaHeaders(96) },
  ]);
  await client.cruises({ limit: 10 });

  const url = new URL(stub.calls[0].url);
  assertEquals(url.searchParams.has("company"), false);
  assertEquals(url.searchParams.has("locale"), false);
  assertEquals(url.searchParams.has("sort"), false);
  assertEquals(records[0].query, { limit: "10" });
});

Deno.test("parses their RFC 9457 problem body", async () => {
  const { client } = harness([
    { status: 429, body: PROBLEM_429, headers: quotaHeaders(0) },
    { status: 429, body: PROBLEM_429, headers: quotaHeaders(0) },
    { status: 429, body: PROBLEM_429, headers: quotaHeaders(0) },
  ]);

  const error = await assertRejects(
    () => client.cruiseLines(),
    TrackCruisesError,
  );
  assertEquals(error.code, "rate_limit_exceeded");
  assertEquals(error.status, 429);
  assertEquals(error.retryAfterSeconds, 2);
  assertEquals(error.providerRequestId, "01JSAX0000000000000000429");
  assertEquals(error.permanent, false);
});

Deno.test("parses the relay's bare message body, which carries no code", async () => {
  // Shape 2 of the two their §RateLimited response documents. Observed verbatim from a
  // keyless probe of /coverage, an endpoint their spec calls public.
  const { client } = harness([
    { status: 429, body: RELAY_429 },
    { status: 429, body: RELAY_429 },
    { status: 429, body: RELAY_429 },
  ]);

  const error = await assertRejects(() => client.cruiseLines(), TrackCruisesError);
  assertEquals(error.code, "rate_limit_exceeded");
  assertEquals(error.detail.includes("rate limit per minute"), true);
  assertEquals(error.providerRequestId, null);
});

Deno.test("retries a 429 and succeeds, honouring retry_after_seconds", async () => {
  const { client, records } = harness([
    { status: 429, body: PROBLEM_429, headers: quotaHeaders(5) },
    { body: CRUISE_LINES_PAGE, headers: quotaHeaders(4) },
  ]);

  const page = await client.cruiseLines();
  assertEquals(page.data.length, 3);
  // BOTH attempts are on the record, because the relay counted both.
  assertEquals(records.length, 2);
  assertEquals(records[0].statusCode, 429);
  assertEquals(records[0].errorCode, "rate_limit_exceeded");
  assertEquals(records[1].statusCode, 200);
  assertEquals(records[1].errorCode, null);
});

Deno.test("does NOT retry a 403 tier gate — a retry cannot change the answer", async () => {
  const { client, records, stub } = harness([{ status: 403, body: PROBLEM_403 }]);

  const error = await assertRejects(() => client.cruiseLines(), TrackCruisesError);
  assertEquals(error.code, "tier_insufficient");
  assertEquals(error.permanent, true);
  assertEquals(error.requiredTier, "PRO");
  // One attempt, one ledger row, two requests saved.
  assertEquals(stub.calls.length, 1);
  assertEquals(records.length, 1);
});

Deno.test("does NOT retry a 401 — three attempts to learn the key is still bad", async () => {
  const { client, stub } = harness([{ status: 401, body: RELAY_401 }]);

  const error = await assertRejects(() => client.cruiseLines(), TrackCruisesError);
  assertEquals(error.code, "unauthorized");
  assertEquals(error.permanent, true);
  assertEquals(stub.calls.length, 1);
});

Deno.test("retries a 5xx, which is the one failure a retry does fix", async () => {
  const { client, stub } = harness([
    { status: 503, body: { message: "upstream unavailable" } },
    { body: CRUISE_LINES_PAGE, headers: quotaHeaders(50) },
  ]);

  const page = await client.cruiseLines();
  assertEquals(page.data.length, 3);
  assertEquals(stub.calls.length, 2);
});

Deno.test("gives up after maxRetries rather than looping on a budget", async () => {
  const stub = stubFetch([
    { status: 503, body: {} },
    { status: 503, body: {} },
    { status: 503, body: {} },
    { status: 503, body: {} },
  ]);
  const records: RequestRecord[] = [];
  const client = createTrackCruisesClient({
    apiKey: KEY,
    fetchImpl: stub.impl,
    onRequest: (r) => void records.push(r),
    sleep: () => Promise.resolve(),
    maxRetries: 2,
  });

  await assertRejects(() => client.cruiseLines(), TrackCruisesError);
  // maxRetries 2 means three attempts, not four, and never an unbounded loop.
  assertEquals(stub.calls.length, 3);
  assertEquals(records.length, 3);
  assertEquals(stub.remaining(), 1);
});

Deno.test("records an attempt that never completed, with a null status", async () => {
  // Network-level failure: timeout, DNS, abort. "Never completed" has to be distinguishable
  // in the ledger from "completed with an error".
  const records: RequestRecord[] = [];
  const client = createTrackCruisesClient({
    apiKey: KEY,
    fetchImpl: () => Promise.reject(new Error("connection reset")),
    onRequest: (r) => void records.push(r),
    sleep: () => Promise.resolve(),
    maxRetries: 0,
  });

  await assertRejects(() => client.cruiseLines(), TrackCruisesError);
  assertEquals(records.length, 1);
  assertEquals(records[0].statusCode, null);
  assertEquals(records[0].errorCode, "network_error");
});

Deno.test("redacts the api key from anything it is about to persist", async () => {
  // The key lives only in a header and should never reach an error string — but
  // error_detail outlives the incident, and a credential in a table is worse than the
  // failure that put it there.
  const records: RequestRecord[] = [];
  const client = createTrackCruisesClient({
    apiKey: KEY,
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: `bad key ${KEY} rejected` }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    onRequest: (r) => void records.push(r),
    sleep: () => Promise.resolve(),
  });

  await assertRejects(() => client.cruiseLines(), TrackCruisesError);
  assertEquals(records[0].errorDetail?.includes(KEY), false);
  assertEquals(records[0].errorDetail?.includes("[redacted]"), true);
});

Deno.test("cruise detail passes company, without which the id is ambiguous", async () => {
  // Cruise ids are unique only per line, and Princess and Holland America share the Y731
  // voyage-code format. Omitting company is how you fetch the wrong ship's prices.
  const { client, stub } = harness([
    { body: { data: CRUISES_PAGE_ONE.data[0] }, headers: quotaHeaders(80) },
  ]);
  await client.cruise("Y731", "holland-america");

  const url = new URL(stub.calls[0].url);
  assertEquals(url.pathname, "/cruises/Y731");
  assertEquals(url.searchParams.get("company"), "holland-america");
});

Deno.test("filter-options accepts a wrapped or unwrapped body", async () => {
  // Their spec does not pin whether this endpoint wraps in `data`, and finding out costs a
  // request. Accept both rather than lose one to a shape assumption.
  const wrapped = harness([
    { body: { data: { ports: ["Miami"], destinations: ["Caribbean"] } } },
  ]);
  const a = await wrapped.client.filterOptions();
  assertEquals(a.data.ports, ["Miami"]);

  const bare = harness([{ body: { ports: ["Nassau"], destinations: ["Bahamas"] } }]);
  const b = await bare.client.filterOptions();
  assertEquals(b.data.ports, ["Nassau"]);
});
