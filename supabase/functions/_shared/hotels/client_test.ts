/**
 * Tests for the SerpApi client.
 *
 * Every case here is a paid-for failure: a credential in a table that outlives the
 * incident, a retry that cannot succeed spending requests to learn nothing, or an
 * unrecorded attempt making the ledger lie about a 250-a-month budget.
 */
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1";
import {
  buildUrl,
  createSerpApiClient,
  redact,
  type RequestRecord,
  SerpApiError,
} from "./client.ts";
import {
  ACCOUNT,
  API_KEY,
  ERROR_BODY,
  ROTATED_KEY,
  SEARCH_PAGE,
  stubFetch,
  type StubResponse,
} from "./__fixtures__/provider.ts";

function harness(responses: StubResponse[]) {
  const stub = stubFetch(responses);
  const records: RequestRecord[] = [];
  const client = createSerpApiClient({
    apiKey: API_KEY,
    fetchImpl: stub.impl,
    onRequest: (record) => {
      records.push(record);
    },
    sleep: () => Promise.resolve(),
  });
  return { client, stub, records };
}

const PARAMS = { engine: "google_hotels", q: "aruba", check_in_date: "2026-10-19" };

Deno.test("the key IS sent as a query parameter — the documented deviation", async () => {
  const { client, stub } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  // Asserted positively so the departure from the cruise client's "never in a URL" rule is
  // recorded by a test rather than only by a comment. SerpApi gives us no header option.
  assertStringIncludes(stub.calls[0].url, `api_key=${API_KEY}`);
});

Deno.test("but the key never reaches anything we keep", async () => {
  const { client, records } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  const record = records[0];
  assertEquals(Object.hasOwn(record.query, "api_key"), false);
  assertEquals(JSON.stringify(record.query).includes(API_KEY), false);
  assertEquals(record.path.includes("api_key"), false);
});

Deno.test("buildUrl derives the sanitised copy before attaching the key", () => {
  const { url, query } = buildUrl("https://serpapi.com/search", { q: "aruba" }, API_KEY);
  assertStringIncludes(url, "api_key=");
  assertEquals(query, { q: "aruba" });
});

Deno.test("a network failure whose message carries the full URL is recorded redacted", async () => {
  // Deno's real rejection reads: error sending request for url (https://…&api_key=…)
  const leaky = new Error(
    `error sending request for url (https://serpapi.com/search?q=aruba&api_key=${API_KEY})`,
  );
  const { client, records } = harness([{ body: null, throws: leaky }, { body: null, throws: leaky }, {
    body: null,
    throws: leaky,
  }]);

  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assert(records.length > 0);
  for (const record of records) {
    assertEquals(record.errorDetail?.includes(API_KEY), false, "the key survived into the ledger");
    assertStringIncludes(record.errorDetail ?? "", "[redacted]");
  }
});

Deno.test("a provider error body echoing a DIFFERENT key is still redacted", () => {
  // Equality alone would miss this: a rotated credential echoed back in a cached upstream
  // error is not the key we are holding.
  const detail = `Invalid key: https://serpapi.com/search?q=x&api_key=${ROTATED_KEY}`;
  const cleaned = redact(detail, API_KEY);
  assertEquals(cleaned.includes(ROTATED_KEY), false);
  assertStringIncludes(cleaned, "api_key=[redacted]");
});

Deno.test("every attempt is recorded, including the ones that failed", async () => {
  const { client, records } = harness([
    { status: 500, body: { error: "upstream" } },
    { body: SEARCH_PAGE },
  ]);
  await client.search(PARAMS);
  // Record before judging: a rejected request has usually still been counted upstream.
  assertEquals(records.length, 2);
  assertEquals(records[0].statusCode, 500);
  assertEquals(records[1].statusCode, 200);
});

Deno.test("rows_returned is recorded, which is what exposes a silent clamp", async () => {
  const { client, records } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  assertEquals(records[0].rowsReturned, SEARCH_PAGE.properties?.length);
});

Deno.test("a 401 is NOT retried", async () => {
  const { client, stub } = harness([{ status: 401, body: ERROR_BODY }]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  // Retrying a bad key spends requests to learn nothing.
  assertEquals(stub.calls.length, 1);
});

Deno.test("a 429 is NOT retried — the hourly limit will not clear inside one request", async () => {
  const { client, stub } = harness([{ status: 429, body: { error: "rate limited" } }]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assertEquals(stub.calls.length, 1);
});

Deno.test("a 5xx IS retried, then gives up rather than looping on a budget", async () => {
  const { client, stub } = harness([
    { status: 502, body: { error: "bad gateway" } },
    { status: 502, body: { error: "bad gateway" } },
    { status: 502, body: { error: "bad gateway" } },
  ]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assertEquals(stub.calls.length, 3); // 1 + maxRetries
});

Deno.test("a 200 carrying an `error` key is treated as a failure, not as zero results", async () => {
  // SerpApi answers some failures with HTTP 200 and an error body. Mapping that to "no
  // hotels here" would cache an empty page for six hours.
  const { client } = harness([
    { body: { error: "Google Hotels hasn't returned any results" } },
    { body: { error: "Google Hotels hasn't returned any results" } },
    { body: { error: "Google Hotels hasn't returned any results" } },
  ]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
});

Deno.test("account.json is recorded under its own endpoint, so it never counts as spend", async () => {
  const { client, records } = harness([{ body: ACCOUNT }]);
  const account = await client.account();
  assertEquals(account.total_searches_left, 187);
  assertEquals(records[0].endpoint, "account");
  assertEquals(records[0].quota?.remaining, 187);
  assertEquals(records[0].quota?.limit, 250);
  assertEquals(records[0].quota?.hourLimit, 50);
});
