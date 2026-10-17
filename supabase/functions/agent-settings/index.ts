/**
 * §3.12 Agent Settings, PR 1: Profile (3.12.1) and Availability (3.12.2).
 * Rulings: docs/Screen-Inventory.md §3.12 (2026-10-17). Migration 20261025120000.
 *
 * ── ONE DOOR, SIX OPS ────────────────────────────────────────────────────────
 *
 *   update_profile       name, pronouns, phone, bio, social links (email stays read-only, Q7)
 *   set_avatar           a photo the browser already squared to 400×400, sent as base64
 *   remove_avatar        back to initials
 *   update_availability  time zone, working hours and reply time, saved together
 *   save_time_off        create a block, or edit one that has not started
 *   end_time_off         delete an upcoming block, or end a running one early ("I'm back")
 *
 * Every write is a service_role SQL function that writes its own `audit_event` row in the
 * same transaction, with {from, to} for each changed field. An unchanged save writes nothing
 * and audits nothing, and answers `unchanged`.
 *
 * ── THE PHOTO ────────────────────────────────────────────────────────────────
 *
 * The bucket is public (the photo goes into email, which has no session) and only the service
 * role writes it. The key is chosen here, `<agent id>/<new v7>.<ext>`, never by the caller,
 * and the profile stores the PATH (`/storage/v1/object/public/...`), which each surface puts
 * on its own public origin,
 * and the type comes from the file's own first bytes. Order: upload the new object, point the
 * profile at it (audited), THEN delete the old object. A failure before the profile moves
 * removes the new object again; a failed delete of the old one leaves an orphan, never a
 * profile pointing at nothing.
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7, isUuid, uuidV7 } from "../_shared/uuid.ts";
import { readJson, toStoragePath } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import {
  AVATAR_BUCKET,
  avatarKeyFromUrl,
  MAX_BIO,
  MAX_PRONOUNS,
  MAX_TIME_OFF_LABEL,
  readAvatar,
  readDisplayName,
  readOptionalText,
  readPhone,
  readResponseTime,
  readSocialLinks,
  readTimeOffDates,
  readTimeZone,
  readWeeklySchedule,
} from "../_shared/agentSettings.ts";

const OPS = [
  "update_profile",
  "set_avatar",
  "remove_avatar",
  "update_availability",
  "save_time_off",
  "end_time_off",
] as const;
type Op = (typeof OPS)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function scalar(data: unknown): string | null {
  return typeof data === "string" ? data : null;
}

/** save_time_off's outcome as a response, or the sentence the advisor sees. */
function timeOffSaved(outcome: string | null, id: string): Response {
  switch (outcome) {
    case "created":
    case "updated":
    case "unchanged":
      return json({ outcome, timeOffId: id });
    case "overlap":
      throw conflict("Those dates overlap time away you've already set. Pick different days.");
    case "starts_in_past":
      throw badRequest("Time away can start today or later.");
    case "started":
      throw conflict("This time away has already started. You can end it early instead.");
    case "bad_dates":
      throw badRequest("The last day away can't be before the first.");
    default:
      throw notFound("That time away isn't on your calendar.");
  }
}

function timeOffEnded(outcome: string | null): Response {
  switch (outcome) {
    case "deleted":
    case "ended":
      return json({ outcome });
    case "past":
      throw conflict("That time away is already over.");
    default:
      throw notFound("That time away isn't on your calendar.");
  }
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

    const op = payload.op;
    if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) {
      throw badRequest("That request wasn't one we recognize. Reload the page and try again.");
    }

    const audit = {
      p_audit_id: uuidV7(),
      p_actor_user_id: ctx.platformUserId,
      p_ip: ctx.ip,
      p_user_agent: ctx.userAgent,
    };

    switch (op as Op) {
      case "update_profile": {
        const { data, error } = await db.rpc("agent_settings_update_profile", {
          p_agent_id: agentId,
          p_display_name: readDisplayName(payload.displayName),
          p_pronouns: readOptionalText(payload.pronouns, MAX_PRONOUNS, "Pronouns"),
          p_phone: readPhone(payload.phone),
          p_bio: readOptionalText(payload.bio, MAX_BIO, "Bio"),
          p_social_links: readSocialLinks(payload.socialLinks),
          ...audit,
        } as never);
        if (error) throw new Error(`profile update failed: ${error.message}`);
        const outcome = scalar(data);
        if (outcome === "not_found" || !outcome) throw notFound("We couldn't find your advisor profile.");
        return json({ outcome });
      }

      case "set_avatar": {
        const img = readAvatar(payload.image);
        const key = `${agentId}/${uuidV7()}.${img.ext}`;
        const bucket = db.storage.from(AVATAR_BUCKET);

        const { error: upError } = await bucket.upload(key, img.bytes, {
          contentType: img.contentType,
          // A year: the key is new for every photo, so a cached copy can never be stale.
          cacheControl: "31536000",
          upsert: false,
        });
        if (upError) throw new Error(`avatar upload failed: ${upError.message}`);

        // A path, never the absolute URL: see the migration's note on agent_settings_set_avatar.
        const avatarPath = toStoragePath(bucket.getPublicUrl(key).data.publicUrl);
        const { data, error } = await db.rpc("agent_settings_set_avatar", {
          p_agent_id: agentId,
          p_avatar_url: avatarPath,
          ...audit,
        } as never);
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row || row.outcome === "not_found") {
          await bucket.remove([key]);
          if (error) throw new Error(`avatar update failed: ${error.message}`);
          throw notFound("We couldn't find your advisor profile.");
        }
        const oldKey = avatarKeyFromUrl(row.previous_url ?? null, agentId);
        if (oldKey && oldKey !== key) await bucket.remove([oldKey]);
        return json({ outcome: row.outcome, avatarPath });
      }

      case "remove_avatar": {
        const { data, error } = await db.rpc("agent_settings_set_avatar", {
          p_agent_id: agentId,
          p_avatar_url: null,
          ...audit,
        } as never);
        if (error) throw new Error(`avatar removal failed: ${error.message}`);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || row.outcome === "not_found") throw notFound("We couldn't find your advisor profile.");
        const oldKey = avatarKeyFromUrl(row.previous_url ?? null, agentId);
        if (oldKey) await db.storage.from(AVATAR_BUCKET).remove([oldKey]);
        return json({ outcome: row.outcome });
      }

      case "update_availability": {
        const { data, error } = await db.rpc("agent_settings_update_availability", {
          p_agent_id: agentId,
          p_time_zone: readTimeZone(payload.timeZone),
          p_weekly_schedule: readWeeklySchedule(payload.weeklySchedule),
          p_response_time_hours: readResponseTime(payload.responseTimeHours),
          ...audit,
        } as never);
        if (error) throw new Error(`availability update failed: ${error.message}`);
        const outcome = scalar(data);
        if (outcome === "not_found" || !outcome) throw notFound("We couldn't find your advisor profile.");
        return json({ outcome });
      }

      case "save_time_off": {
        const id = payload.timeOffId;
        if (!isUuid(id)) throw badRequest("That time away didn't come through. Reload the page and try again.");
        const isNew = payload.isNew === true;
        if (isNew) {
          try {
            assertRecentUuidV7(id);
          } catch {
            throw badRequest("This page is a little out of date. Reload and try again.");
          }
        }
        const { startsOn, endsOn } = readTimeOffDates(payload.startsOn, payload.endsOn);
        const { data, error } = await db.rpc("agent_settings_save_time_off", {
          p_id: id,
          p_agent_id: agentId,
          p_is_new: isNew,
          p_starts_on: startsOn,
          p_ends_on: endsOn,
          p_label: readOptionalText(payload.label, MAX_TIME_OFF_LABEL, "The label"),
          ...audit,
        } as never);
        if (error) throw new Error(`time off save failed: ${error.message}`);
        return timeOffSaved(scalar(data), id);
      }

      case "end_time_off": {
        const id = payload.timeOffId;
        if (!isUuid(id)) throw badRequest("That time away didn't come through. Reload the page and try again.");
        const { data, error } = await db.rpc("agent_settings_end_time_off", {
          p_id: id,
          p_agent_id: agentId,
          ...audit,
        } as never);
        if (error) throw new Error(`time off end failed: ${error.message}`);
        return timeOffEnded(scalar(data));
      }
    }
  } catch (err) {
    return problem(err);
  }
});
