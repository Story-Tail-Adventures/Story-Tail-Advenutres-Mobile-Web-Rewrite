/**
 * The guard on the guard.
 *
 * `provider-fetch.ts` keeps SerpApi's credential out of Next's instrumentation by reaching
 * past the patched global for `_nextOriginalFetch`. That is an INTERNAL of Next, so the
 * whole mechanism rests on a property name nobody promised us. If a Next upgrade renames or
 * removes it, `resolveProviderFetch()` silently falls back to the patched global and every
 * hotel search starts writing `api_key=…` into an OTel span name, into
 * `workStore.fetchMetrics` (which `next dev` prints verbatim), into the Data Cache key, and
 * into a `console.error` on a cache-key failure.
 *
 * Nothing about that failure is visible: searches keep working, pages keep rendering, and
 * the credential leaks. So these two cases exist to make a bad upgrade fail CI instead —
 * which is the only moment anyone is looking.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { resolveProviderFetch } from "./provider-fetch";

const require_ = createRequire(import.meta.url);

describe("provider-fetch", () => {
  it("Next still attaches the un-patched fetch as `_nextOriginalFetch`", () => {
    // Read the shipped source rather than booting a Next server: this asserts on the
    // contract we actually depend on, and it is the assertion that should break on upgrade.
    const patchFetch = readFileSync(
      require_.resolve("next/dist/server/lib/patch-fetch.js"),
      "utf8",
    );
    expect(patchFetch).toContain("_nextOriginalFetch");
    // The assignment specifically — a mention in a comment or a type would not save us.
    expect(patchFetch).toMatch(/_nextOriginalFetch\s*=/);
  });

  it("prefers `_nextOriginalFetch` over the patched global when one is present", () => {
    const original = globalThis.fetch;
    const sentinel = (() => Promise.resolve(new Response("sentinel"))) as typeof fetch;
    const patched = (() => Promise.resolve(new Response("patched"))) as typeof fetch & {
      _nextOriginalFetch?: typeof fetch;
    };
    patched._nextOriginalFetch = sentinel;

    try {
      globalThis.fetch = patched;
      // Identity, not behaviour: the point is that we do not call the patched one.
      expect(resolveProviderFetch()).toBe(sentinel);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("falls back to the global when the property is absent, rather than throwing", () => {
    // A leak is bad; taking the public marketing page down is worse. This pins the
    // trade-off deliberately so the first test above is the one that reports the problem.
    const original = globalThis.fetch;
    const bare = (() => Promise.resolve(new Response("bare"))) as typeof fetch;
    try {
      globalThis.fetch = bare;
      expect(resolveProviderFetch()).toBe(bare);
    } finally {
      globalThis.fetch = original;
    }
  });
});
