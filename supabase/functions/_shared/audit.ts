/**
 * Audit trail — CLAUDE.md rule 3, docs/Data-Model.md §15 and §20.
 *
 * Every mutation to a sensitive table (payment_card, card_authorization, commission,
 * client) writes an audit_event capturing who did what to which record. This module is
 * the only sanctioned way to do that, so the shape stays consistent and nobody has to
 * remember the column names.
 */
import { serviceClient } from "./db.ts";
import { uuidV7 } from "./uuid.ts";
import type { AuthContext } from "./auth.ts";

export interface AuditSpec {
  /** Dotted, past-tense-ish: "payment_card.created", "commission.updated". */
  eventType: string;
  targetEntity: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  /**
   * When to write the row relative to the action.
   *
   * "after" (default) is right for ordinary mutations: if the write fails there is
   * nothing to audit.
   *
   * Note what "after" does NOT give you: atomicity. The mutation and the audit insert
   * are separate round trips, so if the audit write fails the mutation has already
   * landed and only the caller learns about it. That is surfaced (the request 500s)
   * rather than prevented. Closing it properly means moving both into one transaction —
   * a Postgres function called over RPC, or a trigger on the target table. Worth doing
   * before the first financial mutation ships; overkill for the current read-mostly
   * surface.
   *
   * "before" is required for the PAN reveal (Screen Inventory 3.6.4). The point of that
   * audit row is to record that a human asked to see a card number — if the process
   * dies mid-reveal, the request still has to be on the record. Auditing afterwards
   * would lose exactly the event most worth keeping.
   */
  when?: "before" | "after";
}

/**
 * Write an audit_event.
 *
 * Uses serviceClient because audit_event has RLS enabled and no insert policy — the
 * trail is deliberately not writable by any client role.
 *
 * Throws on failure, and callers must let it throw. A swallowed audit error produces
 * exactly the silent gap rule 3 exists to prevent: the mutation lands, the record of it
 * does not, and nobody finds out until an auditor asks.
 */
export async function writeAuditEvent(
  ctx: AuthContext,
  spec: AuditSpec,
): Promise<void> {
  const { error } = await serviceClient()
    .from("audit_event")
    .insert({
      id: uuidV7(),
      actor_user_id: ctx.platformUserId,
      actor_role: ctx.role,
      event_type: spec.eventType,
      target_entity: spec.targetEntity,
      target_id: spec.targetId,
      metadata: (spec.metadata ?? {}) as never,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    });

  if (error) {
    throw new Error(
      `Audit write failed for ${spec.eventType} on ${spec.targetEntity}/${spec.targetId}: ${error.message}`,
    );
  }
}

/**
 * Run a mutation with its audit row.
 *
 * ```ts
 * const updated = await withAudit(
 *   ctx,
 *   { eventType: "client.updated", targetEntity: "client", targetId: id },
 *   () => db.from("client").update(patch).eq("id", id).select().single(),
 * );
 * ```
 */
export async function withAudit<T>(
  ctx: AuthContext,
  spec: AuditSpec,
  fn: () => Promise<T>,
): Promise<T> {
  if (spec.when === "before") {
    await writeAuditEvent(ctx, spec);
    return await fn();
  }

  const result = await fn();
  await writeAuditEvent(ctx, spec);
  return result;
}
