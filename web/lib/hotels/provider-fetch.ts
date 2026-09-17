/**
 * The fetch the SerpApi client is given — Next's ORIGINAL one, not the patched global. P2.
 *
 * This file exists for one reason, and it is the same reason `client.ts` is written the way
 * it is: SERPAPI TAKES ITS CREDENTIAL AS A QUERY PARAMETER. `buildUrl` already keeps the key
 * out of everything we persist, by deriving the sanitised copy of the parameters before the
 * key is attached. That invariant holds inside our own code. It stops holding the moment the
 * URL is handed to `globalThis.fetch` under Next, because Next replaces that function during
 * server rendering and the replacement reads the href.
 *
 * TWO DISTINCT LEAKS, both from the same patch, and each is sufficient on its own.
 *
 * 1. TRACING. `createPatchedFetcher` in next/dist/server/lib/patch-fetch.js parses the input
 *    into a URL and clears exactly two fields — `url.username` and `url.password` — then uses
 *    the resulting href as both the OpenTelemetry span NAME (`fetch GET <href>`) and the
 *    `http.url` span attribute. Userinfo is the only secret it knows about; a query parameter
 *    is, to it, ordinary request shape. So a naive call puts `api_key=…` into the span name,
 *    which is the one string every tracing backend indexes, renders in a waterfall and keeps
 *    for the retention window. `redact()` cannot help here: it guards strings WE construct,
 *    and this one is constructed inside Next from the argument we passed.
 *
 * 2. THE DATA CACHE. The same patched function calls
 *    `incrementalCache.generateCacheKey(fetchUrl, …)` and writes the response under that key.
 *    The key is derived from the href — credential included — and on a self-hosted or Vercel
 *    build the fetch cache is a file on disk, so the effect is a credential at rest, in a
 *    directory nobody thinks of as a secret store, surviving the process that created it.
 *    That is worse than the logging leak because it persists without anyone reading a log.
 *
 * Bypassing the patch also means bypassing the Data Cache's behaviour entirely, which is what
 * we want on the merits and not merely as a side effect: hotel search already has a cache,
 * it is the `hotel_search_cache` table in `cache.ts`, keyed on the CANONICALISED search input
 * rather than on a URL that carries a rotating secret and a pile of provider-specific
 * parameters. Two caches over one request would mean two TTLs to reason about and a stale
 * answer we cannot invalidate.
 *
 * WHY THIS RESOLVES PER CALL rather than reading `globalThis.fetch` once at module load: the
 * patch is installed lazily, per request, when the server enters a render or route handler
 * that needs it. A module evaluated during boot — or, in dev, evaluated before the first
 * request through a route that triggers patching — would capture the unpatched global and be
 * accidentally correct, then capture the patched one after an HMR reload and be silently
 * wrong. Reading it at call time makes the behaviour the same on every path.
 *
 * The fallback is `globalThis.fetch` itself, which is the right answer in one of the two cases
 * where `_nextOriginalFetch` is absent and a quiet failure in the other. Under Vitest there is
 * no Next server, nothing is patched, and the global IS the original — correct. But on a
 * future Next that renames or drops the property, the same fallback hands back the PATCHED
 * fetch and we lose the protection without losing the request, which is the shape of bug that
 * survives a release. `resolveProviderFetch` is exported so a test can assert the property is
 * still attached under the version in `package.json` (Next 16.3.4 as of this change) and make
 * a bad upgrade fail CI rather than leak. Re-verify the two leaks above if that test ever goes
 * red — Next may have fixed them, in which case this file can go.
 *
 * Wired in as `fetchImpl` on `SearchDeps` / `ClientOptions` — the same injection point the
 * tests use for their stub, which is why the client never had to know any of this.
 */

/**
 * Where Next parks the pre-patch fetch. `createPatchedFetcher` hangs three properties off the
 * replacement it installs — `__nextPatched`, `__nextGetStaticStore` and `_nextOriginalFetch` —
 * and its own comment says the block is there for external consumers, which is us.
 *
 * Typed structurally rather than imported: it is not part of Next's public API surface, and
 * importing the module to borrow a type would drag the server runtime into any test that
 * touches this file.
 */
interface MaybePatchedFetch {
  _nextOriginalFetch?: typeof fetch;
}

/** Exported for the test that guards the property name across Next upgrades. */
export function resolveProviderFetch(): typeof fetch {
  return (globalThis.fetch as typeof fetch & MaybePatchedFetch)._nextOriginalFetch ??
    globalThis.fetch;
}

/**
 * Drop-in replacement for `fetch` that never reaches Next's instrumentation.
 *
 * Declared as a function rather than as `const providerFetch = resolveProviderFetch()` so the
 * resolution happens on the call, per the module comment above. The indirection costs one
 * property read per provider request, against a 12s network timeout.
 */
export const providerFetch: typeof fetch = function providerFetch(input, init) {
  return resolveProviderFetch()(input, init);
};
