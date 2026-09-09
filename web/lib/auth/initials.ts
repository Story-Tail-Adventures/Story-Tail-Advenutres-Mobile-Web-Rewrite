/**
 * The initials shown in an avatar, shared by the authenticated shell and the public top bar.
 *
 * It lives here rather than in either layout because the two surfaces must agree: the public
 * bar's avatar and the dashboard's are the same person's, and a visitor who sees `PS` on
 * /dashboard and `MS` on /explore reads that as the site not knowing who they are. Both
 * callers read the same `client` columns and hand them to this function.
 */

/**
 * Shown when the name columns yield nothing. Applied by the CALLER rather than returned from
 * `initialsFor`, because a traveler whose profile carries no name yet is a real state — the
 * onboarding gate only requires the wizard to be *finished*, and a skipped name step leaves
 * both columns at their placeholders.
 */
export const INITIALS_FALLBACK = "ST";

/**
 * What `handle_new_user()` writes when it provisions a row from an email or an OIDC identity
 * with no usable name (supabase/migrations/20260903190707_onboarding_schema.sql:203-204 and
 * 20260903221802_oauth_names.sql:72-84). They are placeholders, not names, so they must not
 * become initials — `NT` looks like a real person's monogram and is nobody's.
 *
 * Filtered per field, not as the pair: `('Jordan', 'Traveler')` is a real first name with a
 * placeholder surname and should still give `J`.
 */
const PLACEHOLDER_FIRST = "New";
const PLACEHOLDER_LAST = "Traveler";

function firstLetter(value: string | undefined | null, placeholder: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === placeholder) return "";
  return trimmed[0];
}

/**
 * Two letters, or one, or none.
 *
 * Callers pass `preferred_name ?? first_name` as `first`, so somebody who goes by Peggy gets
 * `P` rather than the `M` on their passport.
 */
export function initialsFor(first?: string | null, last?: string | null): string {
  return `${firstLetter(first, PLACEHOLDER_FIRST)}${firstLetter(last, PLACEHOLDER_LAST)}`.toUpperCase();
}
