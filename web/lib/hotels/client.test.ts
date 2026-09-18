/**
 * @vitest-environment node
 *
 * Tests for the SerpApi client.
 *
 * Every case here is a paid-for failure: a credential in a table that outlives the
 * incident, a retry that cannot succeed spending requests to learn nothing, or an
 * unrecorded attempt making the ledger lie about a 250-a-month budget.
 *
 * Ported verbatim in meaning from `supabase/functions/_shared/hotels/client_test.ts`, with
 * ONE case rewritten rather than translated — the network-failure redaction test. See the
 * long comment on it: Deno and Node put the leaking URL in different places, and asserting
 * on Deno's wording under Node would have produced a test that proved nothing.
 */
import { describe, expect, it } from "vitest";
import {
  buildUrl,
  createSerpApiClient,
  redact,
  type RequestRecord,
  SerpApiError,
} from "./client";
import {
  ACCOUNT,
  API_KEY,
  ERROR_BODY,
  ROTATED_KEY,
  SEARCH_PAGE,
  stubFetch,
  type StubResponse,
} from "./__fixtures__/provider";
import { assert } from "./__fixtures__/assert";

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

describe("createSerpApiClient", () => {
  it("the key IS sent as a query parameter — the documented deviation", async () => {
    const { client, stub } = harness([{ body: SEARCH_PAGE }]);
    await client.search(PARAMS);
    // Asserted positively so the departure from the cruise client's "never in a URL" rule is
    // recorded by a test rather than only by a comment. SerpApi gives us no header option.
    expect(stub.calls[0].url).toContain(`api_key=${API_KEY}`);
  });

  it("but the key never reaches anything we keep", async () => {
    const { client, records } = harness([{ body: SEARCH_PAGE }]);
    await client.search(PARAMS);
    const record = records[0];
    expect(Object.hasOwn(record.query, "api_key")).toEqual(false);
    expect(JSON.stringify(record.query).includes(API_KEY)).toEqual(false);
    expect(record.path.includes("api_key")).toEqual(false);
  });

  it("buildUrl derives the sanitised copy before attaching the key", () => {
    const { url, query } = buildUrl("https://serpapi.com/search", { q: "aruba" }, API_KEY);
    expect(url).toContain("api_key=");
    expect(query).toEqual({ q: "aruba" });
  });

  it("a network failure cannot carry the full URL into the ledger", async () => {
    /**
     * REWRITTEN FOR THE RUNTIME, NOT TRANSLATED.
     *
     * Upstream this case built one error whose own `message` was Deno's real rejection —
     * `error sending request for url (https://…&api_key=…)` — and asserted the ledger row
     * came back carrying `[redacted]`. Node does not produce that string. Under undici,
     * `fetch` rejects with `TypeError: fetch failed` and hangs the detail, URL included,
     * off `cause`; `client.ts` reads only `.message`, so on this runtime the credential is
     * out of reach by construction rather than by redaction. Porting the assertion as
     * written would have failed; porting it and loosening it to `toBeTruthy` would have
     * left a test that asserts Node's own wording and nothing about our code.
     *
     * So both shapes are queued, and each is asserted for what it actually proves:
     *   - the Node shape proves the reachable text (`.message`) never held the key;
     *   - the Deno shape proves `redact()` really runs on the catch path, which is still
     *     load-bearing because `supabase/functions/hotel-search` runs this same module on
     *     Deno today, and because a polyfilled or future fetch may inline the URL again.
     */
    const nodeShaped = new TypeError("fetch failed");
    (nodeShaped as TypeError & { cause?: unknown }).cause = new Error(
      `connect ECONNREFUSED — https://serpapi.com/search?q=aruba&api_key=${API_KEY}`,
    );
    const denoShaped = new Error(
      `error sending request for url (https://serpapi.com/search?q=aruba&api_key=${API_KEY})`,
    );

    // Assert the fixtures are genuinely poisoned before asserting nothing leaked, the same
    // discipline map.test.ts uses — otherwise this passes against errors that never held a
    // credential in the first place.
    expect(String((nodeShaped as TypeError & { cause?: unknown }).cause)).toContain(API_KEY);
    expect(denoShaped.message).toContain(API_KEY);

    const { client, records } = harness([
      { body: null, throws: nodeShaped },
      { body: null, throws: nodeShaped },
      { body: null, throws: denoShaped },
    ]);

    await expect(client.search(PARAMS)).rejects.toThrow(SerpApiError);
    assert(records.length > 0);
    for (const record of records) {
      expect(record.errorDetail?.includes(API_KEY), "the key survived into the ledger")
        .toEqual(false);
    }
    // Only the attempt whose message carried the URL can show the redactor's mark; the Node
    // ones legitimately record the bare "fetch failed".
    expect(records[records.length - 1].errorDetail ?? "").toContain("[redacted]");
  });

  it("a provider error body echoing a DIFFERENT key is still redacted", () => {
    // Equality alone would miss this: a rotated credential echoed back in a cached upstream
    // error is not the key we are holding.
    const detail = `Invalid key: https://serpapi.com/search?q=x&api_key=${ROTATED_KEY}`;
    const cleaned = redact(detail, API_KEY);
    expect(cleaned.includes(ROTATED_KEY)).toEqual(false);
    expect(cleaned).toContain("api_key=[redacted]");
  });

  it("every attempt is recorded, including the ones that failed", async () => {
    const { client, records } = harness([
      { status: 500, body: { error: "upstream" } },
      { body: SEARCH_PAGE },
    ]);
    await client.search(PARAMS);
    // Record before judging: a rejected request has usually still been counted upstream.
    expect(records.length).toEqual(2);
    expect(records[0].statusCode).toEqual(500);
    expect(records[1].statusCode).toEqual(200);
  });

  it("rows_returned is recorded, which is what exposes a silent clamp", async () => {
    const { client, records } = harness([{ body: SEARCH_PAGE }]);
    await client.search(PARAMS);
    expect(records[0].rowsReturned).toEqual(SEARCH_PAGE.properties?.length);
  });

  it("a 401 is NOT retried", async () => {
    const { client, stub } = harness([{ status: 401, body: ERROR_BODY }]);
    await expect(client.search(PARAMS)).rejects.toThrow(SerpApiError);
    // Retrying a bad key spends requests to learn nothing.
    expect(stub.calls.length).toEqual(1);
  });

  it("a 429 is NOT retried — the hourly limit will not clear inside one request", async () => {
    const { client, stub } = harness([{ status: 429, body: { error: "rate limited" } }]);
    await expect(client.search(PARAMS)).rejects.toThrow(SerpApiError);
    expect(stub.calls.length).toEqual(1);
  });

  it("a 5xx IS retried, then gives up rather than looping on a budget", async () => {
    const { client, stub } = harness([
      { status: 502, body: { error: "bad gateway" } },
      { status: 502, body: { error: "bad gateway" } },
      { status: 502, body: { error: "bad gateway" } },
    ]);
    await expect(client.search(PARAMS)).rejects.toThrow(SerpApiError);
    expect(stub.calls.length).toEqual(3); // 1 + maxRetries
  });

  it("a 200 carrying an `error` key is treated as a failure, not as zero results", async () => {
    // SerpApi answers some failures with HTTP 200 and an error body. Mapping that to "no
    // hotels here" would cache an empty page for six hours.
    const { client } = harness([
      { body: { error: "Google Hotels hasn't returned any results" } },
      { body: { error: "Google Hotels hasn't returned any results" } },
      { body: { error: "Google Hotels hasn't returned any results" } },
    ]);
    await expect(client.search(PARAMS)).rejects.toThrow(SerpApiError);
  });

  it("account.json is recorded under its own endpoint, so it never counts as spend", async () => {
    const { client, records } = harness([{ body: ACCOUNT }]);
    const account = await client.account();
    expect(account.total_searches_left).toEqual(187);
    expect(records[0].endpoint).toEqual("account");
    expect(records[0].quota?.remaining).toEqual(187);
    expect(records[0].quota?.limit).toEqual(250);
    expect(records[0].quota?.hourLimit).toEqual(50);
  });

  it("a provider error's reason reaches the ledger, not just its status", async () => {
    // Without this, an operator watching the budget drain sees "401" and cannot tell a bad
    // key from a quota wall without going to the function logs.
    const { client, records } = harness([{ status: 401, body: ERROR_BODY }]);
    await expect(client.search(PARAMS)).rejects.toThrow(SerpApiError);
    expect(records[0].statusCode).toEqual(401);
    expect(records[0].errorCode).toEqual("provider_401");
    expect(records[0].errorDetail ?? "").toContain("Invalid API key");
  });
});
