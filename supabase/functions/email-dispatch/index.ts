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
  buildEmail,
  type ClaimedEmail,
  classifySmtpError,
  emailConfigFromEnv,
  newToken,
  tokenHashParam,
} from "../_shared/email.ts";
import { smtpTransport } from "../_shared/smtp.ts";

const BATCH = 25;

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

    try {
      for (const row of (claimed ?? []) as ClaimedEmail[]) {
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

          let built;
          try {
            built = buildEmail(row, tokens, cfg);
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
    } finally {
      transport.close();
    }

    return new Response(JSON.stringify({ sent, retried, failed }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});
