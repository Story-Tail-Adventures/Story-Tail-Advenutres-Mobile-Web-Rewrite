/**
 * Collect zod issues into `{ field: [messages] }`.
 *
 * zod v4 dropped `.flatten()`, and every form action needs the same shape back. This was
 * hand-rolled twice before it was worth naming — once in the login action, once in the
 * sign-up gate's schema — and the two had already started to diverge.
 *
 * Only issues whose first path segment is one of `fields` are kept, because a message
 * rendered next to the wrong input is worse than one not rendered at all.
 *
 * **What this DROPS, and what to do about it.** A refinement attached to the object as a
 * whole — `z.object({...}).superRefine(...)` without an explicit `path` — has an empty
 * path and is discarded here. That is the right call for a field-error map, but it is a
 * silent one: a group rule like "an address needs a city if it has a street" would refuse
 * the submit and render nothing, which reads as a dead button. Use [formLevelIssues] for
 * those, or give the refinement an explicit `path` so it lands on a field.
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

/**
 * The issues [flattenIssues] drops: the ones belonging to no field.
 *
 * These come from object-level refinements — rules about a COMBINATION of fields, where
 * pointing at any single input would be a lie. "Give us a city as well as a street" is
 * about the address, not about the city box.
 *
 * Returned separately rather than folded into the field map so a caller has to decide
 * where to put them. They belong above the form, next to `formError`.
 */
export function formLevelIssues<F extends string>(
  error: { issues: { path: PropertyKey[]; message: string }[] },
  fields: readonly F[],
): string[] {
  const messages: string[] = [];
  for (const issue of error.issues) {
    const key = issue.path[0];
    const belongsToField =
      typeof key === "string" && (fields as readonly string[]).includes(key);
    if (!belongsToField && !messages.includes(issue.message)) {
      messages.push(issue.message);
    }
  }
  return messages;
}
