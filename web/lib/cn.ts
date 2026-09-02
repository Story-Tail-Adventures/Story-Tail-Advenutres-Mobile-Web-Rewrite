/**
 * Join class names, dropping falsy entries.
 *
 * Deliberately not clsx/tailwind-merge: the component layer in
 * web/styles/components.css does the heavy lifting, and Tailwind utilities already
 * beat it on specificity via @layer, so there is nothing to merge-resolve.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
