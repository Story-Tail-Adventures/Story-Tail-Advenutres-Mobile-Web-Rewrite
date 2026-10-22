/**
 * §3.10 Stage 3b: send what the queue says is due (Screen Inventory §3.10.7, Data-Model §12.7).
 *
 * NO HUMAN CALLER. pg_cron runs `push_dispatch_tick()` every minute; when there is work it
 * posts here with the service-role key, exactly as the cruise sync is driven. Any user token is
 * 403 (`requireServiceRole`).
 *
 * One pass:
 *   1. Claim what is due (`push_claim_due`, SKIP LOCKED, so two overlapping ticks never send
 *      the same row twice). The SQL already cleared any thread read in the meantime.
 *   2. Per advisor: each live row is its own notification; everything that waited through rest
 *      hours goes out as ONE summary (ruling 6).
 *   3. Each row is finished: sent, or back to pending for a retry (three tries, then failed).
 *   4. Devices the push service reports gone (404 / 410) are forgotten.
 *   5. Threads read after their notification went get a silent dismiss on every PHONE. Not
 *      browsers: a push that shows nothing makes Chrome draw its own "updated in the
 *      background" notice, and Safari can revoke a subscription that does it repeatedly. A web
 *      notification the advisor already answered elsewhere is theirs to swipe.
 *
 * A pass returns 200 with what it did. No keys at all is a 500 BEFORE anything is
 * claimed, so a misconfigured project leaves rows pending rather than burning their retries.
 * Android goes through FCM (`_shared/fcm.ts`) with no words in the payload; iOS is skipped.
 */
import { requireServiceRole } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { forbidden, problem } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import {
  type ClaimedRow,
  deliver,
  type DeviceSender,
  dismissPayload,
  groupByAgent,
  planForAgent,
  type PushDevice,
} from "../_shared/push.ts";
import { vapidFromEnv, webPushSender } from "../_shared/webPush.ts";
import { fcmSender, serviceAccountFromEnv } from "../_shared/fcm.ts";

const BATCH = 50;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") return problem(forbidden("Use POST to run the dispatcher."));
    requireServiceRole(req, "The notification dispatcher");

    // One sender per platform, each only if its keys are set. With neither there is nothing to
    // do, and this refuses BEFORE claiming, so rows wait as pending rather than burning tries.
    // A platform without keys answers "error" for its devices: a row whose advisor has only
    // that kind of device retries and then fails, visibly, rather than being marked sent.
    const vapid = vapidFromEnv();
    const sa = serviceAccountFromEnv();
    if (!vapid && !sa) {
      throw new Error(
        "Set VAPID_* (web) and/or FCM_SERVICE_ACCOUNT_JSON (Android). See supabase/README.md.",
      );
    }
    const senders: Partial<Record<PushDevice["platform"], DeviceSender>> = {
      ...(vapid ? { web: webPushSender(vapid) } : {}),
      ...(sa ? { android: fcmSender(sa) } : {}),
    };
    const send: DeviceSender = (d, p) => {
      // §3.12.3: Android shows a trip request since §3.12 PR 4; iOS is not built yet. Skipped,
      // not failed, so an iPhone-only advisor's row is not retried for it.
      // A lead's message (§3.8) likewise.
      if ((p.kind === "quote_request" || p.kind === "lead_message") && d.platform === "ios") {
        return Promise.resolve("skipped");
      }
      const sender = senders[d.platform];
      if (sender) return sender(d, p);
      // iOS is not built yet; a missing key is a misconfiguration worth seeing.
      return Promise.resolve(d.platform === "ios" ? "skipped" : "error");
    };

    const db = serviceClient();
    const now = new Date();
    const devicesOf = new Map<string, PushDevice[]>();
    const loadDevices = async (agentId: string): Promise<PushDevice[]> => {
      const known = devicesOf.get(agentId);
      if (known) return known;
      const { data, error } = await db.rpc("push_devices_for_agent", { p_agent_id: agentId });
      if (error) throw new Error(`device lookup failed: ${error.message}`);
      const list = (data ?? []) as PushDevice[];
      devicesOf.set(agentId, list);
      return list;
    };
    const gone = new Set<string>();

    // 5 (run FIRST). Dismissals, phones only (see above). Before the new messages, so a dismiss
    // for a thread can never follow, and cancel, a fresh notification for it in the same pass.
    // Best effort: a missed one is a notification to swipe.
    const { data: owed, error: dismissError } = await db.rpc("push_claim_dismissals", { p_limit: BATCH });
    if (dismissError) throw new Error(`dismiss claim failed: ${dismissError.message}`);
    let dismissed = 0;
    for (const d of (owed ?? []) as { agent_id: string; conversation_id: string; read_up_to: string | null }[]) {
      const devices = await loadDevices(d.agent_id);
      const result = await deliver(
        devices.filter((x) => x.platform !== "web" && !gone.has(x.device_id)),
        dismissPayload(d.conversation_id, d.read_up_to),
        send,
      );
      result.goneDeviceIds.forEach((id) => gone.add(id));
      dismissed += 1;
    }

    // 1–3. Due notifications.
    const { data: claimed, error: claimError } = await db.rpc("push_claim_due", { p_limit: BATCH });
    if (claimError) throw new Error(`claim failed: ${claimError.message}`);

    let sent = 0;
    let retried = 0;
    const finish = async (outboxId: string, ok: boolean) => {
      const { error } = await db.rpc("push_finish", { p_outbox_id: outboxId, p_ok: ok });
      if (error) throw new Error(`finish failed: ${error.message}`);
      if (ok) sent += 1;
      else retried += 1;
    };
    // One advisor's trouble (a device lookup that fails, say) is theirs alone: their unfinished
    // rows go back for a retry and the next advisor is still served, rather than the whole pass
    // dying with every claimed row stuck 'sending'.
    for (const [agentId, rows] of groupByAgent((claimed ?? []) as ClaimedRow[])) {
      const unfinished = new Set(rows.map((r) => r.outbox_id));
      try {
        const devices = await loadDevices(agentId);
        for (const s of planForAgent(rows, now)) {
          const result = await deliver(devices.filter((d) => !gone.has(d.device_id)), s.payload, send);
          result.goneDeviceIds.forEach((id) => gone.add(id));
          for (const outboxId of s.outboxIds) {
            await finish(outboxId, result.ok);
            unfinished.delete(outboxId);
          }
        }
      } catch (err) {
        console.error("push-dispatch: advisor batch failed", err instanceof Error ? err.message : err);
        for (const outboxId of unfinished) {
          await finish(outboxId, false).catch(() => undefined);
        }
      }
    }

    // 4. Forget dead devices.
    for (const id of gone) {
      const { error } = await db.rpc("push_device_gone", { p_device_id: id });
      if (error) throw new Error(`device cleanup failed: ${error.message}`);
    }

    return new Response(JSON.stringify({ sent, retried, dismissed, gone: gone.size }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});
