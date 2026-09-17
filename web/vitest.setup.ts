import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

/**
 * Provider network guard — SerpApi must never be reachable from a test run.
 *
 * The hotel modules now live under `web/` and are exercised by vitest instead of
 * `deno test`. That move quietly removed a safety net nobody had to think about: the Deno
 * suite ran with no `--allow-net`, so a client constructed WITHOUT its `fetchImpl` injected
 * could not reach the network at all — the sandbox refused it. Vitest has no sandbox, so
 * the same forgotten injection would call the real `https://serpapi.com/search`, and on a
 * 250-searches-a-MONTH free tier a watch-mode loop is a meaningful amount of the budget
 * spent on a test that was supposed to be hermetic.
 *
 * Two parts, because one is not enough:
 *
 * 1. The wrapper throws, which stops the request before a socket opens.
 * 2. `afterEach` fails the test anyway, because throwing alone is NOT sufficient here.
 *    `lib/hotels/client.ts` wraps `await doFetch(...)` in a try/catch that turns any
 *    throw into a retryable `SerpApiError` — so a test asserting `rejects.toThrow(
 *    SerpApiError)` would go GREEN off the guard's own error, having hit the network three
 *    times on the way. Recording the attempt out-of-band and failing after the test body
 *    is the part that cannot be swallowed.
 *
 * Only serpapi.com is blocked. A blanket "no network in tests" rule belongs in a wider
 * change than this one; this guards the host that costs money per call.
 */
const PROVIDER_HOST = "serpapi.com";
const blockedCalls: string[] = [];

const realFetch: typeof fetch | undefined = globalThis.fetch;
if (typeof realFetch === "function") {
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    // `input` may be a string, a URL, or a Request — and `Request` is not defined in every
    // environment this setup file runs in, so duck-type rather than `instanceof`.
    const raw = typeof input === "string"
      ? input
      : input && typeof input === "object" && "url" in input
      ? String((input as { url: unknown }).url)
      : String(input);

    let host = "";
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      host = "";
    }

    if (host === PROVIDER_HOST || host.endsWith(`.${PROVIDER_HOST}`)) {
      // Deliberately NOT logging `raw`: the credential rides in the query string, and this
      // message lands in CI output.
      blockedCalls.push(host);
      throw new Error(
        `Blocked a real request to ${host} from a test. Inject \`fetchImpl\` (see ` +
          `lib/hotels/__fixtures__/provider.ts \`stubFetch\`) — a live call spends the ` +
          `250-a-month SerpApi quota.`,
      );
    }

    return realFetch(input, init);
  }) as typeof fetch;
}

afterEach(() => {
  if (blockedCalls.length === 0) return;
  const hosts = [...new Set(blockedCalls)].join(", ");
  const count = blockedCalls.length;
  blockedCalls.length = 0;
  throw new Error(
    `${count} blocked provider request(s) to ${hosts} during this test. The guard threw, ` +
      `but the code under test may have caught it — treat this as an un-stubbed fetch.`,
  );
});

/**
 * Popover API stubs.
 *
 * jsdom implements neither `showPopover` nor `hidePopover`. DateRangePicker feature-detects
 * on `showPopover` to decide whether to render the calendar or the native date inputs, so
 * WITHOUT these stubs every test renders the unenhanced path and the keyboard tests pass
 * while exercising nothing. A green suite that never ran the component is worse than a red
 * one, which is why this lives here rather than in one test file.
 *
 * The behaviour modelled is the part the component depends on: toggling visibility and
 * firing a `toggle` event carrying `newState`.
 *
 * GUARDED ON `HTMLElement` EXISTING, because setupFiles run for EVERY test file including
 * the ones marked `@vitest-environment node` — which have no DOM, so touching
 * HTMLElement.prototype there is a ReferenceError that fails the whole file before a single
 * test runs. Nothing in a node-environment test wants a popover anyway.
 */
if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover !== "function") {
  const fire = (el: HTMLElement, newState: "open" | "closed") => {
    const event = new Event("toggle") as Event & { newState?: string; oldState?: string };
    event.newState = newState;
    event.oldState = newState === "open" ? "closed" : "open";
    el.dispatchEvent(event);
  };

  HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
    this.removeAttribute("hidden");
    this.setAttribute("data-open", "");
    fire(this, "open");
  };

  HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
    this.removeAttribute("data-open");
    fire(this, "closed");
  };

  HTMLElement.prototype.togglePopover = function togglePopover(this: HTMLElement) {
    const open = this.hasAttribute("data-open");
    if (open) this.hidePopover();
    else this.showPopover();
    return !open;
  };
}
