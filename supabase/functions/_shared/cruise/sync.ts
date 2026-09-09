/**
 * Cruise sync orchestration (Data-Model §24.7).
 *
 * Reads cruise_sync_scope, spends as much of the request allowance as the scopes ask for,
 * and upserts what comes back. It decides nothing about WHAT to sync — that is configuration
 * — only the order (by priority) and when to stop (when the budget says so).
 *
 * THE BUDGET IS CHECKED BEFORE EVERY SINGLE REQUEST, not once per run. A run that read its
 * allowance at the top and then spent it optimistically would sail past the ceiling the one
 * time it mattered: when another environment is draining the same key concurrently.
 *
 * UPSERTS TARGET NATURAL BUSINESS KEYS, NOT THE PROVENANCE PAIR. That is not a style
 * preference — the (provider, provider_key) indexes are PARTIAL (`WHERE provider IS NOT
 * NULL`, so curated rows can exist with a null pair), and Postgres cannot infer a partial
 * index for ON CONFLICT unless the statement repeats its predicate, which PostgREST has no
 * way to express. So conflicts resolve on cruise_line.slug, (cruise_line_id, name),
 * cruise_port.name, and the sailing triple, and the provenance indexes stay as integrity
 * guards. Getting this wrong yields a 42P10 "no unique or exclusion constraint matching"
 * at runtime, on the first real row, in production.
 *
 * ARCHIVAL ONLY AFTER A COMPLETE PASS. A row the feed stopped returning is soft-archived,
 * never deleted (§20.2) — but only when the scope actually finished its pagination. Sweeping
 * on a partial pass would archive the entire catalogue except the ten rows one request
 * happened to return, which on a 3-requests-a-day budget would take weeks to undo.
 */
import type { Db } from "../db.ts";
import type { Json } from "../database.types.ts";
import { uuidV7 } from "../uuid.ts";
import {
  applyQuota,
  type Budget,
  exhaustionReason,
  makeRecorder,
  readBudget,
} from "./budget.ts";
import { createTrackCruisesClient, TrackCruisesError } from "./client.ts";
import {
  companyToSlug,
  mapCruiseLine,
  mapPort,
  mapSailing,
  mapShip,
  PROVIDER,
  toCabinPrices,
  toPortCalls,
} from "./map.ts";

type ScopeRow = {
  id: string;
  label: string;
  endpoint: string;
  priority: number;
  company: string | null;
  locale: string | null;
  destination: string | null;
  departure_within_days: number | null;
  max_rows_per_request: number;
  max_requests_per_run: number;
  cursor: string | null;
  high_water_updated_at: string | null;
};

export interface SyncOptions {
  db: Db;
  apiKey: string;
  trigger: "cron" | "manual";
  /** Restrict the run to one scope label. Used by manual invocations. */
  onlyLabel?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface SyncOutcome {
  runId: string;
  status: "ok" | "partial" | "skipped" | "failed";
  scopesRun: number;
  requestsSpent: number;
  rowsUpserted: number;
  rowsArchived: number;
  budget: Budget;
  notes: string[];
}

export async function runSync(options: SyncOptions): Promise<SyncOutcome> {
  const { db, trigger } = options;
  const now = options.now ?? new Date();
  const runId = uuidV7(now.getTime());
  const startedAt = now.toISOString();
  const notes: string[] = [];

  let budget = await readBudget(db);

  await db.from("cruise_sync_run").insert({
    id: runId,
    trigger,
    status: "running",
    started_at: startedAt,
    quota_limit: budget.quotaLimit,
    quota_remaining: budget.quotaRemaining,
  });

  // Nothing to do, and saying so costs no requests. This is the expected outcome late in a
  // month on the free tier, and it is not a failure.
  if (budget.allowance <= 0) {
    notes.push(exhaustionReason(budget));
    await finishRun(db, runId, "skipped", 0, 0, 0, budget, notes);
    return outcome(runId, "skipped", 0, 0, 0, budget, notes);
  }

  // Count HTTP attempts at the recorder rather than by summing what each scope reports. A
  // scope that throws AFTER spending its request never reports it, so the per-scope tally
  // understates precisely when something went wrong — and understating spend on a metered
  // budget is the one direction that costs money. The relay counted the attempt; so do we.
  let httpAttempts = 0;
  const recordRequest = makeRecorder(db, runId);
  const client = createTrackCruisesClient({
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    onRequest: async (record) => {
      httpAttempts += 1;
      await recordRequest(record);
    },
  });

  let query = db
    .from("cruise_sync_scope")
    .select(
      "id, label, endpoint, priority, company, locale, destination, " +
        "departure_within_days, max_rows_per_request, max_requests_per_run, cursor, " +
        "high_water_updated_at",
    )
    .eq("enabled", true);
  if (options.onlyLabel) query = query.eq("label", options.onlyLabel);

  const { data: scopes, error: scopeError } = await query.order("priority", {
    ascending: true,
  });
  if (scopeError) throw new Error(`cruise scope read failed: ${scopeError.message}`);

  let scopesRun = 0;
  let requestsSpent = 0;
  let rowsUpserted = 0;
  let rowsArchived = 0;
  let anyFailure = false;

  for (const scope of (scopes ?? []) as unknown as ScopeRow[]) {
    if (budget.allowance <= 0) {
      notes.push(`stopped before ${scope.label}: ${exhaustionReason(budget)}`);
      break;
    }

    try {
      const result = await runScope({ db, client, scope, budget, now });
      budget = result.budget;
      rowsUpserted += result.rowsUpserted;
      rowsArchived += result.rowsArchived;
      scopesRun += 1;

      await db
        .from("cruise_sync_scope")
        .update({
          cursor: result.cursor,
          cursor_set_at: result.cursor ? now.toISOString() : null,
          high_water_updated_at: result.highWater ?? scope.high_water_updated_at,
          last_run_at: now.toISOString(),
          last_status: result.complete ? "ok" : "partial",
          last_error: null,
          updated_at: now.toISOString(),
        })
        .eq("id", scope.id);
    } catch (err) {
      // One scope's failure must not abandon the rest: a tier gate on sailings should not
      // cost the reference catalogue its weekly refresh. The run reports `partial`.
      anyFailure = true;
      const detail = describe(err);
      notes.push(`${scope.label}: ${detail}`);

      if (err instanceof TrackCruisesError) {
        budget = applyQuota(budget, {
          limit: null,
          remaining: null,
          resetSeconds: null,
        });
      }

      await db
        .from("cruise_sync_scope")
        .update({
          last_run_at: now.toISOString(),
          last_status: "failed",
          last_error: detail.slice(0, 500),
          updated_at: now.toISOString(),
        })
        .eq("id", scope.id);
    }
  }

  const status = anyFailure ? (scopesRun > 0 ? "partial" : "failed") : "ok";
  requestsSpent = httpAttempts;
  await finishRun(
    db,
    runId,
    status,
    scopesRun,
    requestsSpent,
    rowsUpserted,
    budget,
    notes,
    rowsArchived,
  );
  return outcome(
    runId,
    status,
    scopesRun,
    requestsSpent,
    rowsUpserted,
    budget,
    notes,
    rowsArchived,
  );
}

interface ScopeContext {
  db: Db;
  client: ReturnType<typeof createTrackCruisesClient>;
  scope: ScopeRow;
  budget: Budget;
  now: Date;
}

interface ScopeResult {
  budget: Budget;
  requestsSpent: number;
  rowsUpserted: number;
  rowsArchived: number;
  cursor: string | null;
  highWater: string | null;
  complete: boolean;
}

async function runScope(ctx: ScopeContext): Promise<ScopeResult> {
  switch (ctx.scope.endpoint) {
    case "cruise_lines":
      return await syncCruiseLines(ctx);
    case "coverage":
      return await syncCoverage(ctx);
    case "filter_options":
      return await syncFilterOptions(ctx);
    case "ships":
      return await syncShips(ctx);
    case "ports":
      return await syncPorts(ctx);
    case "cruises":
      return await syncCruises(ctx);
    default:
      // cruise_detail is not a scope: it is spent per quote request, not on a schedule.
      throw new Error(`scope ${ctx.scope.label} has no sync handler`);
  }
}

/** One request, all ten lines. The cheapest and most valuable call the provider has. */
async function syncCruiseLines(ctx: ScopeContext): Promise<ScopeResult> {
  const { db, now } = ctx;
  const page = await ctx.client.cruiseLines();
  const budget = applyQuota(ctx.budget, page.quota);
  const stamp = now.toISOString();

  const rows = page.data.map((line) => ({
    ...mapCruiseLine(line),
    id: uuidV7(now.getTime()),
    provider_payload: line as unknown as Record<string, unknown>,
    synced_at: stamp,
    last_seen_at: stamp,
    archived_at: null,
    updated_at: stamp,
    // first_seen_at is deliberately absent — see its column comment.
  }));

  const upserted = await upsert(db, "cruise_line", rows, "slug");
  // A complete pass, so archival is safe here: this endpoint is unpaginated.
  const archived = await archiveMissing(db, "cruise_line", stamp);

  return {
    budget,
    requestsSpent: 1,
    rowsUpserted: upserted,
    rowsArchived: archived,
    cursor: null,
    highWater: null,
    complete: true,
  };
}

/**
 * Enriches lines with the provider's own coverage figures. Upserts rather than updates so
 * scope order does not matter — a coverage run before the first cruise_lines run still
 * produces usable rows instead of silently updating nothing.
 */
async function syncCoverage(ctx: ScopeContext): Promise<ScopeResult> {
  const { db, now } = ctx;
  const page = await ctx.client.coverage(ctx.scope.company ?? undefined);
  const budget = applyQuota(ctx.budget, page.quota);
  const stamp = now.toISOString();

  const rows = page.data.map((coverage) => {
    const slug = companyToSlug(coverage.company);
    const locales = (coverage.markets ?? [])
      .map((m) => m.locale)
      .filter((l): l is NonNullable<typeof l> => typeof l === "string");
    return {
      id: uuidV7(now.getTime()),
      slug,
      name: coverage.display_name?.trim() || slug,
      sailing_count: coverage.total_sailings ?? null,
      locales,
      provider: PROVIDER,
      provider_key: coverage.company,
      synced_at: stamp,
      last_seen_at: stamp,
      updated_at: stamp,
      // total_snapshots is ignored: their spec says "Reserved. Currently always 0", and a
      // measured-looking zero is how a dashboard lies later.
    };
  });

  return {
    budget,
    requestsSpent: 1,
    rowsUpserted: await upsert(db, "cruise_line", rows, "slug"),
    rowsArchived: 0,
    cursor: null,
    highWater: null,
    complete: true,
  };
}

/**
 * One request for the whole filter vocabulary. This is the cheap route to the port
 * catalogue that /ports charges ten rows at a time for.
 *
 * Ships are only taken when the scope names a company, because an unscoped response returns
 * ship names with no company attached and cruise_ship.cruise_line_id is NOT NULL — there is
 * nothing to attach them to, and guessing from a name is how a Discovery ends up on the
 * wrong line.
 */
async function syncFilterOptions(ctx: ScopeContext): Promise<ScopeResult> {
  const { db, now } = ctx;
  const { data, quota } = await ctx.client.filterOptions(ctx.scope.company ?? undefined);
  const budget = applyQuota(ctx.budget, quota);
  const stamp = now.toISOString();

  let rowsUpserted = 0;

  const portNames = data.ports ?? [];
  if (portNames.length > 0) {
    const rows = portNames
      .filter((name) => typeof name === "string" && name.trim() !== "")
      .map((name) => ({
        ...mapPort(name),
        id: uuidV7(now.getTime()),
        synced_at: stamp,
        last_seen_at: stamp,
        archived_at: null,
        updated_at: stamp,
      }));
    rowsUpserted += await upsert(db, "cruise_port", rows, "name");
  }

  const shipNames = data.ships ?? data.ship_names ?? [];
  if (ctx.scope.company && shipNames.length > 0) {
    const lineId = await resolveLineId(db, ctx.scope.company);
    if (lineId) {
      const rows = shipNames
        .filter((name) => typeof name === "string" && name.trim() !== "")
        .map((name) => ({
          ...mapShip({
            ship_name: name,
            company: ctx.scope.company as never,
            sailing_count: 0,
          }),
          id: uuidV7(now.getTime()),
          cruise_line_id: lineId,
          // The vocabulary endpoint carries no per-ship counts; leave the column null
          // rather than write a zero that reads as "no sailings".
          sailing_count: null,
          synced_at: stamp,
          last_seen_at: stamp,
          archived_at: null,
          updated_at: stamp,
          company: undefined,
        }))
        .map(({ company: _drop, ...row }) => row);
      rowsUpserted += await upsert(db, "cruise_ship", rows, "cruise_line_id,name");
    }
  }

  return {
    budget,
    requestsSpent: 1,
    rowsUpserted,
    rowsArchived: 0,
    cursor: null,
    highWater: null,
    complete: true,
  };
}

async function syncShips(ctx: ScopeContext): Promise<ScopeResult> {
  const { db, now, scope } = ctx;
  let budget = ctx.budget;
  let cursor = scope.cursor;
  let requestsSpent = 0;
  let rowsUpserted = 0;
  let complete = false;
  const stamp = now.toISOString();

  while (requestsSpent < scope.max_requests_per_run && budget.allowance > 0) {
    const page = await ctx.client.ships({
      limit: scope.max_rows_per_request,
      startingAfter: cursor ?? undefined,
      company: scope.company ?? undefined,
    });
    budget = applyQuota(budget, page.quota);
    requestsSpent += 1;

    const rows: Record<string, unknown>[] = [];
    for (const ship of page.data) {
      const lineId = await resolveLineId(db, ship.company);
      if (!lineId) continue;
      const { company: _company, ...mapped } = mapShip(ship);
      rows.push({
        ...mapped,
        id: uuidV7(now.getTime()),
        cruise_line_id: lineId,
        provider_payload: ship as unknown as Json,
        synced_at: stamp,
        last_seen_at: stamp,
        archived_at: null,
        updated_at: stamp,
      });
    }
    rowsUpserted += await upsert(db, "cruise_ship", rows, "cruise_line_id,name");

    cursor = page.nextCursor;
    if (!page.hasMore) {
      complete = true;
      cursor = null;
      break;
    }
  }

  return {
    budget,
    requestsSpent,
    rowsUpserted,
    rowsArchived: complete ? await archiveMissing(db, "cruise_ship", stamp) : 0,
    cursor,
    highWater: null,
    complete,
  };
}

async function syncPorts(ctx: ScopeContext): Promise<ScopeResult> {
  const { db, now, scope } = ctx;
  let budget = ctx.budget;
  let cursor = scope.cursor;
  let requestsSpent = 0;
  let rowsUpserted = 0;
  let complete = false;
  const stamp = now.toISOString();

  while (requestsSpent < scope.max_requests_per_run && budget.allowance > 0) {
    const page = await ctx.client.ports({
      limit: scope.max_rows_per_request,
      startingAfter: cursor ?? undefined,
    });
    budget = applyQuota(budget, page.quota);
    requestsSpent += 1;

    const rows = page.data.map((port) => ({
      ...mapPort(port.port, port.sailing_count),
      id: uuidV7(now.getTime()),
      provider_payload: port as unknown as Json,
      synced_at: stamp,
      last_seen_at: stamp,
      archived_at: null,
      updated_at: stamp,
    }));
    rowsUpserted += await upsert(db, "cruise_port", rows, "name");

    cursor = page.nextCursor;
    if (!page.hasMore) {
      complete = true;
      cursor = null;
      break;
    }
  }

  return {
    budget,
    requestsSpent,
    rowsUpserted,
    rowsArchived: 0,
    cursor,
    highWater: null,
    complete,
  };
}

/**
 * Sailings, newest-scrape-first.
 *
 * `sort=updated_at:desc` plus the scope's high-water mark is the only incremental lever the
 * provider offers — there is no "updated since" filter. So a refresh reads the most recently
 * re-scraped sailings and stops as soon as it recognises one it already has, which is what
 * makes a repeat run cost one request instead of a full re-page.
 *
 * NO ARCHIVAL SWEEP HERE, ever. A sailing scope is a filtered slice (one company, one
 * locale, a rolling window), so "not seen in this pass" does not mean "gone from the feed"
 * — it usually just means outside the window. Sweeping on that would archive the catalogue.
 */
async function syncCruises(ctx: ScopeContext): Promise<ScopeResult> {
  const { db, now, scope } = ctx;
  let budget = ctx.budget;
  let cursor = scope.cursor;
  let requestsSpent = 0;
  let rowsUpserted = 0;
  let complete = false;
  let highWater = scope.high_water_updated_at;
  const stamp = now.toISOString();

  const departureBefore = scope.departure_within_days !== null
    ? isoDate(new Date(now.getTime() + scope.departure_within_days * 86_400_000))
    : undefined;

  while (requestsSpent < scope.max_requests_per_run && budget.allowance > 0) {
    const page = await ctx.client.cruises({
      limit: scope.max_rows_per_request,
      startingAfter: cursor ?? undefined,
      company: scope.company ?? undefined,
      locale: scope.locale ?? undefined,
      destination: scope.destination ?? undefined,
      sort: "updated_at:desc",
      // Today forward: a rolling window, so a scheduled scope cannot quietly expire.
      departureAfter: isoDate(now),
      departureBefore,
    });
    budget = applyQuota(budget, page.quota);
    requestsSpent += 1;

    let reachedKnown = false;

    for (const cruise of page.data) {
      const mapped = mapSailing(cruise);
      if (!mapped) continue;

      if (
        scope.high_water_updated_at && mapped.provider_updated_at &&
        mapped.provider_updated_at <= scope.high_water_updated_at
      ) {
        // Sorted desc, so everything after this is older still.
        reachedKnown = true;
        break;
      }
      if (
        mapped.provider_updated_at &&
        (!highWater || mapped.provider_updated_at > highWater)
      ) {
        highWater = mapped.provider_updated_at;
      }

      const lineId = await resolveLineId(db, mapped.company);
      if (!lineId) continue;

      const sailingId = await upsertSailing(db, lineId, mapped, cruise, stamp, now);
      if (!sailingId) continue;
      rowsUpserted += 1;

      await replacePortCalls(db, sailingId, cruise.ports_list, now);
      await replaceCabinPrices(db, sailingId, cruise, mapped.currency, now);
    }

    cursor = page.nextCursor;
    if (reachedKnown || !page.hasMore) {
      complete = true;
      cursor = null;
      break;
    }
  }

  return {
    budget,
    requestsSpent,
    rowsUpserted,
    rowsArchived: 0,
    cursor,
    highWater,
    complete,
  };
}

async function upsertSailing(
  db: Db,
  lineId: string,
  mapped: NonNullable<ReturnType<typeof mapSailing>>,
  raw: unknown,
  stamp: string,
  now: Date,
): Promise<string | null> {
  const { company: _company, ship_name: shipName, ...row } = mapped;
  const shipId = shipName ? await resolveShipId(db, lineId, shipName, now) : null;

  const { data, error } = await db
    .from("cruise_sailing")
    .upsert({
      ...row,
      id: uuidV7(now.getTime()),
      cruise_line_id: lineId,
      ship_id: shipId,
      provider_payload: raw as Json,
      synced_at: stamp,
      last_seen_at: stamp,
      archived_at: null,
      updated_at: stamp,
    }, { onConflict: "provider,provider_key,provider_locale" })
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`cruise_sailing upsert failed: ${error.message}`);
  }
  return data?.id ?? null;
}

/**
 * Port calls are replaced as a set, not merged.
 *
 * An itinerary that gained or lost a stop must not end up with the old stop still numbered
 * in the middle of it, and `sequence` is positional — so merging by (sailing_id, sequence)
 * would silently retitle stops rather than reorder them. Delete-then-insert is correct here
 * precisely because these rows are wholly owned by their sailing.
 */
async function replacePortCalls(
  db: Db,
  sailingId: string,
  stops: Parameters<typeof toPortCalls>[0],
  now: Date,
): Promise<void> {
  const calls = toPortCalls(stops);

  const { error: deleteError } = await db
    .from("cruise_port_call")
    .delete()
    .eq("sailing_id", sailingId);
  if (deleteError) {
    throw new Error(`cruise_port_call clear failed: ${deleteError.message}`);
  }
  if (calls.length === 0) return;

  const portIds = await resolvePortIds(db, calls.map((c) => c.port_name), now);
  const stamp = now.toISOString();

  const { error } = await db.from("cruise_port_call").insert(
    calls.map((call) => ({
      ...call,
      id: uuidV7(now.getTime()),
      sailing_id: sailingId,
      port_id: portIds.get(call.port_name) ?? null,
      updated_at: stamp,
    })),
  );
  if (error) throw new Error(`cruise_port_call insert failed: ${error.message}`);
}

async function replaceCabinPrices(
  db: Db,
  sailingId: string,
  cruise: { cabin_prices_per_person?: Record<string, number> | null },
  currency: string | null,
  now: Date,
): Promise<void> {
  const rows = toCabinPrices(cruise.cabin_prices_per_person, currency);
  // The list endpoint never sends this field, so an empty result is the normal case and
  // must NOT clear prices a previous detail fetch paid a request for.
  if (rows.length === 0) return;

  const stamp = now.toISOString();
  const { error } = await db.from("cruise_sailing_cabin_price").upsert(
    rows.map((row) => ({
      ...row,
      id: uuidV7(now.getTime()),
      sailing_id: sailingId,
      updated_at: stamp,
    })),
    { onConflict: "sailing_id,cabin_code" },
  );
  if (error) throw new Error(`cabin price upsert failed: ${error.message}`);
}

async function upsert(
  db: Db,
  table: "cruise_line" | "cruise_ship" | "cruise_port",
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  const deduped = dedupeByConflictKey(rows, onConflict);
  if (deduped.length === 0) return 0;
  // One call site serving three tables, so the row type is the union of three Insert
  // shapes and PostgREST's builder cannot narrow it from a runtime table name. The rows
  // come from the mappers above and are asserted by the migration's constraints.
  // deno-lint-ignore no-explicit-any
  const { error } = await (db.from(table) as any).upsert(deduped, { onConflict });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  return deduped.length;
}

/**
 * Drop rows repeating a conflict key WITHIN one batch, keeping the last.
 *
 * Postgres refuses an INSERT ... ON CONFLICT DO UPDATE whose input carries the same
 * conflict target twice — "cannot affect row a second time", SQLSTATE 21000 — and it
 * refuses the WHOLE statement, so one duplicate costs the entire page. Not hypothetical:
 * the live /filter-options response repeats port names, and it took down the first real
 * reference sync.
 *
 * Last-wins, because within one provider response the later entry tends to be the more
 * specific one (a port carrying a sailing_count after a bare name).
 */
function dedupeByConflictKey(
  rows: Record<string, unknown>[],
  onConflict: string,
): Record<string, unknown>[] {
  const columns = onConflict.split(",").map((c) => c.trim()).filter(Boolean);
  if (columns.length === 0) return rows;

  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    // JSON over the key columns: null and the string "null" must stay distinguishable,
    // and a naive join on "|" would collide on a port name containing one.
    const key = JSON.stringify(columns.map((c) => row[c] ?? null));
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * Soft-archive rows this provider stopped returning.
 *
 * Only ever called after a COMPLETE pass, and only for rows this provider owns — a curated
 * row (null provider) is nobody's to archive, which is the schema half of "curated content
 * wins over synced".
 */
async function archiveMissing(
  db: Db,
  table: "cruise_line" | "cruise_ship",
  stamp: string,
): Promise<number> {
  // Same two-table generic as upsert() above.
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (db.from(table) as any)
    .update({ archived_at: stamp, updated_at: stamp })
    .eq("provider", PROVIDER)
    .is("archived_at", null)
    .lt("last_seen_at", stamp)
    .select("id");

  if (error) throw new Error(`${table} archive failed: ${error.message}`);
  return (data as unknown[] | null)?.length ?? 0;
}

const lineIdCache = new Map<string, string | null>();

/** Provider company -> our cruise_line id. Cached per invocation; the table is tiny. */
async function resolveLineId(db: Db, company: string): Promise<string | null> {
  const slug = companyToSlug(company);
  if (lineIdCache.has(slug)) return lineIdCache.get(slug) ?? null;

  const { data, error } = await db
    .from("cruise_line")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`cruise_line lookup failed: ${error.message}`);

  const id = data?.id ?? null;
  lineIdCache.set(slug, id);
  return id;
}

/**
 * Ship name -> id, creating a stub row when the ship catalogue has not been synced.
 *
 * The /ships scope is disabled on the free tier, so sailings routinely name ships no row
 * exists for. Minting a stub keeps the sailing's ship_id meaningful instead of null across
 * the board, and a later /ships pass fills in the counts by upserting the same natural key.
 */
async function resolveShipId(
  db: Db,
  lineId: string,
  shipName: string,
  now: Date,
): Promise<string | null> {
  const { data, error } = await db
    .from("cruise_ship")
    .select("id")
    .eq("cruise_line_id", lineId)
    .eq("name", shipName)
    .maybeSingle();
  if (error) throw new Error(`cruise_ship lookup failed: ${error.message}`);
  if (data?.id) return data.id;

  const stamp = now.toISOString();
  const { data: created, error: insertError } = await db
    .from("cruise_ship")
    .upsert({
      id: uuidV7(now.getTime()),
      cruise_line_id: lineId,
      name: shipName,
      slug: null,
      provider: PROVIDER,
      provider_key: `${lineId}:${shipName}`,
      synced_at: stamp,
      last_seen_at: stamp,
      updated_at: stamp,
    }, { onConflict: "cruise_line_id,name" })
    .select("id")
    .maybeSingle();
  if (insertError) throw new Error(`cruise_ship create failed: ${insertError.message}`);
  return created?.id ?? null;
}

async function resolvePortIds(
  db: Db,
  names: string[],
  now: Date,
): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  const found = new Map<string, string>();
  if (unique.length === 0) return found;

  const { data, error } = await db
    .from("cruise_port")
    .select("id, name")
    .in("name", unique);
  if (error) throw new Error(`cruise_port lookup failed: ${error.message}`);
  for (const row of data ?? []) found.set(row.name, row.id);

  const missing = unique.filter((name) => !found.has(name));
  if (missing.length === 0) return found;

  // Ports arrive from itineraries long before any /ports pass on this budget, so create
  // them from what the sailing named. sailing_count stays null: we did not measure it.
  const stamp = now.toISOString();
  const { data: created, error: insertError } = await db
    .from("cruise_port")
    .upsert(
      missing.map((name) => ({
        ...mapPort(name),
        id: uuidV7(now.getTime()),
        synced_at: stamp,
        last_seen_at: stamp,
        updated_at: stamp,
      })),
      { onConflict: "name" },
    )
    .select("id, name");
  if (insertError) throw new Error(`cruise_port create failed: ${insertError.message}`);
  for (const row of created ?? []) found.set(row.name, row.id);

  return found;
}

async function finishRun(
  db: Db,
  runId: string,
  status: SyncOutcome["status"],
  scopesRun: number,
  requestsSpent: number,
  rowsUpserted: number,
  budget: Budget,
  notes: string[],
  rowsArchived = 0,
): Promise<void> {
  await db
    .from("cruise_sync_run")
    .update({
      status,
      finished_at: new Date().toISOString(),
      scopes_run: scopesRun,
      requests_spent: requestsSpent,
      rows_upserted: rowsUpserted,
      rows_archived: rowsArchived,
      quota_limit: budget.quotaLimit,
      quota_remaining: budget.quotaRemaining,
      error_code: status === "ok" ? null : status,
      error_detail: notes.length > 0 ? notes.join(" | ").slice(0, 2000) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

function outcome(
  runId: string,
  status: SyncOutcome["status"],
  scopesRun: number,
  requestsSpent: number,
  rowsUpserted: number,
  budget: Budget,
  notes: string[],
  rowsArchived = 0,
): SyncOutcome {
  return {
    runId,
    status,
    scopesRun,
    requestsSpent,
    rowsUpserted,
    rowsArchived,
    budget,
    notes,
  };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function describe(err: unknown): string {
  if (err instanceof TrackCruisesError) {
    return `${err.code}${err.requiredTier ? ` (needs ${err.requiredTier})` : ""}: ` +
      err.detail;
  }
  return err instanceof Error ? err.message : String(err);
}
