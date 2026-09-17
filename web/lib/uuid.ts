/**
 * Client-side id minting, shared.
 *
 * This lived privately in `web/lib/trips/actions.ts` until hotel search moved out of the
 * Edge Function and into `web/lib/hotels/`, which mints ids for its own ledger rows. Two
 * copies of a primary-key generator is the kind of duplication that stays correct right up
 * until somebody fixes a bug in one of them, so it is one module now.
 *
 * NOTHING ELSE BELONGS IN HERE. It is deliberately dependency-free and side-effect-free so
 * that a client component, a Server Action and a server-only module can all import it
 * without dragging anything along — `crypto.getRandomValues` is the one thing it touches and
 * it exists in every runtime we target (browser, Node, the Next server).
 */

/**
 * UUID v7, time-ordered, per Data-Model §21.6.
 *
 * The 48-bit big-endian millisecond timestamp is what the functions validate for recency;
 * the rest is random. `crypto.getRandomValues` rather than `Math.random` because these ids
 * are primary keys and a collision is a lost message.
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
