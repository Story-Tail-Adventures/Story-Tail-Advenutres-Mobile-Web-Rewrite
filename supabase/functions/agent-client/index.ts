/**
 * Create, edit and archive a client. Screens 3.3.9, 3.3.10 and 3.3.12.
 *
 * ONE FUNCTION, THREE OPS, matching `agent-client-notes`. Three functions would be three
 * copies of `requireUser` → `requireAgentId` → rpc → audit, differing only in a string, and
 * three blocks in `config.toml` to forget one of.
 *
 * ── ONLY `stale` IS A 409 ──────────────────────────────────────────────────────
 *
 * `EdgeCallResult` carries exactly one typed failure signal — `conflict`, read off the 409 —
 * and `lib/supabase/edge.ts` is emphatic that a caller must never recover a second one by
 * substring-matching an English sentence. So the optimistic-lock failure keeps the 409 and
 * every other answer this endpoint gives comes back 200 with an `outcome`, which is already
 * the house shape: `agent-trip-notes` answers a no-op with 200 and `changed: false`.
 *
 * That also lets `duplicate_email` carry the EXISTING client's id, so the form can offer a
 * link to the record the advisor already has rather than just refusing. A 4xx could not —
 * the transport surfaces only `detail` on a rejection.
 *
 * ── WHAT GOES IN THE AUDIT ROW ─────────────────────────────────────────────────
 *
 * An update audits the NAMES of the fields that moved and none of their values —
 * `agent_update_client` returns them for exactly this, and `onboarding-connect`'s rescue
 * path set the precedent. A client record is PII and an `audit_event` is retained seven
 * years; "phone changed" is the fact worth keeping and the number itself is already on the
 * row.
 *
 * The archive REASON is the exception, and it is stored deliberately. `client` has no column
 * for it, the advisor wrote it to explain a decision, and "why was this record archived" is
 * the question an audit trail exists to answer. Without a home here it would be lost.
 *
 * A BULK TAG OWES ONE AUDIT ROW PER CLIENT, not one row with a count. "Which records did
 * this touch" is the question the trail answers, and a count cannot answer it. They go in
 * one statement via `writeAuditEvents` so twenty-five rows cannot half-land.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent, writeAuditEvents } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId, requireExpectedVersion } from "../_shared/agent.ts";

const OPS = ["create", "update", "archive", "bulk_tag"] as const;
type Op = (typeof OPS)[number];

const MAX_NAME = 120;
const MAX_TAG = 40;
const MAX_TAGS = 20;
const MAX_NOTES = 4000;
const MAX_REASON = 500;
const MAX_DATES = 12;
// The SQL function refuses more than this too, and says so there. Checked here as well so
// an oversized request is answered in English rather than as a 500 off a RAISE.
const MAX_BULK = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function str(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const trimmed = value.trim();
  if (required && trimmed === "") throw badRequest(`${field} is required.`);
  if (trimmed.length > max) throw badRequest(`${field} is too long.`);
  return trimmed === "" ? null : trimmed;
}

/** ISO `yyyy-mm-dd`, or null. Postgres would reject anything else — this says so in English. */
function isoDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} must be a date.`);
  }
  return value;
}

function tags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest("Tags must be a list.");
  if (value.length > MAX_TAGS) throw badRequest("That is too many tags.");
  const cleaned = value
    .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
    .filter((t) => t !== "");
  for (const t of cleaned) if (t.length > MAX_TAG) throw badRequest("That tag is too long.");
  // Deduplicated here rather than in SQL: `client.tags` is a plain text[] with no unique
  // constraint, and a list showing "vip" twice is the kind of thing nobody notices until a
  // filter count disagrees with the chips beside it.
  return [...new Set(cleaned)];
}

/**
 * `important_dates` is jsonb with NO schema in Postgres, so the shape is enforced here or
 * nowhere. Data-Model §6.1 defines it as `{label, date, recurring}` — and notably NOT the
 * "surprise flag" the design prototype draws, which has never existed.
 */
function importantDates(value: unknown): { label: string; date: string; recurring: boolean }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest("Important dates must be a list.");
  if (value.length > MAX_DATES) throw badRequest("That is too many dates.");

  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw badRequest("That date is not readable.");
    const entry = raw as Record<string, unknown>;
    const label = str(entry.label, "Date label", 60, true) as string;
    const date = isoDate(entry.date, "Date");
    if (!date) throw badRequest(`"${label}" needs a date.`);
    return { label, date, recurring: entry.recurring === true };
  });
}

type ClientFields = {
  p_first_name: string;
  p_last_name: string;
  p_preferred_name: string | null;
  p_email: string;
  p_phone: string | null;
  p_date_of_birth: string | null;
  p_tags: string[];
  p_important_dates: { label: string; date: string; recurring: boolean }[];
  p_notes: string | null;
  p_line1: string | null;
  p_line2: string | null;
  p_city: string | null;
  p_region: string | null;
  p_postal_code: string | null;
  p_country: string | null;
};

function readClient(payload: Record<string, unknown>): ClientFields {
  const c = (payload.client ?? {}) as Record<string, unknown>;
  const address = (c.address ?? {}) as Record<string, unknown>;

  const email = str(c.email, "Email", 200, true) as string;
  // Deliberately loose. The authoritative check is whether mail reaches them, a stricter
  // pattern rejects addresses that are legal and real, and this field is typed by the
  // advisor about someone they have already spoken to.
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw badRequest("That does not look like an email address.");
  }

  const country = str(address.country, "Country", 2);

  return {
    p_first_name: str(c.firstName, "First name", MAX_NAME, true) as string,
    p_last_name: str(c.lastName, "Last name", MAX_NAME, true) as string,
    p_preferred_name: str(c.preferredName, "Preferred name", MAX_NAME),
    p_email: email,
    p_phone: str(c.phone, "Phone", 40),
    p_date_of_birth: isoDate(c.dateOfBirth, "Date of birth"),
    p_tags: tags(c.tags),
    p_important_dates: importantDates(c.importantDates),
    p_notes: str(c.notes, "Notes", MAX_NOTES),
    p_line1: str(address.line1, "Address", 200),
    p_line2: str(address.line2, "Address line 2", 200),
    p_city: str(address.city, "City", 120),
    p_region: str(address.region, "Region", 120),
    p_postal_code: str(address.postalCode, "Postal code", 20),
    p_country: country ? country.toUpperCase() : null,
  };
}

function requireOp(value: unknown): Op {
  if (typeof value !== "string" || !OPS.includes(value as Op)) {
    throw badRequest("op must be create, update, archive or bulk_tag.");
  }
  return value as Op;
}

function requireClientId(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) throw badRequest("That is not a client id.");
  return value;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const db = agentDb();
    const agentId = await requireAgentId(ctx, db);
    const payload = await readJson(req);
    const op = requireOp(payload.op);

    // ── 3.3.9 Create ──────────────────────────────────────────────────────
    if (op === "create") {
      const fields = readClient(payload);
      // v7, generated here. Data-Model §21.6: the callers that CAN hand the database a
      // time-ordered id do, and this one can.
      const clientId = uuidV7();

      const { data, error } = await db.rpc("agent_create_client", {
        p_agent_id: agentId,
        p_client_id: clientId,
        ...fields,
      } as never);
      if (error) throw new Error(`client create failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That advisor cannot create clients.");

      if (result.outcome === "duplicate_email") {
        // 200, not 4xx: the form needs the EXISTING id to offer a link, and the transport
        // surfaces only `detail` on a rejection. See the header.
        return json({
          outcome: "duplicate_email",
          existingClientId: result.client_id,
        });
      }

      await writeAuditEvent(ctx, {
        eventType: "client.created",
        targetEntity: "client",
        targetId: clientId,
        // No field values. See the header.
        metadata: { has_address: fields.p_line1 !== null, tag_count: fields.p_tags.length },
      });

      return json({ outcome: "created", clientId });
    }

    // ── 3.3.10 Edit ───────────────────────────────────────────────────────
    if (op === "update") {
      const clientId = requireClientId(payload.clientId);
      const expectedVersion = requireExpectedVersion(payload.expectedVersion);
      const fields = readClient(payload);

      const { data, error } = await db.rpc("agent_update_client", {
        p_client_id: clientId,
        p_agent_id: agentId,
        ...fields,
        p_expected_version: expectedVersion,
      } as never);
      if (error) throw new Error(`client update failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("No such client.");

      if (result.outcome === "stale") {
        throw conflict("This client changed since you opened it. Reload and try again.");
      }
      if (result.outcome === "duplicate_email") {
        return json({ outcome: "duplicate_email", version: result.version });
      }
      if (result.outcome === "noop") {
        return json({ outcome: "noop", clientId, version: result.version });
      }

      await writeAuditEvent(ctx, {
        eventType: "client.updated",
        targetEntity: "client",
        targetId: clientId,
        metadata: { fields: result.changed_fields ?? [], version: result.version },
      });

      return json({ outcome: "changed", clientId, version: result.version });
    }

    // ── 3.3.1 Bulk tag ────────────────────────────────────────────────────
    if (op === "bulk_tag") {
      if (!Array.isArray(payload.clientIds)) throw badRequest("clientIds must be a list.");
      if (payload.clientIds.length === 0) throw badRequest("Pick at least one client.");
      if (payload.clientIds.length > MAX_BULK) throw badRequest("That is too many clients.");
      const clientIds = payload.clientIds.map((id) => requireClientId(id));

      const tag = (str(payload.tag, "Tag", MAX_TAG, true) as string).toLowerCase();
      if (typeof payload.add !== "boolean") throw badRequest("add must be true or false.");

      const { data, error } = await db.rpc("agent_bulk_tag_clients", {
        p_client_ids: clientIds,
        p_agent_id: agentId,
        p_tag: tag,
        p_add: payload.add,
      });
      if (error) throw new Error(`bulk tag failed: ${error.message}`);

      // One row came back per client that ACTUALLY changed. The ones missing from it are a
      // mix of "not this advisor's", "already carried the tag" and "already at the tag cap",
      // deliberately indistinguishable — see the SQL function's header.
      const changed = (data ?? []) as { client_id: string; version: number }[];

      await writeAuditEvents(ctx, changed.map((row) => ({
        eventType: payload.add ? "client.tag_added" : "client.tag_removed",
        targetEntity: "client",
        targetId: row.client_id,
        // The tag IS the fact worth keeping here, and unlike a phone number it is the
        // advisor's own label rather than the client's data.
        metadata: { tag, version: row.version, bulk: true },
      })));

      return json({
        outcome: "tagged",
        tag,
        add: payload.add,
        changedCount: changed.length,
        requestedCount: clientIds.length,
      });
    }

    // ── 3.3.12 Archive / Restore ──────────────────────────────────────────
    const clientId = requireClientId(payload.clientId);
    const expectedVersion = requireExpectedVersion(payload.expectedVersion);
    if (typeof payload.archived !== "boolean") {
      throw badRequest("archived must be true or false.");
    }
    const reason = str(payload.reason, "Reason", MAX_REASON);

    const { data, error } = await db.rpc("agent_set_client_archived", {
      p_client_id: clientId,
      p_agent_id: agentId,
      p_archived: payload.archived,
      p_expected_version: expectedVersion,
    });
    if (error) throw new Error(`client archive failed: ${error.message}`);

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw notFound("No such client.");

    if (result.outcome === "stale") {
      throw conflict("This client changed since you opened it. Reload and try again.");
    }
    if (result.outcome === "noop") {
      return json({ outcome: "noop", clientId, version: result.version });
    }

    await writeAuditEvent(ctx, {
      eventType: result.outcome === "archived" ? "client.archived" : "client.restored",
      targetEntity: "client",
      targetId: clientId,
      // The reason IS stored — see the header. Only on an archive: a restore has none to give.
      metadata: reason && result.outcome === "archived"
        ? { reason, version: result.version }
        : { version: result.version },
    });

    return json({ outcome: result.outcome, clientId, version: result.version });
  } catch (err) {
    return problem(err);
  }
});
