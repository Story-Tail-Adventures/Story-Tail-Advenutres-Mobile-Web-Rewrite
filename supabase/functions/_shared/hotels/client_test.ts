/**
 * Tests for the SerpApi client.
 *
 * Every case here is a paid-for failure: a credential in a table that outlives the
 * incident, a retry that cannot succeed spending requests to learn nothing, or an
 * unrecorded attempt making the ledger lie about a 250-a-month budget.
 *
 * WHAT CHANGED WITH THE LIBRARY. The transport is now `deno.land/x/serpapi`, which rejects
 * with the raw body STRING and no status code, so the cases that used to be expressed as
 * "a 401" and "a 5xx" are expressed as the provider's wording instead. The two tests named
 * for that loss say so out loud, because it is the one place this file is weaker than the
 * hand-rolled client it replaced.
 */
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@^1";
import {
  buildCall,
  classify,
  createSerpApiClient,
  redact,
  type RequestRecord,
  SerpApiError,
} from "./client.ts";
import {
  ACCOUNT,
  API_KEY,
  ERROR_BODY,
  RATE_LIMITED_BODY,
  ROTATED_KEY,
  SEARCH_PAGE,
  stubProvider,
  type StubResponse,
  TRANSIENT_BODY,
} from "./__fixtures__/provider.ts";

function harness(responses: StubResponse[]) {
  const stub = stubProvider(responses);
  const records: RequestRecord[] = [];
  const client = createSerpApiClient({
    apiKey: API_KEY,
    searchImpl: stub.impl,
    accountImpl: stub.impl,
    onRequest: (record) => {
      records.push(record);
    },
    sleep: () => Promise.resolve(),
  });
  return { client, stub, records };
}

const PARAMS = { engine: "google_hotels", q: "aruba", check_in_date: "2026-10-19" };

/** The provider's non-200 channel: a raw JSON body, as a string. */
const asBody = (body: unknown) => JSON.stringify(body, null, 2);

Deno.test("the key IS handed to the provider — the documented deviation", async () => {
  const { client, stub } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  // Asserted positively so the departure from the cruise client's "never in a URL" rule is
  // recorded by a test rather than only by a comment. SerpApi gives us no header option,
  // and the library puts this straight into the query string.
  assertEquals(stub.calls[0].api_key, API_KEY);
});

Deno.test("but the key never reaches anything we keep", async () => {
  const { client, records } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  const record = records[0];
  assertEquals(Object.hasOwn(record.query, "api_key"), false);
  assertEquals(JSON.stringify(record.query).includes(API_KEY), false);
  assertEquals(record.path.includes("api_key"), false);
});

Deno.test("buildCall derives the sanitised copy before attaching the key", () => {
  const { callParams, query } = buildCall({ q: "aruba" }, API_KEY, 12_000);
  assertEquals(callParams.api_key, API_KEY);
  assertEquals(query, { q: "aruba" });
  assertEquals(Object.hasOwn(query, "api_key"), false);
});

Deno.test("our 12s deadline is passed to the library, NOT its 60s default", async () => {
  // Without this the provider's ceiling would sit four times beyond the web caller's 14s
  // abort, so every slow attempt would be abandoned by the browser and still be billed.
  const { client, stub } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  assertEquals(stub.calls[0].timeout, 12_000);
});

Deno.test("a transport failure whose message carries the full URL is recorded redacted", async () => {
  const leaky = new Error(
    `error sending request for url (https://serpapi.com/search?q=aruba&api_key=${API_KEY})`,
  );
  const { client, records } = harness([
    { rejects: leaky },
    { rejects: leaky },
    { rejects: leaky },
  ]);

  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assert(records.length > 0);
  for (const record of records) {
    assertEquals(
      record.errorDetail?.includes(API_KEY),
      false,
      "the key survived into the ledger",
    );
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
    { rejects: asBody(TRANSIENT_BODY) },
    { body: SEARCH_PAGE },
  ]);
  await client.search(PARAMS);
  // Record before judging: a rejected request has usually still been counted upstream.
  assertEquals(records.length, 2);
  assertEquals(records[1].statusCode, 200);
});

Deno.test("THE STATUS CODE IS GONE: a failed attempt records null, not a number", async () => {
  // The library resolves on 200 and rejects with the body alone, so there is no status to
  // record. This asserts the loss deliberately — if a future transport restores the status,
  // this test should fail and be deleted, rather than the gap quietly persisting.
  const { client, records } = harness([
    { rejects: asBody(TRANSIENT_BODY) },
    { body: SEARCH_PAGE },
  ]);
  await client.search(PARAMS);
  assertEquals(records[0].statusCode, null);
  assertEquals(records[0].errorCode, "provider_unavailable");
});

Deno.test("rows_returned is recorded, which is what exposes a silent clamp", async () => {
  const { client, records } = harness([{ body: SEARCH_PAGE }]);
  await client.search(PARAMS);
  assertEquals(records[0].rowsReturned, SEARCH_PAGE.properties?.length);
});

Deno.test("an invalid key is NOT retried — inferred from the message, not a 401", async () => {
  const { client, stub } = harness([{ rejects: asBody(ERROR_BODY) }]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  // Retrying a bad key spends requests to learn nothing.
  assertEquals(stub.calls.length, 1);
});

Deno.test("a rate limit is NOT retried — it will not clear inside one request", async () => {
  const { client, stub } = harness([{ rejects: asBody(RATE_LIMITED_BODY) }]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assertEquals(stub.calls.length, 1);
});

Deno.test("an unrecognised failure IS retried, then gives up rather than looping", async () => {
  // Unrecognised is treated as transient on purpose: this is the branch that used to be
  // "5xx", and it is the safer default now that the status code is unavailable.
  const { client, stub } = harness([
    { rejects: asBody(TRANSIENT_BODY) },
    { rejects: asBody(TRANSIENT_BODY) },
    { rejects: asBody(TRANSIENT_BODY) },
  ]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assertEquals(stub.calls.length, 3); // 1 + maxRetries
});

Deno.test("a RESOLVED body carrying an `error` key is a failure, not zero results", async () => {
  // SerpApi answers some failures with HTTP 200 and an error body, so the library resolves
  // and cannot warn us. Mapping that to "no hotels here" would cache an empty page for six
  // hours.
  const errorPage = { error: "Google Hotels hasn't returned any results" };
  const { client } = harness([{ body: errorPage }, { body: errorPage }, {
    body: errorPage,
  }]);
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

Deno.test("a provider error's reason reaches the ledger, not just a code", async () => {
  // Without this, an operator watching the budget drain sees a code and cannot tell a bad
  // key from a quota wall without going to the function logs. This matters MORE now: the
  // status code that used to carry half the meaning is no longer available.
  const { client, records } = harness([{ rejects: asBody(ERROR_BODY) }]);
  await assertRejects(() => client.search(PARAMS), SerpApiError);
  assertEquals(records[0].statusCode, null);
  assertEquals(records[0].errorCode, "provider_invalid_key");
  assertStringIncludes(records[0].errorDetail ?? "", "Invalid API key");
});

Deno.test("classify: the library's timeout is transient, and says so", () => {
  const error = classify({ name: "RequestTimeoutError" }, API_KEY);
  assertEquals(error.code, "provider_timeout");
  assertEquals(error.permanent, false);
});

Deno.test("classify: a quota wall is permanent", () => {
  const error = classify(
    asBody({ error: "You've run out of searches for this month" }),
    API_KEY,
  );
  assertEquals(error.code, "provider_quota");
  assertEquals(error.permanent, true);
});

Deno.test("classify: a non-JSON body is used verbatim rather than discarded", () => {
  // A gateway in front of the provider can answer HTML. Losing it would leave the ledger
  // with a code and no sentence.
  const error = classify("<html><body>502 Bad Gateway</body></html>", API_KEY);
  assertEquals(error.permanent, false);
  assertStringIncludes(error.detail, "502 Bad Gateway");
});
