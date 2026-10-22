/**
 * §3.10 Stage 3b: turn a device's notifications on or off (Screen Inventory §3.10.7, Data-Model
 * §12.6).
 *
 * `register` is the inbox card's "Turn on": the browser or the phone hands over
 * where it can be reached. Advisors only in 3b, and an archived advisor is refused, as every
 * agent write is (`requireAgentId`). The SQL keys the device on its address, so the same
 * browser registering again refreshes its row, and a browser someone else signed out of moves
 * to whoever signed in.
 *
 * `unregister` is sign-out. It needs only a signed-in caller, not an active advisor: an
 * archived advisor signing out must still be able to stop their own notifications. It removes
 * only the caller's own row for that address.
 *
 * Device addresses are identifiers. None is ever returned; the response is the outcome only.
 *
 * NO AUDIT ROWS, on the same footing as message templates: `push_device` holds no client data
 * and is not one of Rule 3's sensitive tables. The writes still come through here rather than
 * an RPC grant, because the SQL takes the caller's platform user id as trusted input.
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import { serviceClient } from "../_shared/db.ts";
import { readDeviceLabel, readFcmToken, readWebSubscription } from "../_shared/push.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function requireNewId(value: unknown): string {
  if (typeof value !== "string") throw badRequest("Send the device with its id.");
  try {
    assertRecentUuidV7(value);
  } catch {
    throw badRequest("That page is out of date. Reload it and try again.");
  }
  return value;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const payload = await readJson(req);

    switch (payload.op) {
      case "register": {
        const db = agentDb();
        await requireAgentId(ctx, db);
        const deviceId = requireNewId(payload.deviceId);

        const label = readDeviceLabel(payload.label) ?? undefined;
        let call;
        if (payload.platform === "web") {
          const sub = readWebSubscription(payload.subscription);
          call = db.rpc("push_register_device", {
            p_user_id: ctx.platformUserId,
            p_device_id: deviceId,
            p_platform: "web",
            p_web_endpoint: sub.endpoint,
            p_web_p256dh: sub.p256dh,
            p_web_auth: sub.auth,
            p_label: label,
          });
        } else if (payload.platform === "android") {
          call = db.rpc("push_register_device", {
            p_user_id: ctx.platformUserId,
            p_device_id: deviceId,
            p_platform: "android",
            p_fcm_token: readFcmToken(payload.fcmToken),
            p_label: label,
          });
        } else {
          // iOS arrives once Xcode is installed.
          throw badRequest("Send a platform of web or android.");
        }
        const { data, error } = await call;
        if (error?.message.includes("already in use")) {
          throw badRequest("That page is out of date. Reload it and try again.");
        }
        if (error) throw new Error(`push register failed: ${error.message}`);
        return json({ outcome: "registered", deviceId: data });
      }

      case "unregister": {
        // A browser names its endpoint; a phone its FCM token. Only the caller's own row goes.
        const endpoint = payload.endpoint;
        const fcmToken = payload.fcmToken;
        const bounded = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 4096;
        if (!bounded(endpoint) && !bounded(fcmToken)) {
          throw badRequest("Send the address to turn off.");
        }
        const { data, error } = await serviceClient().rpc("push_unregister_device", {
          p_user_id: ctx.platformUserId,
          ...(bounded(endpoint) ? { p_web_endpoint: endpoint as string } : {}),
          ...(bounded(fcmToken) ? { p_fcm_token: fcmToken as string } : {}),
        });
        if (error) throw new Error(`push unregister failed: ${error.message}`);
        return json({ outcome: data ? "unregistered" : "not_found" });
      }

      default:
        throw badRequest("Send an op of register or unregister.");
    }
  } catch (err) {
    return problem(err);
  }
});
