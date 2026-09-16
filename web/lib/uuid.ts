/**
 * UUID v7, time-ordered, per Data-Model §21.6.
 *
 * The 48-bit big-endian millisecond timestamp is what the Edge Functions validate for
 * recency (`assertRecentUuidV7` in `supabase/functions/_shared/uuid.ts`); the rest is
 * random. `crypto.getRandomValues` rather than `Math.random` because these ids are primary
 * keys and a collision is a lost message.
 *
 * SHARED, because it was written three times. `web/lib/trips/actions.ts`,
 * `web/app/(client)/trips/new/actions.ts` and §2.6's actions all need a client-minted id for
 * the same reason — supplying it is what makes a retry idempotent — and three copies of a
 * bit-twiddling function is three chances for one of them to set the version nibble wrong
 * and have every write rejected as malformed.
 *
 * One of those copies declined to share on the grounds that it "would put a `crypto` call in
 * a module both server actions and client components import". That does not bite:
 * `crypto.getRandomValues` is on `globalThis` in the browser, in Node and in the edge
 * runtime, and this module has no directive of its own, so it costs a client bundle thirty
 * lines and nothing else.
 */
export function uuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = 0x70 | (bytes[6] & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8] & 0x3f); // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
