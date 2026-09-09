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
import { notFound } from "../problem.ts";
import {
  applyQuota,
  type Budget,
  exhaustionReason,
  makeRecorder,
  readBudget,
} from "./budget.ts";
import {
  createTrackCruisesClient,
  type CruiseSortOrder,
  TrackCruisesError,
} from "./client.ts";
import {
  companyToSlug,
  mapCruiseLine,
  mapPort,
  mapSailing,
  mapShip,
  PROVIDER,
  shipProviderKey,
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
  sort: string;
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
        "departure_within_days, sort, max_rows_per_request, max_requests_per_run, " +
        "cursor, high_water_updated_at",
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
  let degraded = false;

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
      if (result.note) notes.push(`${scope.label}: ${result.note}`);
      // A scope that spent requests and stored nothing is not a success, whatever the HTTP
      // status said. Reporting ok here is how a broken run stays broken for a month.
      if (result.rowsUpserted === 0 && (result.droppedRows ?? 0) > 0) degraded = true;

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
        // The failing response's own quota headers. A 429 reporting "0 remaining" is the
        // most useful budget signal there is, and discarding it would let the scopes behind
        // this one keep issuing requests the relay has already refused.
        budget = applyQuota(budget, err.quota);
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

  const status = anyFailure
    ? (scopesRun > 0 ? "partial" : "failed")
    : (degraded ? "partial" : "ok");
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

/**
 * Refetch one sailing from GET /cruises/{id} and store what only that endpoint returns.
 *
 * WHY THIS IS NOT A SCOPE. Every other request here is scheduled and speculative. This one
 * is demand-driven: it exists because a client pointed at a specific sailing and asked to be
 * quoted, and the ~10 requests the monthly ceiling holds back are held back for exactly this.
 * Putting it on a schedule would spend the reserve on sailings nobody asked about.
 *
 * WHAT ONLY THE DETAIL ENDPOINT GIVES YOU is `cabin_prices_per_person` — interior, oceanview,
 * balcony, suite and whatever line-specific tiers apply. The list endpoint omits it "to keep
 * responses lean", so cruise_sailing_cabin_price stays empty until somebody spends a request
 * here. That is why an empty table is not a sync failure.
 *
 * `run_id` is deliberately NULL on the ledger row. cruise_api_request is separate from
 * cruise_sync_run precisely so a quote-time fetch can spend quota outside any run, and
 * month-to-date has to count it — see §24.9.
 *
 * REFUSES RATHER THAN OVERSPENDS. If the budget is gone it returns `skipped` with a reason
 * and spends nothing, leaving the caller to fall back on the mirrored row. A stale cabin
 * breakdown beats a failed quote request.
 */
export interface RefetchResult {
  sailingId: string;
  cruiseId: string | null;
  company: string | null;
  cabinPricesWritten: number;
  portCallsWritten: number;
  leadPriceCents: number | null;
  currency: string | null;
  budget: Budget;
  /** Set when no request was spent, with the reason. */
  skipped?: string;
}

export async function refetchSailing(options: {
  db: Db;
  apiKey: string;
  sailingId: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<RefetchResult> {
  const { db, sailingId } = options;
  const now = options.now ?? new Date();

  const { data: sailing, error } = await db
    .from("cruise_sailing")
    .select("id, provider, provider_key, provider_locale, cruise_line_id")
    .eq("id", sailingId)
    .maybeSingle();
  if (error) throw new Error(`cruise_sailing lookup failed: ${error.message}`);
  if (!sailing) throw notFound("No such sailing.");

  // The provider's own company slug, which is what /cruises/{id} needs to disambiguate an
  // id — Princess and Holland America share the Y731 voyage-code format. Ours is the line's
  // `slug`; theirs is its `provider_key`.
  const { data: line, error: lineError } = await db
    .from("cruise_line")
    .select("provider_key")
    .eq("id", sailing.cruise_line_id)
    .maybeSingle();
  if (lineError) throw new Error(`cruise_line lookup failed: ${lineError.message}`);

  const company = line?.provider_key ?? null;
  const budget = await readBudget(db);

  if (!company) {
    return {
      sailingId,
      cruiseId: sailing.provider_key,
      company: null,
      cabinPricesWritten: 0,
      portCallsWritten: 0,
      leadPriceCents: null,
      currency: null,
      budget,
      // A curated line has no provider company, so there is nothing to refetch against.
      // Not an error: Virgin Voyages sailings, if ever entered by hand, land here.
      skipped: "the sailing's line has no provider coverage",
    };
  }

  if (budget.allowance <= 0) {
    return {
      sailingId,
      cruiseId: sailing.provider_key,
      company,
      cabinPricesWritten: 0,
      portCallsWritten: 0,
      leadPriceCents: null,
      currency: null,
      budget,
      skipped: exhaustionReason(budget),
    };
  }

  const client = createTrackCruisesClient({
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    // run_id null: this request belongs to no sync run. See the docstring.
    onRequest: makeRecorder(db, null),
  });

  const { data: cruise, quota } = await client.cruise(sailing.provider_key, company);
  const afterQuota = applyQuota(budget, quota);

  const mapped = mapSailing(cruise);
  if (!mapped) {
    throw new Error(
      `provider returned an unusable sailing for ${company}/${sailing.provider_key}`,
    );
  }

  const stamp = now.toISOString();
  const shipId = mapped.ship_name
    ? await resolveShipId(db, sailing.cruise_line_id, company, mapped.ship_name, now)
    : null;

  // ── THE LOCALE TRAP ────────────────────────────────────────────────────────
  //
  // GET /cruises/{id} takes NO `locale` parameter — only `id` and `company`. So it answers
  // in whatever market the provider defaults to, which is not necessarily the one this row
  // was synced in. Observed: refetching an en_US/USD Royal Caribbean sailing returned
  // de_DE/EUR.
  //
  // Writing that back would do two bad things. It would replace a US fare with a European
  // one on a row the US site renders, and — worse — it would rewrite `provider_locale`,
  // which is part of the natural key `(provider, provider_key, provider_locale)`. The next
  // sailing sync would then see no row for the en_US version and insert a SECOND one, so
  // one sailing would silently become two.
  //
  // Therefore: `provider_locale` is never written here, and the market-dependent fields are
  // taken only when the response is actually for the same market. Everything else — the
  // title, the itinerary, the duration — is market-independent and safe to refresh.
  const sameMarket = mapped.provider_locale === sailing.provider_locale;

  // Spread rather than a mutable Record so the generated column types still apply — an
  // untyped patch object is how a typo becomes a silent no-op on a PostgREST update.
  const pricing = sameMarket
    ? {
      lead_price_cents: mapped.lead_price_cents,
      currency: mapped.currency,
      lead_price_eur_cents: mapped.lead_price_eur_cents,
    }
    : {};

  // Keyed on the id we already hold, and `id` is not in the payload — the row exists by
  // definition here, and rewriting its key would break its port calls. `provider_locale` is
  // absent for the reason above.
  const { error: updateError } = await db
    .from("cruise_sailing")
    .update({
      ship_id: shipId,
      title: mapped.title,
      departure_date: mapped.departure_date,
      duration_nights: mapped.duration_nights,
      destinations: mapped.destinations,
      itinerary_url: mapped.itinerary_url,
      provider_updated_at: mapped.provider_updated_at,
      provider_payload: cruise as unknown as Json,
      synced_at: stamp,
      last_seen_at: stamp,
      updated_at: stamp,
      ...pricing,
    })
    .eq("id", sailingId);
  if (updateError) {
    throw new Error(`cruise_sailing refresh failed: ${updateError.message}`);
  }

  // The detail endpoint carries the full ordered itinerary, and ports are market-independent
  // apart from their names. Refreshing costs nothing now the request is spent.
  await replacePortCalls(db, sailingId, cruise.ports_list, now);

  // Cabin prices ARE stored even when the market differs — labelled with the locale they
  // came back in, which is what provider_locale on that table is for.
  //
  // Discarding them would throw away the only cabin data this provider gives at all: the
  // detail endpoint always answers de_DE/EUR (tested — it ignores a locale parameter), so
  // "same market only" would mean an empty table forever for a US advisory. The tier
  // structure and the ratios between tiers are market-independent and are exactly what an
  // advisor explains to a client; the absolute figure comes from InteleTravel at quote time
  // regardless, since BRD §10.5 means nothing here is ever charged.
  const cabinRows = toCabinPrices(
    cruise.cabin_prices_per_person,
    mapped.currency,
    mapped.provider_locale,
  );
  await replaceCabinPrices(
    db,
    sailingId,
    cruise,
    mapped.currency,
    mapped.provider_locale,
    now,
  );

  return {
    sailingId,
    cruiseId: sailing.provider_key,
    company,
    cabinPricesWritten: cabinRows.length,
    portCallsWritten: toPortCalls(cruise.ports_list).length,
    leadPriceCents: sameMarket ? mapped.lead_price_cents : null,
    currency: sameMarket ? mapped.currency : null,
    budget: afterQuota,
    ...(sameMarket ? {} : {
      skipped: `provider answered in ${mapped.provider_locale}, not the row's ` +
        `${sailing.provider_locale} — the sailing's own lead fare was left untouched. ` +
        `Cabin prices were stored, tagged ${mapped.provider_locale}. The detail endpoint ` +
        `takes no locale parameter and ignores one.`,
    }),
  };
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
  /**
   * Rows the provider returned that this scope could not store.
   *
   * Its own field rather than a silent `continue`, because the failure it exists to surface
   * looked exactly like success: a sailing scope run against a catalog with no cruise_line
   * rows spends its request, drops all ten sailings on an unresolvable line, and reports
   * status ok with rowsUpserted 0. On a 100-request month, a request that buys nothing must
   * say so.
   */
  droppedRows?: number;
  /** Why they were dropped, for cruise_sync_run.error_detail. */
  note?: string;
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
  let droppedNoLine = 0;
  const missingCompanies = new Set<string>();
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
      if (!lineId) {
        droppedNoLine += 1;
        missingCompanies.add(ship.company);
        continue;
      }
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
    droppedRows: droppedNoLine,
    note: droppedNoLine > 0
      ? `dropped ${droppedNoLine} ship(s): no cruise_line row for ` +
        `${[...missingCompanies].join(", ")} — the reference scopes have to run first`
      : undefined,
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
 * Sailings, in whichever order the scope asked for.
 *
 * TWO STRATEGIES, AND THE SCOPE PICKS. The provider offers no "updated since" filter, so all
 * we have is its sort plus a bookmark, and the two combinations do different jobs:
 *
 *   departure_date:asc + `cursor`            COVERAGE. Walks the window from the nearest
 *                                            departure outward, resuming where the last run
 *                                            stopped. A few requests a week accumulate a
 *                                            catalogue. Right for an empty one.
 *   updated_at:desc + `high_water_updated_at` FRESHNESS. Reads the most-recently-rescraped
 *                                            sailings and stops at the first one it already
 *                                            has, so a repeat run costs one request rather
 *                                            than a full re-page. Right for a populated one,
 *                                            and WRONG for an empty one — it chases churn
 *                                            and never walks deeper, so nothing accumulates.
 *
 * Hardcoding updated_at:desc here was a real defect for the shipped configuration: the first
 * enabled sailing scope would have fetched one page of recently-repriced sailings, set its
 * high-water mark, and then stopped early forever. The early-stop below is therefore gated
 * on the scope actually being in freshness mode.
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
  let droppedNoLine = 0;
  const missingCompanies = new Set<string>();
  const stamp = now.toISOString();

  const freshnessMode = scope.sort.startsWith("updated_at");

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
      sort: scope.sort as CruiseSortOrder,
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

      // Only meaningful when the rows are ordered by freshness. Under
      // departure_date:asc an older updated_at says nothing about what follows, so
      // stopping here would abandon the page — and the walk — for no reason.
      if (
        freshnessMode && scope.high_water_updated_at && mapped.provider_updated_at &&
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
      if (!lineId) {
        // cruise_sailing.cruise_line_id is NOT NULL, so there is nothing to store this
        // against. Counted, not swallowed — see ScopeResult.droppedRows.
        droppedNoLine += 1;
        missingCompanies.add(mapped.company);
        continue;
      }

      const sailingId = await upsertSailing(db, lineId, mapped, cruise, stamp, now);
      if (!sailingId) continue;
      rowsUpserted += 1;

      await replacePortCalls(db, sailingId, cruise.ports_list, now);
      await replaceCabinPrices(
        db,
        sailingId,
        cruise,
        mapped.currency,
        mapped.provider_locale,
        now,
      );
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
    droppedRows: droppedNoLine,
    note: droppedNoLine > 0
      ? `dropped ${droppedNoLine} sailing(s): no cruise_line row for ` +
        `${[...missingCompanies].join(", ")} — the reference scopes have to run first`
      : undefined,
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
  const { company, ship_name: shipName, ...row } = mapped;
  const shipId = shipName
    ? await resolveShipId(db, lineId, company, shipName, now)
    : null;

  // The id the stored sailing already holds, if any. Minting a new one here is what broke
  // the second sync of every sailing that had port calls — see withExistingIds().
  const { data: stored, error: lookupError } = await db
    .from("cruise_sailing")
    .select("id")
    .eq("provider", row.provider)
    .eq("provider_key", row.provider_key)
    .eq("provider_locale", row.provider_locale)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`cruise_sailing lookup failed: ${lookupError.message}`);
  }

  const { data, error } = await db
    .from("cruise_sailing")
    .upsert({
      ...row,
      id: stored?.id ?? uuidV7(now.getTime()),
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
  providerLocale: string | null,
  now: Date,
): Promise<void> {
  const rows = toCabinPrices(cruise.cabin_prices_per_person, currency, providerLocale);
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
  const prepared = await withExistingIds(db, table, deduped, onConflict);
  // One call site serving three tables, so the row type is the union of three Insert
  // shapes and PostgREST's builder cannot narrow it from a runtime table name. The rows
  // come from the mappers above and are asserted by the migration's constraints.
  // deno-lint-ignore no-explicit-any
  const { error } = await (db.from(table) as any).upsert(prepared, { onConflict });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  return prepared.length;
}

/**
 * Replace each row's freshly minted `id` with the id the stored row already has.
 *
 * WITHOUT THIS, EVERY RE-SYNC SILENTLY REWRITES PRIMARY KEYS. PostgREST's upsert is
 * "merge duplicates", which compiles to `ON CONFLICT (...) DO UPDATE SET` over *every*
 * column present in the payload — `id` included. So a second sync of a row that already
 * exists sets `id = EXCLUDED.id` and the key churns.
 *
 * For a while that is invisible: row counts stay stable, no duplicates appear, and an
 * idempotency check based on counting passes. It becomes a hard failure the moment anything
 * references the id — a cruise_port_call pointing at its sailing is enough:
 *
 *     23503  update or delete on table "cruise_sailing" violates foreign key constraint
 *            "cruise_port_call_sailing_id_fkey"
 *
 * And then it never recovers on its own, because a scope that throws never advances its
 * cursor or high-water mark, so the same row jams every subsequent run. Which would have
 * meant the incremental design — the entire point of `sort=updated_at:desc` — failing on its
 * second pass, in production, on a budget that cannot be re-spent.
 *
 * The lookup is one query per batch keyed on the conflict columns, not one per row.
 */
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
 * Replace each row's freshly minted `id` with the id the stored row already has.
 *
 * WITHOUT THIS, EVERY RE-SYNC SILENTLY REWRITES PRIMARY KEYS. PostgREST's upsert is
 * "merge duplicates", which compiles to `ON CONFLICT (...) DO UPDATE SET` over *every*
 * column in the payload — `id` included. So a second sync of an existing row sets
 * `id = EXCLUDED.id` and the key churns.
 *
 * For a while that is invisible: row counts stay stable, no duplicates appear, and an
 * idempotency check based on counting rows passes. It becomes a hard failure the moment
 * anything references the id — one cruise_port_call pointing at its sailing is enough:
 *
 *     23503  update or delete on table "cruise_sailing" violates foreign key constraint
 *            "cruise_port_call_sailing_id_fkey"
 *
 * And it never recovers unaided, because a scope that throws never advances its cursor or
 * high-water mark, so the same row jams every later run. That is the incremental design —
 * the entire point of sort=updated_at:desc — failing on its second pass, in production, on
 * a budget that cannot be re-spent.
 */
async function withExistingIds(
  db: Db,
  table: "cruise_line" | "cruise_ship" | "cruise_port",
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<Record<string, unknown>[]> {
  const columns = onConflict.split(",").map((c) => c.trim()).filter(Boolean);
  if (columns.length === 0) return rows;

  const keyOf = (row: Record<string, unknown>) =>
    JSON.stringify(columns.map((c) => row[c] ?? null));

  // Page the whole table's (id + key) columns rather than filtering by the batch's keys.
  //
  // The obvious `.in(column, values)` does not survive contact with real data: one
  // /filter-options response carries 4,566 ports, and 4,566 names in a query string is a
  // URL PostgREST rejects outright ("Invalid URL"). Chunking the filter would work, but
  // these are small reference tables by definition — two columns across a few thousand rows
  // — so fetching the lot in pages is one predictable cost instead of an unbounded number
  // of round trips whose size depends on the provider's response.
  //
  // Paged rather than a bare select because PostgREST silently caps an unbounded select at
  // its max-rows setting, and a silent cap here would look exactly like "no existing row",
  // which is the bug this function exists to prevent.
  //
  // cruise_sailing deliberately does NOT use this path — it can grow to hundreds of
  // thousands of rows, so upsertSailing() looks up its one row by natural key instead.
  const existing = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0;; from += pageSize) {
    // deno-lint-ignore no-explicit-any
    const { data, error } = await (db.from(table) as any)
      .select(["id", ...columns].join(","))
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} id lookup failed: ${error.message}`);

    const page = (data ?? []) as Record<string, unknown>[];
    for (const row of page) {
      const id = row.id;
      if (typeof id === "string") existing.set(keyOf(row), id);
    }
    if (page.length < pageSize) break;
  }

  return rows.map((row) => {
    const found = existing.get(keyOf(row));
    return found ? { ...row, id: found } : row;
  });
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

/**
 * Provider company -> our cruise_line id.
 *
 * DELIBERATELY NOT CACHED at module scope. An Edge Function isolate is reused across
 * invocations, so a module-level map would hand back an id from a previous run — and an id
 * is exactly the thing that can go stale, whether from an archival sweep or a concurrent
 * re-sync. The failure mode is a foreign key violation on an insert that looks correct.
 * cruise_line has ten rows; the lookup is not worth the risk.
 */
async function resolveLineId(db: Db, company: string): Promise<string | null> {
  const slug = companyToSlug(company);
  const { data, error } = await db
    .from("cruise_line")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`cruise_line lookup failed: ${error.message}`);
  return data?.id ?? null;
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
  company: string,
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
      // shipProviderKey, not the line uuid: this column is the PROVIDER's identifier, and
      // /ships must be able to upsert onto the same row later.
      provider_key: shipProviderKey(company, shipName),
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
