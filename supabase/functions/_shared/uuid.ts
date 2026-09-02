/**
 * UUID v7 — time-ordered identifiers. CLAUDE.md rule 6, docs/Data-Model.md §21.6.
 *
 * v7 puts a 48-bit millisecond timestamp in the high bits, so IDs sort by creation time
 * and B-tree inserts stay at the right edge of the index instead of scattering. v4 does
 * not, which is why `crypto.randomUUID()` is the wrong tool here.
 *
 * Layout (RFC 9562):
 *   0-5   48-bit big-endian milliseconds since the Unix epoch
 *   6     version nibble (7) + 4 bits of randomness
 *   7     8 bits of randomness
 *   8     variant bits (10) + 6 bits of randomness
 *   9-15  56 bits of randomness
 */

const HEX: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

export function uuidV7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = BigInt(now);
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const h = (i: number) => HEX[bytes[i]];
  return (
    `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-` +
    `${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(id: string): boolean {
  return UUID_RE.test(id);
}

/** Milliseconds since the epoch embedded in a v7 UUID. */
export function uuidV7Timestamp(id: string): number {
  const hex = id.replace(/-/g, "").slice(0, 12);
  return Number(BigInt(`0x${hex}`));
}

/**
 * Reject a client-supplied ID whose embedded timestamp is implausible.
 *
 * Data-Model §21.6: clients generate IDs offline so trips can be built without a
 * connection, and the backend validates the timestamp is recent. This is a sanity check
 * against clock skew and replayed IDs, not a security control — a caller can always
 * forge a fresh timestamp. The real defence is RLS plus the audit trail.
 *
 * The window is generous in both directions: a device with a slow clock is a support
 * ticket, not an attack.
 */
export function assertRecentUuidV7(
  id: string,
  // One hour, per Data-Model §21.6 ("within the last hour"). An earlier draft used 24h,
  // which quietly widened the documented window.
  maxAgeMs = 60 * 60 * 1000,
  maxSkewMs = 60 * 60 * 1000,
): void {
  if (!isUuidV7(id)) {
    throw new Error(`Not a UUID v7: ${id}`);
  }
  const delta = Date.now() - uuidV7Timestamp(id);
  if (delta > maxAgeMs) {
    throw new Error(`UUID v7 timestamp is more than ${maxAgeMs}ms old`);
  }
  if (delta < -maxSkewMs) {
    throw new Error(`UUID v7 timestamp is more than ${maxSkewMs}ms in the future`);
  }
}
