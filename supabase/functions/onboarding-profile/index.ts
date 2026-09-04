/**
 * Screen 2.1.10 Profile Completion — the write path.
 *
 * See docs/Screen-Inventory.md §2.1.10 and
 * design/source-prototype/screens/client-auth.jsx `C2110_ProfileCompletion`. P1.
 *
 * WHY THIS IS AN EDGE FUNCTION AND NOT A CLIENT WRITE. `client` is a sensitive table under
 * CLAUDE.md rule 3: every mutation owes an `audit_event`. It also has SELECT-only RLS with
 * no write policy, which means a browser `.update()` would match zero rows and return 204 —
 * succeeding loudly while doing nothing. The same is true of `address` and
 * `travel_document`. So the write lives here, running as the service role, and the scoping
 * that RLS would have done is done explicitly by `requireClientId`.
 *
 * WHAT IT DELIBERATELY DOES NOT TAKE. The passport NUMBER. Data-Model §18.2 requires
 * column-level encryption with a backend-only key for `document_number_encrypted`, and
 * nothing implements that yet — there is no crypto helper in _shared/ and no key
 * management. Expiry and issuing country are what actually drive expiration reminders and
 * supplier verification, so those are collected and the number waits for the pass that
 * builds the encryption properly. Decision recorded September 2026.
 *
 * It also never takes a `client_id`. Accepting one would be an IDOR with a friendly name:
 * this runs as the service role, so RLS is not standing behind the mistake.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { withAudit } from "../_shared/audit.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import { uuidV7 } from "../_shared/uuid.ts";
import {
  advanceOnboarding,
  nextStep,
  onboardingDb,
  optionalCountry,
  optionalDate,
  optionalPhone,
  optionalText,
  readJson,
  requireClientId,
} from "../_shared/onboarding.ts";
import type { Db } from "../_shared/db.ts";
import type { Json, TablesUpdate } from "../_shared/database.types.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const body = await readJson(req);
    const db = onboardingDb();

    const phone = optionalPhone(body, "phone");
    const dateOfBirth = optionalDate(body, "dateOfBirth");
    const emergency = parseEmergencyContact(body);
    const address = parseAddress(body);
    const passport = parsePassport(body);

    // The whole screen is optional — every field of it. "Skip for now" posts an empty body,
    // and that still has to advance the wizard rather than 400.
    // Typed against the generated row rather than Record<string, unknown>: the client's
    // excess-property check rejects an open index signature, and typing it properly is
    // what stops a typo'd column name reaching Postgres as a silent no-op.
    const patch: TablesUpdate<"client"> = { updated_at: new Date().toISOString() };
    if (phone !== undefined) patch.phone = phone;
    if (dateOfBirth !== undefined) patch.date_of_birth = dateOfBirth;
    if (emergency !== undefined) patch.emergency_contact = emergency;

    if (address !== undefined) {
      patch.mailing_address_id = await saveAddress(db, clientId, address);
    }

    await withAudit(
      ctx,
      {
        eventType: "client.updated",
        targetEntity: "client",
        targetId: clientId,
        // The KEYS, never the values. An audit row saying somebody changed their date of
        // birth is the record; a copy of the date of birth in a table with a seven-year
        // retention is a second place PII lives.
        metadata: {
          source: "onboarding-profile",
          fields: Object.keys(patch).sort(),
        },
      },
      async () => {
        const { error } = await db.from("client").update(patch).eq("id", clientId);
        if (error) throw new Error(`client update failed: ${error.message}`);
      },
    );

    if (passport !== undefined) await savePassport(db, clientId, passport);

    if (body.advance === true) {
      await advanceOnboarding(db, ctx.platformUserId, nextStep("profile"));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});

/**
 * `{name, phone, relationship}`, all or nothing.
 *
 * A half-filled emergency contact is worse than none: a name with no number looks like
 * somebody can be reached when they cannot. Screen Inventory §2.1.10 lists all three
 * together, and the two that matter are enforced here rather than only in the form —
 * this endpoint is reachable without it.
 *
 * Returns `Json` rather than a named interface because the column is jsonb and the
 * generated `Json` type wants an index signature; the shape is
 * `{name, phone, relationship}` and is documented in Data-Model §6.1.
 */
function parseEmergencyContact(
  body: Record<string, unknown>,
): Json | null | undefined {
  if (!("emergencyContact" in body)) return undefined;
  const value = body.emergencyContact;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("emergencyContact must be an object or null.");
  }

  const contact = value as Record<string, unknown>;
  const name = optionalText(contact, "name") ?? null;
  const phone = optionalPhone(contact, "phone", "The emergency contact's phone") ?? null;
  const relationship = optionalText(contact, "relationship") ?? null;

  if (name === null && phone === null && relationship === null) return null;
  if (name === null || phone === null) {
    throw badRequest("An emergency contact needs both a name and a phone number.");
  }
  return { name, phone, relationship };
}

interface AddressInput {
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
}

/** `line1`, `city` and `country` are NOT NULL in the schema, so they are required together. */
function parseAddress(body: Record<string, unknown>): AddressInput | null | undefined {
  if (!("address" in body)) return undefined;
  const value = body.address;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("address must be an object or null.");
  }

  const input = value as Record<string, unknown>;
  const line1 = optionalText(input, "line1") ?? null;
  const city = optionalText(input, "city") ?? null;
  const country = optionalCountry(input, "country") ?? null;
  const line2 = optionalText(input, "line2") ?? null;
  const region = optionalText(input, "region") ?? null;
  const postalCode = optionalText(input, "postalCode") ?? null;

  const anything = [line1, city, country, line2, region, postalCode].some((v) => v !== null);
  if (!anything) return null;
  if (line1 === null || city === null || country === null) {
    throw badRequest("An address needs a street, a city and a country.");
  }
  return { line1, line2, city, region, postalCode, country };
}

/**
 * Update the address already linked, or create one and link it.
 *
 * @returns the id to store on `client.mailing_address_id`, or null when clearing.
 */
async function saveAddress(
  db: Db,
  clientId: string,
  address: AddressInput | null,
): Promise<string | null> {
  const { data: client, error: readError } = await db
    .from("client")
    .select("mailing_address_id")
    .eq("id", clientId)
    .single();
  if (readError) throw new Error(`client read failed: ${readError.message}`);

  const existingId = client.mailing_address_id;

  if (address === null) {
    // Unlink first, then remove the row — leaving it would keep an address nobody can
    // reach through the app but which still holds where somebody lives (§18.5). If
    // anything else has since referenced it, keep it rather than fail the whole save.
    if (existingId) {
      await db.from("client").update({ mailing_address_id: null }).eq("id", clientId);
      const { error } = await db.from("address").delete().eq("id", existingId);
      if (error && error.code !== "23503") {
        throw new Error(`address delete failed: ${error.message}`);
      }
    }
    return null;
  }

  const row = {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country,
    updated_at: new Date().toISOString(),
  };

  if (existingId) {
    const { error } = await db.from("address").update(row).eq("id", existingId);
    if (error) throw new Error(`address update failed: ${error.message}`);
    return existingId;
  }

  const id = uuidV7();
  const { error } = await db.from("address").insert({ id, ...row });
  if (error) throw new Error(`address insert failed: ${error.message}`);
  return id;
}

interface PassportInput {
  expiresOn: string | null;
  issuingCountry: string | null;
}

function parsePassport(body: Record<string, unknown>): PassportInput | null | undefined {
  if (!("passport" in body)) return undefined;
  const value = body.passport;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("passport must be an object or null.");
  }

  const input = value as Record<string, unknown>;
  // Refused loudly rather than ignored. A caller that sends a number needs to know it was
  // not stored, not discover later that it never was.
  if ("number" in input) {
    throw badRequest(
      "Passport numbers are not accepted yet — send only expiresOn and issuingCountry.",
    );
  }

  const expiresOn = optionalDate(input, "expiresOn") ?? null;
  const issuingCountry = optionalCountry(input, "issuingCountry") ?? null;
  if (expiresOn === null && issuingCountry === null) return null;
  return { expiresOn, issuingCountry };
}

/**
 * The traveler's own passport row: `kind = 'passport'` with no `companion_id`.
 *
 * `document_id` stays null — the scan arrives later from the mobile camera flow, which is
 * exactly why 20260903190707 made that column nullable.
 */
async function savePassport(
  db: Db,
  clientId: string,
  passport: PassportInput | null,
): Promise<void> {
  const { data: existing, error: readError } = await db
    .from("travel_document")
    .select("id")
    .eq("client_id", clientId)
    .eq("kind", "passport")
    .is("companion_id", null)
    .is("archived_at", null)
    .maybeSingle();
  if (readError) throw new Error(`travel_document read failed: ${readError.message}`);

  if (passport === null) {
    // Archived rather than deleted: a travel document is on the §20.1 soft-delete list.
    if (existing) {
      const { error } = await db
        .from("travel_document")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(`travel_document archive failed: ${error.message}`);
    }
    return;
  }

  const row = {
    expires_on: passport.expiresOn,
    issuing_country: passport.issuingCountry,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await db.from("travel_document").update(row).eq("id", existing.id);
    if (error) throw new Error(`travel_document update failed: ${error.message}`);
    return;
  }

  const { error } = await db.from("travel_document").insert({
    id: uuidV7(),
    client_id: clientId,
    kind: "passport",
    ...row,
  });
  if (error) throw new Error(`travel_document insert failed: ${error.message}`);
}
