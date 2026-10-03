/**
 * Join class names, dropping falsy entries.
 *
 * Deliberately not clsx/tailwind-merge: styling is MUI sx now, and the few plain CSS
 * classes left (scheme gates, print hooks) never conflict, so there is nothing to
 * merge-resolve.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
