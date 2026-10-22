/**
 * §3.10 Stage 4: "Stop emailing me about messages" (Data-Model §12.9, §12.5).
 *
 * NO SIGN-IN. The token in the link is the credential: 128 random bits, stored only as a hash,
 * good for one person's one switch. verify_jwt is OFF (config.toml) because mail apps that honour
 * RFC 8058 POST here with no Authorization header.
 *
 *   GET  ?t=<token>                       → { status: "on" | "off" | "invalid" }. Changes NOTHING,
 *                                           so a mail scanner that follows links unsubscribes no one.
 *   POST ?t=<token>  List-Unsubscribe=One-Click   (RFC 8058, from Gmail, Yahoo, Apple Mail)
 *                                         → off.
 *   POST { token, on: boolean }           → the web app's page (/email/unsubscribe): off, or back on.
 *
 * Only `channels.messages.email` changes; push and in-app are untouched. Each change is audited
 * in `email_set_messages_email`.
 */
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import { isToken, tokenHashParam } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const url = new URL(req.url);
    const db = serviceClient();

    if (req.method === "GET") {
      const token = url.searchParams.get("t");
      if (!isToken(token)) return json({ status: "invalid" });
      const { data, error } = await db.rpc("email_unsubscribe_status", {
        p_token_hash: await tokenHashParam(token),
      });
      if (error) throw new Error(`status read failed: ${error.message}`);
      return json({ status: data });
    }

    if (req.method !== "POST") throw badRequest("Use GET or POST.");

    let token: unknown = url.searchParams.get("t");
    let on = false;
    const type = req.headers.get("content-type") ?? "";
    const raw = (await req.text()).slice(0, 2_000);
    if (type.includes("application/json")) {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        throw badRequest("Send JSON.");
      }
      token = body.token ?? token;
      if (typeof body.on !== "boolean") throw badRequest("Say on: true or false.");
      on = body.on;
    } else if (!/List-Unsubscribe=One-Click/.test(raw)) {
      // RFC 8058's one-click body is the only form POST this answers.
      throw badRequest("Use the link in the email.");
    }

    if (!isToken(token)) return json({ status: "invalid" });
    const { data, error } = await db.rpc("email_set_messages_email", {
      p_token_hash: await tokenHashParam(token),
      p_on: on,
    });
    if (error) throw new Error(`update failed: ${error.message}`);
    return json({ status: data });
  } catch (err) {
    return problem(err);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
  });
}
