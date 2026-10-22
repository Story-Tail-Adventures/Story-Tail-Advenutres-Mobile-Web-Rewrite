/**
 * §3.10 Stage 4: email the client what the queue says is due (Data-Model §12.8 / §12.9).
 *
 * NO HUMAN CALLER. pg_cron runs `email_dispatch_tick()` every minute; when a row is due it
 * posts here with the service-role key, as push-dispatch is driven. Any user token is 403.
 *
 * One pass:
 *   1. Claim what is due (`email_claim_due`, SKIP LOCKED). The SQL has already cleared threads
 *      read in the app and skipped opted-out, archived or unverified clients.
 *   2. Per row: mint the reply and unsubscribe tokens and save their hashes FIRST
 *      (`email_record_tokens`), so no email ever goes out with dead links; build the email
 *      (`_shared/email.ts`, card numbers masked); send it over IONOS SMTP.
 *   3. Finish each row: sent (stamping the "Emailed" mark), or back for a retry, or failed on a
 *      5xx (`email_finish`).
 *   4. §3.12: the advisor's signature goes under their words (`agent_signature_for_conversation`),
 *      and then the advisor's own alert emails are sent (`agent_alert_email_claim`, Data-Model
 *      §12.11): who and which trip, with a link, never the client's words.
 *
 * nodemailer 10.0.14, used exactly as docs/SMTP-Library-Security-Review.md §5 requires: port 465
 * with TLS checks on, no file or URL access, no pool, no logging (its logger prints whole
 * messages). Missing settings are a 500 BEFORE anything is claimed, so rows wait.
 */
import { requireServiceRole } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { forbidden, problem } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import {
  buildAlertEmail,
  buildEmail,
  type ClaimedAlert,
  type ClaimedEmail,
  classifySmtpError,
  emailConfigFromEnv,
  newToken,
  type SignatureSource,
  tokenHashParam,
} from "../_shared/email.ts";
import { smtpTransport } from "../_shared/smtp.ts";

const BATCH = 10;
/**
 * Stop starting new sends after this long. Rows left over go back to waiting with no try counted
 * (`email_release`), so a slow SMTP server can never make one run outlast the 15-minute stale
 * window and be re-claimed under itself (found in review: that would email a client twice).
 */
const TIME_BUDGET_MS = 90_000;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") return problem(forbidden("Use POST to run the email dispatcher."));
    requireServiceRole(req, "The email dispatcher");

    const cfg = emailConfigFromEnv((name) => Deno.env.get(name));
    if (!cfg) {
      throw new Error("Set EMAIL_SMTP_HOST and EMAIL_FROM_ADDRESS (and the rest). See supabase/README.md.");
    }

    const transport = smtpTransport(cfg);

    const db = serviceClient();
    const { data: claimed, error: claimError } = await db.rpc("email_claim_due", { p_limit: BATCH });
    if (claimError) throw new Error(`claim failed: ${claimError.message}`);

    let sent = 0;
    let alertsSent = 0;
    let retried = 0;
    let failed = 0;
    const finish = async (outboxId: string, ok: boolean, permanent = false, error: string | null = null) => {
      const { data, error: finishError } = await db.rpc("email_finish", {
        p_outbox_id: outboxId,
        p_ok: ok,
        p_permanent: permanent,
        p_error: error ?? undefined,
      });
      if (finishError) throw new Error(`finish failed: ${finishError.message}`);
      if (data === "sent") sent += 1;
      else if (data === "failed") failed += 1;
      else retried += 1;
    };

    const started = Date.now();
    let released = 0;
    try {
      for (const row of (claimed ?? []) as ClaimedEmail[]) {
        if (Date.now() - started > TIME_BUDGET_MS) {
          const { error: releaseError } = await db.rpc("email_release", { p_outbox_id: row.outbox_id });
          if (releaseError) console.error("email-dispatch: release failed", releaseError.message);
          released += 1;
          continue;
        }
        // One row's trouble is its own: it is finished as a failure and the next is still sent,
        // rather than the pass dying with every claimed row stuck 'sending'.
        try {
          const tokens = { reply: newToken(), unsubscribe: newToken() };
          const { error: tokenError } = await db.rpc("email_record_tokens", {
            p_outbox_id: row.outbox_id,
            p_reply_hash: await tokenHashParam(tokens.reply),
            p_unsub_hash: await tokenHashParam(tokens.unsubscribe),
          });
          if (tokenError) throw new Error(`token save failed: ${tokenError.message}`);

          // A failed signature read costs the email its signature, never the email: the advisor's
          // words still go, with the locked host-agency line.
          const { data: sigRows, error: sigError } = await db.rpc("agent_signature_for_conversation", {
            p_conversation_id: row.conversation_id,
          });
          if (sigError) console.error("email-dispatch: signature read failed", sigError.message);
          const signature = (Array.isArray(sigRows) ? sigRows[0] : sigRows) as SignatureSource | null ?? null;

          let built;
          try {
            built = buildEmail(row, tokens, cfg, signature);
          } catch (err) {
            // Nothing honest to send (a bad address, no replies left): retrying cannot help.
            await finish(row.outbox_id, false, true, (err as Error).message);
            continue;
          }

          try {
            const info = await transport.sendMail({ ...built, disableFileAccess: true, disableUrlAccess: true });
            const rejected = Array.isArray(info?.rejected) ? info.rejected.length : 0;
            if (rejected > 0) await finish(row.outbox_id, false, true, "550 recipient rejected");
            else await finish(row.outbox_id, true);
          } catch (err) {
            const { permanent, error } = classifySmtpError(err);
            await finish(row.outbox_id, false, permanent, error);
          }
        } catch (err) {
          console.error("email-dispatch: row failed", (err as Error)?.message ?? err);
          await finish(row.outbox_id, false, false, "internal error").catch(() => undefined);
        }
      }

      // §3.12.3: the advisor's alerts, in what is left of the time budget. Anything not reached
      // stays pending (it is only claimed when there is time to send it).
      if (Date.now() - started < TIME_BUDGET_MS) {
        const { data: alerts, error: alertError } = await db.rpc("agent_alert_email_claim", { p_limit: BATCH });
        if (alertError) throw new Error(`alert claim failed: ${alertError.message}`);
        for (const alert of (alerts ?? []) as ClaimedAlert[]) {
          // Out of time: back to waiting with no try counted, so a slow pass never outlasts
          // the 15-minute stale window and is claimed again under itself (a double send).
          if (Date.now() - started > TIME_BUDGET_MS) {
            const { error: releaseError } = await db.rpc("agent_alert_email_release", { p_alert_id: alert.alert_id });
            if (releaseError) console.error("email-dispatch: alert release failed", releaseError.message);
            released += 1;
            continue;
          }
          const done = async (ok: boolean, permanent = false, error: string | null = null) => {
            const { data, error: finishError } = await db.rpc("agent_alert_email_finish", {
              p_alert_id: alert.alert_id,
              p_ok: ok,
              p_permanent: permanent,
              p_error: error ?? undefined,
            });
            if (finishError) throw new Error(`alert finish failed: ${finishError.message}`);
            if (data === "sent") alertsSent += 1;
            else if (data === "failed") failed += 1;
            else retried += 1;
          };
          try {
            let built;
            try {
              built = buildAlertEmail(alert, cfg);
            } catch (err) {
              await done(false, true, (err as Error).message);
              continue;
            }
            try {
              const info = await transport.sendMail({ ...built, disableFileAccess: true, disableUrlAccess: true });
              const rejected = Array.isArray(info?.rejected) ? info.rejected.length : 0;
              if (rejected > 0) await done(false, true, "550 recipient rejected");
              else await done(true);
            } catch (err) {
              const { permanent, error } = classifySmtpError(err);
              await done(false, permanent, error);
            }
          } catch (err) {
            console.error("email-dispatch: alert failed", (err as Error)?.message ?? err);
            await done(false, false, "internal error").catch(() => undefined);
          }
        }
      }
    } finally {
      transport.close();
    }

    return new Response(JSON.stringify({ sent, alertsSent, retried, failed, released }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});
