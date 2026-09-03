/**
 * Collect zod issues into `{ field: [messages] }`.
 *
 * zod v4 dropped `.flatten()`, and every form action needs the same shape back. This was
 * hand-rolled twice before it was worth naming — once in the login action, once in the
 * sign-up gate's schema — and the two had already started to diverge.
 *
 * Only issues whose first path segment is one of `fields` are kept. That is deliberate:
 * a refinement attached to the object as a whole has an empty path, and silently dropping
 * it is better than inventing a field name for it — form-level errors travel as
 * `formError`, not as a field error nobody renders.
 */
export function flattenIssues<F extends string>(
  error: { issues: { path: PropertyKey[]; message: string }[] },
  fields: readonly F[],
): Partial<Record<F, string[]>> {
  const fieldErrors: Partial<Record<F, string[]>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    // Both casts are the same widening: `fields` is a literal-union tuple, and `includes`
    // will not accept an arbitrary string against one. The guard is what makes `key as F`
    // sound — it has just been checked to be a member.
    if (typeof key === "string" && (fields as readonly string[]).includes(key)) {
      (fieldErrors[key as F] ??= []).push(issue.message);
    }
  }
  return fieldErrors;
}
