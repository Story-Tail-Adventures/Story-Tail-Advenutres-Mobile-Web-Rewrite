/**
 * Screen 2.1.11 Travel Preferences — the write path.
 *
 * See docs/Screen-Inventory.md §2.1.11 and
 * design/source-prototype/screens/client-auth.jsx `C2111_PreferencesCapture`. P1.
 *
 * One row, `travel_preference`, which is 1:1 with `client`. It is an Edge Function for the
 * same reason 2.1.10's is: the table grants SELECT only to `authenticated` and has no write
 * policy at all, so a browser `.update()` would match zero rows and return 204 — succeeding
 * loudly while changing nothing.
 *
 * WHY NOT AN UPSERT. `client_id` is UNIQUE, so `.upsert({...}, { onConflict: "client_id" })`
 * looks exactly right and is a trap: PostgREST compiles it to
 * `ON CONFLICT (client_id) DO UPDATE SET <every column in the payload> = EXCLUDED.<col>`,
 * and the payload has to carry `id` because the column has no DEFAULT. That rewrites the
 * primary key of the existing row on every save. Read the id, then insert or update.
 *
 * WHY IT IS AUDITED when CLAUDE.md rule 3 does not require it. The rule names four
 * sensitive tables and this is not one of them. But Data-Model §6.2 marks
 * `dietary_restrictions`, `dietary_notes`, `accessibility_needs` and `accessibility_notes`
 * Sensitive PII, and §20.3 asks for an audit row on every write to a tracked table. So the
 * row is written — with the names of the field groups that changed and NEVER their
 * contents. `audit_event` is append-only, retained seven years, and §18.5 exempts it from
 * erasure; copying somebody's allergies into it would outlive their own deletion request.
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
  optionalTags,
  optionalText,
  readJson,
  requireClientId,
} from "../_shared/onboarding.ts";
import type { Db } from "../_shared/db.ts";
import type { TablesInsert } from "../_shared/database.types.ts";

/**
 * The closed vocabularies, matching the CHECK constraints in
 * 20260904124903_travel_preference_vocabulary.sql. The database refuses a typo; these turn
 * that into a 400 a caller can read instead of a 500 nobody can act on.
 */
const TRAVEL_STYLES = ["resort", "cruise", "adventure", "family", "romantic", "group"];
const DIETARY = ["none", "vegetarian", "pescatarian", "gluten_free", "halal"];
const ACCESSIBILITY = ["none", "mobility", "quiet_room", "service_animal"];
const BUDGET_BANDS = ["budget", "mid", "premium", "luxury"];

/** Free text a traveler typed, capped where the screen caps it. */
const NOTES_MAX = 500;
const FAVORITES_MAX = 1000;
const MAX_LOYALTY_ROWS = 10;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const body = await readJson(req);
    const db = onboardingDb();

    // Every key is optional and absent means "leave it alone" — the same tri-state
    // `optionalText` documents. "Skip for now" posts an empty body and must still advance.
    const patch: Partial<TablesInsert<"travel_preference">> = {};

    const destinations = optionalTags(body, "destinations", { max: 12, maxLength: 60 });
    if (destinations !== undefined) patch.preferred_destinations = destinations;

    const styles = optionalTags(body, "travelStyles", { max: TRAVEL_STYLES.length });
    if (styles !== undefined) patch.travel_styles = closedVocabulary(styles, TRAVEL_STYLES, "travelStyles");

    const dietary = optionalTags(body, "dietary", { max: DIETARY.length });
    if (dietary !== undefined) {
      patch.dietary_restrictions = sentinelAlone(
        closedVocabulary(dietary, DIETARY, "dietary"),
        "dietary",
      );
    }

    const accessibility = optionalTags(body, "accessibility", { max: ACCESSIBILITY.length });
    if (accessibility !== undefined) {
      patch.accessibility_needs = sentinelAlone(
        closedVocabulary(accessibility, ACCESSIBILITY, "accessibility"),
        "accessibility",
      );
    }

    const dietaryNotes = boundedText(body, "dietaryNotes", NOTES_MAX);
    if (dietaryNotes !== undefined) patch.dietary_notes = dietaryNotes;

    const accessibilityNotes = boundedText(body, "accessibilityNotes", NOTES_MAX);
    if (accessibilityNotes !== undefined) patch.accessibility_notes = accessibilityNotes;

    // The sentinel cannot sit beside a NOTE either, and this is the likelier contradiction
    // of the two: the closed vocabulary has no slug for an allergy, so a real one arrives
    // in the note. "No restrictions" plus "severe shellfish allergy" is what a well-meaning
    // traveler produces by ticking the reassuring chip and then typing the truth under it.
    noNoteBesideSentinel(patch.dietary_restrictions, patch.dietary_notes, "dietary");
    noNoteBesideSentinel(
      patch.accessibility_needs,
      patch.accessibility_notes,
      "accessibility",
    );

    const favorites = boundedText(body, "favoritePastTrips", FAVORITES_MAX);
    if (favorites !== undefined) patch.favorite_past_trips = favorites;

    const budget = parseBudgetBand(body);
    if (budget !== undefined) patch.budget_band = budget;

    const loyalty = parseLoyalty(body);
    if (loyalty !== undefined) patch.loyalty_programs = loyalty;

    // There is no updated_at trigger anywhere in supabase/migrations — the only two
    // triggers in the repo are on auth.users. The column's DEFAULT now() fires on INSERT
    // only, so an UPDATE that omits it leaves 2.5.3's "last updated" wrong forever.
    patch.updated_at = new Date().toISOString();

    const rowId = await savePreferences(db, clientId, patch, ctx);

    if (body.advance === true) {
      await advanceOnboarding(db, ctx.platformUserId, nextStep("preferences"));
    }

    return new Response(JSON.stringify({ ok: true, id: rowId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});

/**
 * Insert or update the one row, with the audit wrapped around whichever it is.
 *
 * The read is separate from the write and nothing locks between them, so two devices saving
 * at once can still race — `travel_preference` has no `version` column (Data-Model §20.4
 * lists only client, trip and itinerary), so this is last-write-wins by design. Acceptable
 * inside one onboarding session; worth revisiting when 2.5.3 lets somebody edit these from
 * two places.
 */
async function savePreferences(
  db: Db,
  clientId: string,
  patch: Partial<TablesInsert<"travel_preference">>,
  ctx: Parameters<typeof withAudit>[0],
): Promise<string> {
  const { data: existing, error: readError } = await db
    .from("travel_preference")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (readError) throw new Error(`travel_preference read failed: ${readError.message}`);

  const id = existing?.id ?? uuidV7();

  await withAudit(
    ctx,
    {
      eventType: existing ? "travel_preference.updated" : "travel_preference.created",
      targetEntity: "travel_preference",
      targetId: id,
      // Column NAMES only. Two of these columns hold allergies and mobility needs, and an
      // append-only table nobody may erase is the last place a copy of them should live.
      metadata: {
        source: "onboarding-preferences",
        fields: Object.keys(patch).sort(),
      },
    },
    async () => {
      if (existing) {
        const { error } = await db.from("travel_preference").update(patch).eq("id", id);
        if (error) throw new Error(`travel_preference update failed: ${error.message}`);
        return;
      }
      const { error } = await db
        .from("travel_preference")
        .insert({ ...patch, id, client_id: clientId });
      if (!error) return;

      // 23505 on `travel_preference_client_id_key`: another request created the row between
      // the read above and this insert. Two tabs on step 3, or a retry after a timeout.
      // Falling through to an update is what the read would have done a moment earlier —
      // the alternative is an opaque 500 for a save that had nowhere to go wrong.
      if (error.code !== "23505") {
        throw new Error(`travel_preference insert failed: ${error.message}`);
      }
      const { error: retryError } = await db
        .from("travel_preference")
        .update(patch)
        .eq("client_id", clientId);
      if (retryError) {
        throw new Error(`travel_preference update failed: ${retryError.message}`);
      }
    },
  );

  return id;
}

/** Every entry must be in `allowed`, or a 400 naming the field and not echoing the value. */
function closedVocabulary(values: string[], allowed: string[], key: string): string[] {
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw badRequest(`${key} accepts only: ${allowed.join(", ")}.`);
    }
  }
  return values;
}

/**
 * `none` cannot travel with a real answer.
 *
 * Enforced by a CHECK as well, but a constraint violation reaches the caller as a 500 with
 * no detail. This is the same rule said in a sentence somebody can act on.
 */
function sentinelAlone(values: string[], key: string): string[] {
  if (values.includes("none") && values.length > 1) {
    throw badRequest(`${key} cannot be "none" and something else at the same time.`);
  }
  return values;
}

/**
 * `none` and a note contradict each other, so one of them has to go.
 *
 * Enforced by a CHECK as well, but a constraint violation reaches the caller as a 500 with
 * no detail. This is the same rule said in a sentence somebody can act on.
 *
 * Only checks when BOTH keys are present in this request: a patch that sets only the array
 * cannot see what note is already stored, and refusing on a guess would block a traveler
 * from correcting exactly the row that needs correcting. The CHECK catches that case.
 */
function noNoteBesideSentinel(
  values: string[] | undefined,
  note: string | null | undefined,
  key: string,
): void {
  if (values === undefined || note === undefined) return;
  if (values.includes("none") && note !== null) {
    throw badRequest(
      `${key} cannot be "none" and carry a note at the same time — the note is the answer.`,
    );
  }
}

/** Trimmed free text with a ceiling; `""` clears, an absent key leaves it alone. */
function boundedText(
  body: Record<string, unknown>,
  key: string,
  max: number,
): string | null | undefined {
  const value = optionalText(body, key);
  if (value === undefined || value === null) return value;
  if (value.length > max) throw badRequest(`${key} is longer than ${max} characters.`);
  return value;
}

function parseBudgetBand(body: Record<string, unknown>): string | null | undefined {
  const value = optionalText(body, "budgetBand");
  if (value === undefined || value === null) return value;
  if (!BUDGET_BANDS.includes(value)) {
    throw badRequest(`budgetBand accepts only: ${BUDGET_BANDS.join(", ")}.`);
  }
  return value;
}

/**
 * `[{program, number, tier}]` — Data-Model §6.2.
 *
 * A repeater, not the prototype's single `"AAdvantage 4ZE82Q · IHG Rewards 92214"` string.
 * Splitting that on "·" and then on the last space is guesswork that fails the first time
 * somebody types "Marriott Bonvoy 123".
 *
 * `tier` has a home in the shape and neither artboard collects it, so it is written null
 * rather than left off — a consumer reading the key should find it absent-as-null, not
 * missing entirely.
 */
/**
 * One row of `loyalty_programs` — Data-Model §6.2's `{program, number, tier}`.
 *
 * The index signature is not decoration: the generated `Json` type the jsonb column expects
 * is structural, and a plain interface without one is not assignable to it. Naming the
 * three fields anyway is what stops a later refactor quietly writing a different shape into
 * a column nothing constrains.
 */
interface LoyaltyProgram {
  [key: string]: string | null;
  program: string;
  number: string | null;
  /** In the documented shape and collected by neither artboard. Written null, not omitted. */
  tier: string | null;
}

function parseLoyalty(body: Record<string, unknown>): LoyaltyProgram[] | undefined {
  if (!("loyalty" in body)) return undefined;
  const value = body.loyalty;
  if (value === null) return [];
  if (!Array.isArray(value)) throw badRequest("loyalty must be an array.");
  if (value.length > MAX_LOYALTY_ROWS) {
    throw badRequest(`loyalty accepts at most ${MAX_LOYALTY_ROWS} programs.`);
  }

  const rows: LoyaltyProgram[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw badRequest("Each loyalty entry must be an object.");
    }
    const row = entry as Record<string, unknown>;
    const program = optionalText(row, "program") ?? null;
    const number = optionalText(row, "number") ?? null;

    // A wholly empty row is the repeater's last blank line, not a mistake.
    if (program === null && number === null) continue;
    if (program === null) {
      throw badRequest("Every loyalty number needs the program it belongs to.");
    }
    if (program.length > 60) throw badRequest("That program name is too long.");
    if (number !== null && !/^[A-Za-z0-9-]{1,40}$/.test(number)) {
      // Membership ids are alphanumeric. Anything else is a paste accident, and this is a
      // number somebody will read back to an airline.
      throw badRequest("A membership number is letters, digits and hyphens.");
    }
    rows.push({ program, number, tier: null });
  }
  return rows;
}
