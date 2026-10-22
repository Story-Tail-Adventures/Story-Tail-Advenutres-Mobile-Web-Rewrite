/**
 * "Message Gyasi" without an account: the public form (Screen Inventory 2.0.12). P2.
 * Rulings: docs/BRD.md §6.5 (2026-10-21), Data-Model §11.
 *
 * Roles: anybody. NO SIGN-IN: verify_jwt is OFF (config.toml), because the whole point is a
 * visitor who will not make an account. Gyasi's rule: whoever asks for a quote is a client;
 * whoever only messages him is a lead, and this is where a lead is made.
 *
 * WHAT A SEND GOES THROUGH, IN ORDER:
 *   1. The two checks that store nothing (`_shared/lead.ts`): a filled hidden field, or a
 *      send under three seconds after the form was drawn. Answered like a success.
 *   2. The fields (a 400 a person can read). A card number in the message is REFUSED, not
 *      masked: CLAUDE.md rule 1, Data-Model §18.1a.
 *   3. `lead_submit` (service role): five sends an hour per network address (429), then a new
 *      lead, a message joining this email's open lead, or "Already a client".
 *
 * THE ANSWER NEVER SAYS WHICH OF THOSE HAPPENED. created / added / already_client all return
 * the same `{ ok: true }`, so the form cannot be used to learn whether an address belongs to a
 * client. The lead's id is never returned either.
 *
 * NO EMAIL GOES TO THE VISITOR (ruling 3): a form that mails whatever address is typed into it
 * is a way to send mail to strangers. The advisor is alerted inside `lead_submit`.
 *
 * NOT AUDITED: there is no actor to name, and the lead row is its own record. The advisor's
 * actions on it are audited (`agent-lead`). Nothing here is logged but the outcome.
 */
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/db.ts";
import { clientAddress, looksAutomated, parseLeadForm } from "../_shared/lead.ts";
import { badRequest, HttpError, problem } from "../_shared/problem.ts";
import { readJson } from "../_shared/trip.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const payload = await readJson(req);

    if (looksAutomated(payload, Date.now())) {
      console.log("[lead-message] dropped as automated");
      return json({ ok: true });
    }

    const input = parseLeadForm(payload);
    const ip = clientAddress(req.headers, Deno.env.get("LEAD_FORM_KEY") ?? null);

    const { data, error } = await serviceClient().rpc("lead_submit", {
      // THE GENERATED TYPES LIE ABOUT NULLABILITY ON ARGS (see agent-client-notes): every
      // optional field below goes to Postgres as NULL when the visitor left it empty.
      p_ip: ip as string,
      p_first_name: input.firstName,
      p_last_name: input.lastName as string,
      p_email: input.email,
      p_phone: input.phone as string,
      p_body: input.message,
      p_page: input.page as string,
      p_about_kind: input.aboutKind as string,
      p_about_slug: input.aboutSlug as string,
      p_about_label: input.aboutLabel as string,
      p_utm_source: input.utmSource as string,
      p_utm_medium: input.utmMedium as string,
      p_utm_campaign: input.utmCampaign as string,
    });
    if (error) throw new Error(`lead_submit failed: ${error.code ?? ""} ${error.message}`);

    const outcome = (Array.isArray(data) ? data[0] : data)?.outcome as string | undefined;
    console.log("[lead-message]", { outcome });

    if (outcome === "throttled") {
      throw new HttpError(429, "Too Many Requests", "Please try again a little later.");
    }
    if (outcome === "no_advisor") {
      // Several active advisors (P3 routing) or none. Ours to fix, not the visitor's.
      throw new HttpError(503, "Service Unavailable", "Messages can't be sent just now. Please try again later.");
    }
    if (outcome !== "created" && outcome !== "added" && outcome !== "already_client") {
      throw new Error(`unhandled lead_submit outcome: ${outcome}`);
    }
    return json({ ok: true });
  } catch (err) {
    return problem(err);
  }
});
