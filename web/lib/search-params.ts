/**
 * Reading a single value out of Next's `searchParams`.
 *
 * Next hands repeated keys over as arrays, so `?next=a&next=b` arrives as a `string[]`.
 * Every page that types its params as `{ next?: string }` is telling a small lie about
 * that, and the shape it actually gets is the one an attacker controls.
 *
 * This existed three times over — on /join, /login and /register — before it was worth a
 * name.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** The first-and-only string, or undefined when the key repeats or is missing. */
export function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
