package cruisesync

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/cruise"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Cruise sync orchestration (sync.ts, Data-Model §24.7).
//
// Reads cruise_sync_scope, spends as much of the request allowance as the scopes ask for, and
// upserts what comes back. It decides nothing about WHAT to sync (that is configuration), only
// the order (by priority) and when to stop (when the budget says so).
//
// THE BUDGET IS CHECKED BEFORE EVERY SINGLE REQUEST, not once per run: a run that read its
// allowance at the top and spent it optimistically would sail past the ceiling the one time it
// mattered, when another environment drains the same key concurrently.
//
// UPSERTS TARGET NATURAL BUSINESS KEYS, NOT THE PROVENANCE PAIR. The (provider, provider_key)
// indexes are PARTIAL, and Postgres cannot infer a partial index for ON CONFLICT unless the
// statement repeats its predicate, which PostgREST cannot express (42P10 at runtime). So
// conflicts resolve on cruise_line.slug, (cruise_line_id, name), cruise_port.name and the
// sailing triple.
//
// ARCHIVAL ONLY AFTER A COMPLETE PASS. A row the feed stopped returning is soft-archived, never
// deleted (§20.2), and only when the scope finished its pagination: sweeping on a partial pass
// would archive everything but the ten rows one request returned.

// maxRequestsPerRun is the most provider requests one run may start, across all its scopes.
// THE RELAY THROTTLES PER MINUTE, NOT JUST PER MONTH: BASIC allows roughly ten a minute, and
// the first production run that reached the provider spent 11 in 16 seconds and took a 429 on
// every scope after that. So a run does what fits under this cap and stops; the Monday cron
// fires several ticks a few minutes apart and each picks up the scopes the last one left due.
const maxRequestsPerRun = 8

// overlapWindow is how recently another `running` run must have started for this one to step
// aside.
const overlapWindow = 10 * time.Minute

type syncOptions struct {
	trigger string // "cron" or "manual"
	// onlyLabel restricts the run to one scope label ("" for all). Manual invocations.
	onlyLabel string
	// maxRequestsPerRun overrides maxRequestsPerRun when > 0. Tests only.
	maxRequestsPerRun int64
	now               time.Time
}

type syncOutcome struct {
	RunID         string
	Status        string // ok | partial | skipped | failed
	ScopesRun     int64
	RequestsSpent int64
	RowsUpserted  int64
	RowsArchived  int64
	Budget        Budget
	Notes         []string
}

// runSync is one run. EVERY PATH OUT OF IT CLOSES THE RUN ROW: the row is inserted as
// `running` before any work, and a throw past the close used to leave it there forever (the
// table's CHECK permits a 'running' row with no finished_at, "a row nobody will ever
// reconcile"). A failure still comes back as an error after the close, so the caller's 5xx
// and the row agree. cruise_sync_watchdog() sweeps whatever still slips through.
func (e *engine) runSync(ctx context.Context, o syncOptions) (syncOutcome, error) {
	now := o.now
	runID := uuid.NewAt(now)
	notes := []string{}

	budget, err := e.readBudget(ctx)
	if err != nil {
		// Go only: Deno threw here before inserting the run row, so a failing ledger read
		// left no record of the run at all. Each run must leave one (Track B decision), so
		// the row is opened and closed as failed before the error goes up.
		e.openRun(ctx, runID, o.trigger, now, Budget{})
		e.finishRun(ctx, runID, "failed", 0, 0, 0, Budget{}, []string{"run aborted: " + describe(err)}, 0, "run_threw")
		return syncOutcome{}, err
	}

	e.openRun(ctx, runID, o.trigger, now, budget)

	// ONE RUN AT A TIME. A run slowed by provider timeouts could still be walking a scope when
	// the next tick starts the same one and pays for the same pages, so the newer run steps
	// aside. It still opens and closes its own row, which is what the watchdog checks a
	// dispatch against. (Deno ignored this read's error too: no rows read means no live run.)
	live, _ := e.db.liveRun(ctx, runID, js.ISOString(now.Add(-overlapWindow)))
	if live {
		notes = append(notes, "skipped: an earlier run that started in the last 10 minutes is still running")
		e.finishRun(ctx, runID, "skipped", 0, 0, 0, budget, notes, 0, "previous_run_running")
		return outcomeOf(runID, "skipped", 0, 0, 0, budget, notes, 0), nil
	}

	// Nothing to do, and saying so costs no requests. The expected outcome late in a month on
	// the free tier, and not a failure.
	if budget.Allowance <= 0 {
		notes = append(notes, exhaustionReason(budget))
		e.finishRun(ctx, runID, "skipped", 0, 0, 0, budget, notes, 0, "budget_exhausted")
		return outcomeOf(runID, "skipped", 0, 0, 0, budget, notes, 0), nil
	}

	// Count HTTP attempts at the recorder rather than by summing what each scope reports: a
	// scope that fails AFTER spending its request never reports it, and understating spend on
	// a metered budget is the one direction that costs money.
	var (
		httpAttempts, scopesRun, rowsUpserted, rowsArchived int64
	)
	record := e.recorder(&runID)

	out, err := func() (syncOutcome, error) {
		client, err := e.newClient(func(ctx context.Context, r cruise.RequestRecord) {
			httpAttempts++
			record(ctx, r)
		})
		if err != nil {
			return syncOutcome{}, err
		}
		var anyFailure, degraded, throttled, redirected bool
		requestCap := int64(maxRequestsPerRun)
		if o.maxRequestsPerRun > 0 {
			requestCap = o.maxRequestsPerRun
		}
		stamp := js.ISOString(now)

		scopes, err := e.db.readScopes(ctx, o.onlyLabel)
		if err != nil {
			return syncOutcome{}, fmt.Errorf("cruise scope read failed: %w", err)
		}

		for _, scope := range scopes {
			if budget.Allowance <= 0 {
				notes = append(notes, "stopped before "+scope.Label+": "+exhaustionReason(budget))
				break
			}

			// Cadence, checked before the budget is touched. A scope that ran inside its
			// interval costs nothing and is not a failure.
			if !dueToRun(scope, now) {
				notes = append(notes, fmt.Sprintf("skipped %s: ran within %dd", scope.Label, scope.MinIntervalDays))
				continue
			}

			// The per-minute pace, checked against this scope's whole allowance before it
			// starts, because a scope cannot be stopped halfway without losing its cursor.
			// Deferred is not failed: nothing is written to the scope, so it stays due. The
			// first scope of a run always goes, so one configured above the cap still runs.
			if httpAttempts > 0 && httpAttempts+scope.MaxRequestsPerRun > requestCap {
				notes = append(notes, fmt.Sprintf("deferred %s to the next tick: a run starts at most %d "+
					"requests, to stay under the relay's per-minute limit", scope.Label, requestCap))
				break
			}

			// Go only: the run is bounded in time (runTimeout), so it always closes its own
			// row rather than leaving that to the watchdog. Out of time is a throw, as an Edge
			// Function killed at its wall-clock limit would have been, minus the stranded row.
			if err := ctx.Err(); err != nil {
				return syncOutcome{}, fmt.Errorf("cruise sync ran out of time before %s: %w", scope.Label, err)
			}

			result, err := e.runScope(ctx, scopeContext{client: client, scope: scope, budget: budget, now: now})
			if err == nil {
				budget = result.budget
				rowsUpserted += result.rowsUpserted
				rowsArchived += result.rowsArchived
				scopesRun++
				if result.note != "" {
					notes = append(notes, scope.Label+": "+result.note)
				}
				// A scope that spent requests and stored nothing is not a success, whatever the
				// HTTP status said. Reporting ok here is how a broken run stays broken a month.
				if result.rowsUpserted == 0 && result.droppedRows > 0 {
					degraded = true
				}

				// Throttled partway: the pages it did get are stored and the cursor is saved,
				// so the next tick resumes rather than buying the same pages twice. Not
				// stamped as run, for the reason the failure path gives.
				var cursorSetAt any
				if truthy(result.cursor) {
					cursorSetAt = stamp
				}
				highWater := result.highWater
				if highWater == nil {
					highWater = scope.HighWaterUpdatedAt
				}
				patch := js.O("cursor", result.cursor, "cursor_set_at", cursorSetAt, "high_water_updated_at", highWater)
				if !result.rateLimited {
					patch = append(patch, js.Field{Key: "last_run_at", Value: stamp})
				}
				lastStatus := "partial"
				if result.complete {
					lastStatus = "ok"
				}
				patch = append(patch, js.O("last_status", lastStatus, "last_error", nil, "updated_at", stamp)...)
				e.updateScope(ctx, scope.ID, patch)

				if result.rateLimited {
					throttled = true
					notes = append(notes, "stopped during "+scope.Label+": the relay's per-minute limit; its cursor is "+
						"saved and it stays due for the next tick")
					break
				}
				continue
			}

			// One scope's failure must not abandon the rest: a tier gate on sailings should not
			// cost the reference catalogue its weekly refresh. The run reports `partial`.
			anyFailure = true
			detail := describe(err)
			notes = append(notes, scope.Label+": "+detail)

			if te, ok := err.(*cruise.TrackCruisesError); ok {
				// The failing response's own quota headers. A 429 reporting "0 remaining" is
				// the most useful budget signal there is.
				budget = applyQuota(budget, te.Quota)
			}

			// A 429 IS "NOT YET", NOT "TRIED". Stamping last_run_at would make a throttled
			// scope wait out its whole interval having fetched nothing.
			rateLimited := isPerMinuteThrottle(err)
			patch := js.O()
			if !rateLimited {
				patch = append(patch, js.Field{Key: "last_run_at", Value: stamp})
			}
			patch = append(patch, js.O("last_status", "failed", "last_error", js.Slice(detail, 0, 500), "updated_at", stamp)...)
			e.updateScope(ctx, scope.ID, patch)

			if rateLimited {
				throttled = true
				notes = append(notes, "stopped after "+scope.Label+": the relay's per-minute limit; "+
					"it and the scopes after it stay due for the next tick")
				break
			}
			if isRedirect(err) {
				// Go only (see redirectStop): every request after this one would get the same
				// answer, so the run stops here rather than spend a request per scope on it.
				redirected = true
				notes = append(notes, "stopped after "+scope.Label+": the provider answered with a redirect, which "+
					"this service never follows; the scopes after it stay due")
				break
			}
		}

		var status string
		switch {
		case anyFailure || throttled:
			status = "failed"
			if scopesRun > 0 {
				status = "partial"
			}
		case degraded:
			status = "partial"
		default:
			status = "ok"
		}

		// The cause, separately from the verdict. `spent_but_stored_nothing` names a scope
		// that bought a request and kept none of it. A genuinely EMPTY page is deliberately
		// not flagged: for a date-window sailing scope it is a normal answer. `rate_limited`
		// outranks the generic codes because it names the fix, and so does
		// `provider_redirected` (Go only).
		var errorCode string
		switch {
		case throttled:
			errorCode = "rate_limited"
		case redirected:
			errorCode = "provider_redirected"
		case anyFailure && scopesRun > 0:
			errorCode = "scope_failed"
		case anyFailure:
			errorCode = "all_scopes_failed"
		case degraded:
			errorCode = "spent_but_stored_nothing"
		}

		e.finishRun(ctx, runID, status, scopesRun, httpAttempts, rowsUpserted, budget, notes, rowsArchived, errorCode)
		return outcomeOf(runID, status, scopesRun, httpAttempts, rowsUpserted, budget, notes, rowsArchived), nil
	}()
	if err != nil {
		notes = append(notes, "run aborted: "+describe(err))
		e.finishRun(ctx, runID, "failed", scopesRun, httpAttempts, rowsUpserted, budget, notes, rowsArchived, "run_threw")
		return syncOutcome{}, err
	}
	return out, nil
}

// openRun inserts the run row as `running`. Its error is logged, not thrown, as Deno ignored
// it: the run goes on, and its ledger rows (which reference the run) will say so in the log.
func (e *engine) openRun(ctx context.Context, runID, trigger string, now time.Time, b Budget) {
	row := js.O(
		"id", runID,
		"trigger", trigger,
		"status", "running",
		"started_at", js.ISOString(now),
		"quota_limit", b.QuotaLimit,
		"quota_remaining", b.QuotaRemaining,
	)
	if err := e.db.insertRun(ctx, row); err != nil {
		e.warn("cruise_sync_run insert failed", err)
	}
}

// finishRun closes the run row. errorCode is WHY, not WHAT ("" when there is none): it used
// to restate the status column beside it, with the cause buried in a prose blob.
//
// It runs on a context of its own (detached, briefly bounded), so a run that hit its time
// bound, or a caller that hung up, still gets its row closed.
func (e *engine) finishRun(ctx context.Context, runID, status string, scopesRun, requestsSpent, rowsUpserted int64,
	b Budget, notes []string, rowsArchived int64, errorCode string) {
	fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), closeTimeout)
	defer cancel()

	var code any
	if status != "ok" {
		code = status
		if errorCode != "" {
			code = errorCode
		}
	}
	var detail any
	if len(notes) > 0 {
		detail = js.Slice(strings.Join(notes, " | "), 0, 2000)
	}
	patch := js.O(
		"status", status,
		"finished_at", js.ISOString(e.clock()),
		"scopes_run", scopesRun,
		"requests_spent", requestsSpent,
		"rows_upserted", rowsUpserted,
		"rows_archived", rowsArchived,
		"quota_limit", b.QuotaLimit,
		"quota_remaining", b.QuotaRemaining,
		"error_code", code,
		"error_detail", detail,
		"updated_at", js.ISOString(e.clock()),
	)
	if err := e.db.updateRun(fctx, runID, patch); err != nil {
		e.warn("cruise_sync_run close failed", err)
	}
}

// updateScope writes a scope's progress. Deno ignored this write's error; it is logged here.
func (e *engine) updateScope(ctx context.Context, scopeID string, patch js.Ordered) {
	if err := e.db.updateScope(ctx, scopeID, patch); err != nil {
		e.warn("cruise_sync_scope update failed", err)
	}
}

func outcomeOf(runID, status string, scopesRun, requestsSpent, rowsUpserted int64, b Budget, notes []string, rowsArchived int64) syncOutcome {
	return syncOutcome{
		RunID:         runID,
		Status:        status,
		ScopesRun:     scopesRun,
		RequestsSpent: requestsSpent,
		RowsUpserted:  rowsUpserted,
		RowsArchived:  rowsArchived,
		Budget:        b,
		Notes:         notes,
	}
}

// dueToRun: has this scope's interval elapsed? `min_interval_days` 0 means every run (every
// TICK, since the Monday cron fires several). A scope that has never run is always due, so a
// fresh deployment fills the reference catalogue on its first tick.
func dueToRun(scope scopeRow, now time.Time) bool {
	if scope.MinIntervalDays <= 0 {
		return true
	}
	if !truthy(scope.LastRunAt) {
		return true
	}
	last, ok := js.ParseDate(*scope.LastRunAt)
	if !ok {
		return true
	}
	return now.UnixMilli()-last.UnixMilli() >= scope.MinIntervalDays*86_400_000
}

// isPerMinuteThrottle tells the relay's per-minute throttle from the monthly quota running
// out. Both arrive as 429; only a 429 whose headers do not say 0 remaining is "come back in a
// minute". The month is the next tick's readBudget's to skip.
func isPerMinuteThrottle(err error) bool {
	te, ok := err.(*cruise.TrackCruisesError)
	return ok && te.Status != nil && *te.Status == 429 && (te.Quota.Remaining == nil || *te.Quota.Remaining != 0)
}

func isRedirect(err error) bool {
	te, ok := err.(*cruise.TrackCruisesError)
	return ok && te.Status != nil && *te.Status >= 300 && *te.Status <= 399
}

// describe is the sentence a failure leaves in notes, last_error and error_detail.
func describe(err error) string {
	if te, ok := err.(*cruise.TrackCruisesError); ok {
		s := te.Code
		if truthy(te.RequiredTier) {
			s += " (needs " + *te.RequiredTier + ")"
		}
		return s + ": " + te.Detail
	}
	return err.Error()
}

// ---- the scopes ----

type scopeContext struct {
	client *cruise.Client
	scope  scopeRow
	budget Budget
	now    time.Time
}

type scopeResult struct {
	budget        Budget
	requestsSpent int64
	rowsUpserted  int64
	rowsArchived  int64
	cursor        *string
	highWater     *string
	complete      bool
	// droppedRows are rows the provider returned that this scope could not store. Its own
	// field rather than a silent `continue`, because the failure it surfaces looked exactly
	// like success: a request that buys nothing must say so.
	droppedRows int64
	// note says why they were dropped ("" for none).
	note string
	// rateLimited: the relay's per-minute 429 arrived after at least one page was stored.
	// The scope returns normally so the cursor it reached is saved, and the run stops.
	rateLimited bool
}

func (e *engine) runScope(ctx context.Context, sc scopeContext) (scopeResult, error) {
	switch sc.scope.Endpoint {
	case "cruise_lines":
		return e.syncCruiseLines(ctx, sc)
	case "coverage":
		return e.syncCoverage(ctx, sc)
	case "filter_options":
		return e.syncFilterOptions(ctx, sc)
	case "ships":
		return e.syncShips(ctx, sc)
	case "ports":
		return e.syncPorts(ctx, sc)
	case "cruises":
		return e.syncCruises(ctx, sc)
	default:
		// cruise_detail is not a scope: it is spent per quote request, not on a schedule.
		return scopeResult{}, fmt.Errorf("scope %s has no sync handler", sc.scope.Label)
	}
}

// syncCruiseLines is one request, all ten lines: the cheapest and most valuable call.
func (e *engine) syncCruiseLines(ctx context.Context, sc scopeContext) (scopeResult, error) {
	page, err := sc.client.CruiseLines(ctx)
	if err != nil {
		return scopeResult{}, err
	}
	budget := applyQuota(sc.budget, page.Quota)
	stamp := js.ISOString(sc.now)

	rows := make([]js.Ordered, 0, len(page.Data))
	for _, line := range page.Data {
		// first_seen_at is deliberately absent; see its column comment.
		rows = append(rows, spread(cruiseLineFields(cruise.MapCruiseLine(line)),
			"id", uuid.NewAt(sc.now),
			"provider_payload", line.Raw,
			"synced_at", stamp,
			"last_seen_at", stamp,
			"archived_at", nil,
			"updated_at", stamp,
		))
	}
	upserted, err := e.upsert(ctx, "cruise_line", rows, "slug")
	if err != nil {
		return scopeResult{}, err
	}
	// A complete pass, so archival is safe here: this endpoint is unpaginated.
	archived, err := e.archive(ctx, "cruise_line", stamp)
	if err != nil {
		return scopeResult{}, err
	}
	return scopeResult{budget: budget, requestsSpent: 1, rowsUpserted: upserted, rowsArchived: archived, complete: true}, nil
}

// syncCoverage enriches lines with the provider's own coverage figures. Upserts rather than
// updates so scope order does not matter.
func (e *engine) syncCoverage(ctx context.Context, sc scopeContext) (scopeResult, error) {
	page, err := sc.client.Coverage(ctx, deref(sc.scope.Company))
	if err != nil {
		return scopeResult{}, err
	}
	budget := applyQuota(sc.budget, page.Quota)
	stamp := js.ISOString(sc.now)

	rows := make([]js.Ordered, 0, len(page.Data))
	for _, c := range page.Data {
		slug := cruise.CompanyToSlug(c.Company)
		locales := []string{}
		for _, m := range c.Markets {
			if m.Locale != nil {
				locales = append(locales, *m.Locale)
			}
		}
		name := slug
		if c.DisplayName != nil {
			if t := js.Trim(*c.DisplayName); t != "" {
				name = t
			}
		}
		// `coverage.total_sailings ?? null`, carried as the provider sent it (not truncated).
		var sailingCount any
		if c.TotalSailings != nil {
			sailingCount = js.Num(*c.TotalSailings)
		}
		// total_snapshots is ignored: their spec says "Reserved. Currently always 0", and a
		// measured-looking zero is how a dashboard lies later.
		rows = append(rows, js.O(
			"id", uuid.NewAt(sc.now),
			"slug", slug,
			"name", name,
			"sailing_count", sailingCount,
			"locales", locales,
			"provider", cruise.Provider,
			"provider_key", c.Company,
			"synced_at", stamp,
			"last_seen_at", stamp,
			"updated_at", stamp,
		))
	}
	upserted, err := e.upsert(ctx, "cruise_line", rows, "slug")
	if err != nil {
		return scopeResult{}, err
	}
	return scopeResult{budget: budget, requestsSpent: 1, rowsUpserted: upserted, complete: true}, nil
}

// syncFilterOptions is one request for the whole filter vocabulary: the cheap route to the
// port catalogue /ports charges ten rows at a time for. Ships are only taken when the scope
// names a company: an unscoped response returns ship names with no company, and
// cruise_ship.cruise_line_id is NOT NULL.
func (e *engine) syncFilterOptions(ctx context.Context, sc scopeContext) (scopeResult, error) {
	item, err := sc.client.FilterOptions(ctx, deref(sc.scope.Company))
	if err != nil {
		return scopeResult{}, err
	}
	budget := applyQuota(sc.budget, item.Quota)
	stamp := js.ISOString(sc.now)
	var upserted int64

	if len(item.Data.Ports) > 0 {
		rows := []js.Ordered{}
		for _, name := range item.Data.Ports {
			if js.Trim(name) == "" {
				continue
			}
			rows = append(rows, spread(portFields(cruise.MapPort(name, js.UndefinedValue())),
				"id", uuid.NewAt(sc.now),
				"synced_at", stamp,
				"last_seen_at", stamp,
				"archived_at", nil,
				"updated_at", stamp,
			))
		}
		n, err := e.upsert(ctx, "cruise_port", rows, "name")
		if err != nil {
			return scopeResult{}, err
		}
		upserted += n
	}

	// `data.ships ?? data.ship_names ?? []`: an empty `ships` array is not nullish.
	shipNames := item.Data.Ships
	if shipNames == nil {
		shipNames = item.Data.ShipNames
	}
	if company := deref(sc.scope.Company); company != "" && len(shipNames) > 0 {
		lineID, err := e.resolveLineID(ctx, company)
		if err != nil {
			return scopeResult{}, err
		}
		if lineID != nil {
			zero := 0.0
			rows := []js.Ordered{}
			for _, name := range shipNames {
				if js.Trim(name) == "" {
					continue
				}
				m := cruise.MapShip(cruise.ProviderShip{ShipName: name, Company: company, SailingCount: &zero})
				// The vocabulary endpoint carries no per-ship counts; the column stays null
				// rather than a zero that reads as "no sailings".
				rows = append(rows, spread(shipFields(m),
					"id", uuid.NewAt(sc.now),
					"cruise_line_id", *lineID,
					"sailing_count", nil,
					"synced_at", stamp,
					"last_seen_at", stamp,
					"archived_at", nil,
					"updated_at", stamp,
				))
			}
			n, err := e.upsert(ctx, "cruise_ship", rows, "cruise_line_id,name")
			if err != nil {
				return scopeResult{}, err
			}
			upserted += n
		}
	}
	return scopeResult{budget: budget, requestsSpent: 1, rowsUpserted: upserted, complete: true}, nil
}

func (e *engine) syncShips(ctx context.Context, sc scopeContext) (scopeResult, error) {
	scope := sc.scope
	budget := sc.budget
	cursor := scope.Cursor
	var requestsSpent, upserted, dropped int64
	complete := false
	missing := orderedSet{}
	stamp := js.ISOString(sc.now)
	limit := int(scope.MaxRowsPerRequest)

	for requestsSpent < scope.MaxRequestsPerRun && budget.Allowance > 0 {
		page, err := sc.client.Ships(ctx, cruise.ListParams{Limit: &limit, StartingAfter: deref(cursor), Company: deref(scope.Company)})
		if err != nil {
			return scopeResult{}, err
		}
		budget = applyQuota(budget, page.Quota)
		requestsSpent++

		rows := []js.Ordered{}
		for _, ship := range page.Data {
			lineID, err := e.resolveLineID(ctx, ship.Company)
			if err != nil {
				return scopeResult{}, err
			}
			if lineID == nil {
				dropped++
				missing.add(ship.Company)
				continue
			}
			rows = append(rows, spread(shipFields(cruise.MapShip(ship)),
				"id", uuid.NewAt(sc.now),
				"cruise_line_id", *lineID,
				"provider_payload", ship.Raw,
				"synced_at", stamp,
				"last_seen_at", stamp,
				"archived_at", nil,
				"updated_at", stamp,
			))
		}
		n, err := e.upsert(ctx, "cruise_ship", rows, "cruise_line_id,name")
		if err != nil {
			return scopeResult{}, err
		}
		upserted += n

		cursor = page.NextCursor
		if !page.HasMore {
			complete = true
			cursor = nil
			break
		}
	}

	var archived int64
	if complete {
		n, err := e.archive(ctx, "cruise_ship", stamp)
		if err != nil {
			return scopeResult{}, err
		}
		archived = n
	}
	r := scopeResult{budget: budget, requestsSpent: requestsSpent, rowsUpserted: upserted, rowsArchived: archived,
		cursor: cursor, complete: complete, droppedRows: dropped}
	if dropped > 0 {
		r.note = fmt.Sprintf("dropped %d ship(s): no cruise_line row for %s \U00002014 the reference scopes have to run first",
			dropped, missing.join(", "))
	}
	return r, nil
}

func (e *engine) syncPorts(ctx context.Context, sc scopeContext) (scopeResult, error) {
	scope := sc.scope
	budget := sc.budget
	cursor := scope.Cursor
	var requestsSpent, upserted int64
	complete := false
	stamp := js.ISOString(sc.now)
	limit := int(scope.MaxRowsPerRequest)

	for requestsSpent < scope.MaxRequestsPerRun && budget.Allowance > 0 {
		page, err := sc.client.Ports(ctx, cruise.ListParams{Limit: &limit, StartingAfter: deref(cursor)})
		if err != nil {
			return scopeResult{}, err
		}
		budget = applyQuota(budget, page.Quota)
		requestsSpent++

		rows := make([]js.Ordered, 0, len(page.Data))
		for _, port := range page.Data {
			rows = append(rows, spread(portFields(cruise.MapPort(port.Port, port.SailingCount)),
				"id", uuid.NewAt(sc.now),
				"provider_payload", port.Raw,
				"synced_at", stamp,
				"last_seen_at", stamp,
				"archived_at", nil,
				"updated_at", stamp,
			))
		}
		n, err := e.upsert(ctx, "cruise_port", rows, "name")
		if err != nil {
			return scopeResult{}, err
		}
		upserted += n

		cursor = page.NextCursor
		if !page.HasMore {
			complete = true
			cursor = nil
			break
		}
	}
	return scopeResult{budget: budget, requestsSpent: requestsSpent, rowsUpserted: upserted, cursor: cursor, complete: complete}, nil
}

// syncCruises is sailings, in whichever order the scope asked for.
//
// TWO STRATEGIES, AND THE SCOPE PICKS. departure_date:asc + `cursor` is COVERAGE: it walks the
// window from the nearest departure outward, resuming where the last run stopped.
// updated_at:desc + `high_water_updated_at` is FRESHNESS: it reads the most recently rescraped
// sailings and stops at the first one it already has. The early stop is gated on the scope
// actually being in freshness mode.
//
// NO ARCHIVAL SWEEP HERE, ever: a sailing scope is a filtered slice, so "not seen in this
// pass" usually just means outside the window.
func (e *engine) syncCruises(ctx context.Context, sc scopeContext) (scopeResult, error) {
	scope := sc.scope
	budget := sc.budget
	cursor := scope.Cursor
	var requestsSpent, upserted int64
	complete := false
	highWater := scope.HighWaterUpdatedAt
	// Three ways a row can vanish, each counted: an uncounted drop defeats the one guard that
	// turns a request-that-bought-nothing into a degraded run.
	var droppedNoLine, droppedUnmappable, droppedNotUpserted int64
	missing := orderedSet{}
	stamp := js.ISOString(sc.now)
	limit := int(scope.MaxRowsPerRequest)

	freshness := strings.HasPrefix(scope.Sort, "updated_at")

	departureBefore := ""
	if scope.DepartureWithinDays != nil {
		d, err := isoDateAfter(sc.now, *scope.DepartureWithinDays)
		if err != nil {
			return scopeResult{}, err
		}
		departureBefore = d
	}
	// WHERE THE WINDOW OPENS decides how far ahead the catalogue reaches: soonest-first from
	// today means a weekly pass of a few pages always holds THIS week. Opening the window
	// `departure_offset_days` out collects sailings people can still book.
	var offset int64
	if scope.DepartureOffsetDays != nil {
		offset = *scope.DepartureOffsetDays
	}
	departureAfter, err := isoDateAfter(sc.now, offset)
	if err != nil {
		return scopeResult{}, err
	}

	rateLimited := false
	for requestsSpent < scope.MaxRequestsPerRun && budget.Allowance > 0 {
		page, err := sc.client.Cruises(ctx, cruise.CruiseListParams{
			ListParams: cruise.ListParams{
				Limit:         &limit,
				StartingAfter: deref(cursor),
				Company:       deref(scope.Company),
				Locale:        deref(scope.Locale),
			},
			Destination:     deref(scope.Destination),
			Sort:            cruise.CruiseSortOrder(scope.Sort),
			DepartureAfter:  departureAfter,
			DepartureBefore: departureBefore,
		})
		if err != nil {
			// Throttled after pages were already stored: stop HERE and return them, so the
			// caller saves the cursor they reached. A 429 on the very first page has nothing
			// to save and goes up as an error.
			if requestsSpent > 0 && isPerMinuteThrottle(err) {
				budget = applyQuota(budget, err.(*cruise.TrackCruisesError).Quota)
				rateLimited = true
				break
			}
			return scopeResult{}, err
		}
		budget = applyQuota(budget, page.Quota)
		requestsSpent++

		reachedKnown := false
		for _, c := range page.Data {
			mapped := cruise.MapSailing(c)
			if mapped == nil {
				// A row this mapper could not read: a renamed field, a missing id, a
				// malformed date. COUNTED, or a renamed field silently drops whole pages.
				droppedUnmappable++
				continue
			}
			// Only meaningful when the rows are ordered by freshness. (A string comparison,
			// as in Deno: the two sides are not even in the same timestamp format.)
			if freshness && truthy(scope.HighWaterUpdatedAt) && truthy(mapped.ProviderUpdatedAt) &&
				*mapped.ProviderUpdatedAt <= *scope.HighWaterUpdatedAt {
				// Sorted desc, so everything after this is older still.
				reachedKnown = true
				break
			}
			if truthy(mapped.ProviderUpdatedAt) && (!truthy(highWater) || *mapped.ProviderUpdatedAt > *highWater) {
				highWater = mapped.ProviderUpdatedAt
			}

			lineID, err := e.resolveLineID(ctx, mapped.Company)
			if err != nil {
				return scopeResult{}, err
			}
			if lineID == nil {
				// cruise_sailing.cruise_line_id is NOT NULL; nothing to store this against.
				droppedNoLine++
				missing.add(mapped.Company)
				continue
			}

			sailingID, err := e.upsertSailing(ctx, *lineID, mapped, c.Raw, stamp, sc.now)
			if err != nil {
				return scopeResult{}, err
			}
			if sailingID == nil {
				// The upsert returned no id: a conflict target that did not match, a refusal.
				droppedNotUpserted++
				continue
			}
			upserted++

			if err := e.replacePortCalls(ctx, *sailingID, c.PortsList, sc.now); err != nil {
				return scopeResult{}, err
			}
			if err := e.replaceCabinPrices(ctx, *sailingID, c.CabinPricesPerPerson, mapped.Currency, mapped.ProviderLocale, sc.now); err != nil {
				return scopeResult{}, err
			}
		}

		cursor = page.NextCursor
		if reachedKnown || !page.HasMore {
			complete = true
			cursor = nil
			break
		}
	}

	var parts []string
	if droppedNoLine > 0 {
		parts = append(parts, fmt.Sprintf("dropped %d sailing(s): no cruise_line row for %s \U00002014 the reference scopes have to run first",
			droppedNoLine, missing.join(", ")))
	}
	if droppedUnmappable > 0 {
		parts = append(parts, fmt.Sprintf("dropped %d sailing(s): the provider payload did not map \U00002014 "+
			"a renamed or missing field is the usual cause", droppedUnmappable))
	}
	if droppedNotUpserted > 0 {
		parts = append(parts, fmt.Sprintf("dropped %d sailing(s): the upsert returned no id", droppedNotUpserted))
	}
	return scopeResult{
		budget:        budget,
		requestsSpent: requestsSpent,
		rowsUpserted:  upserted,
		cursor:        cursor,
		highWater:     highWater,
		complete:      complete,
		rateLimited:   rateLimited,
		droppedRows:   droppedNoLine + droppedUnmappable + droppedNotUpserted,
		note:          strings.Join(parts, "; "),
	}, nil
}

// upsertSailing writes one sailing and returns its id (nil when the upsert returned none).
//
// It reuses the id the stored sailing already holds: minting a new one is what broke the second
// sync of every sailing with port calls (see withExistingIDs). cruise_sailing can grow to
// hundreds of thousands of rows, so it looks up its one row by natural key instead of paging.
func (e *engine) upsertSailing(ctx context.Context, lineID string, mapped *cruise.SailingRow, raw js.Value, stamp string, now time.Time) (*string, error) {
	var shipID *string
	if mapped.ShipName != nil {
		id, err := e.resolveShipID(ctx, lineID, mapped.Company, *mapped.ShipName, now)
		if err != nil {
			return nil, err
		}
		shipID = id
	}

	stored, err := e.db.sailingIDByKey(ctx, mapped.Provider, mapped.ProviderKey, mapped.ProviderLocale)
	if err != nil {
		return nil, fmt.Errorf("cruise_sailing lookup failed: %w", err)
	}
	id := uuid.NewAt(now)
	if stored != nil {
		id = *stored
	}
	row := spread(sailingFields(mapped),
		"id", id,
		"cruise_line_id", lineID,
		"ship_id", shipID,
		"provider_payload", raw,
		"synced_at", stamp,
		"last_seen_at", stamp,
		"archived_at", nil,
		"updated_at", stamp,
	)
	out, err := e.db.upsertSailing(ctx, row)
	if err != nil {
		return nil, fmt.Errorf("cruise_sailing upsert failed: %w", err)
	}
	return out, nil
}

// replacePortCalls replaces a sailing's port calls as a set, not merged: `sequence` is
// positional, so merging by (sailing_id, sequence) would silently retitle stops rather than
// reorder them. Delete-then-insert is correct because these rows are wholly owned by their
// sailing.
func (e *engine) replacePortCalls(ctx context.Context, sailingID string, stops []cruise.ProviderPortStop, now time.Time) error {
	calls := cruise.ToPortCalls(stops)
	if err := e.db.deletePortCalls(ctx, sailingID); err != nil {
		return fmt.Errorf("cruise_port_call clear failed: %w", err)
	}
	if len(calls) == 0 {
		return nil
	}
	names := make([]string, len(calls))
	for i, c := range calls {
		names[i] = c.PortName
	}
	portIDs, err := e.resolvePortIDs(ctx, names, now)
	if err != nil {
		return err
	}
	stamp := js.ISOString(now)
	rows := make([]js.Ordered, len(calls))
	for i, c := range calls {
		var portID any
		if id, ok := portIDs[c.PortName]; ok {
			portID = id
		}
		rows[i] = spread(portCallFields(c),
			"id", uuid.NewAt(now),
			"sailing_id", sailingID,
			"port_id", portID,
			"updated_at", stamp,
		)
	}
	if err := e.db.insertPortCalls(ctx, rows); err != nil {
		return fmt.Errorf("cruise_port_call insert failed: %w", err)
	}
	return nil
}

// replaceCabinPrices upserts a sailing's cabin prices. The list endpoint never sends them, so
// an empty result is the normal case and must NOT clear prices a detail fetch paid for.
func (e *engine) replaceCabinPrices(ctx context.Context, sailingID string, prices []cruise.CabinPrice, currency *string, providerLocale string, now time.Time) error {
	rows := cruise.ToCabinPrices(prices, deref(currency), providerLocale)
	if len(rows) == 0 {
		return nil
	}
	stamp := js.ISOString(now)
	out := make([]js.Ordered, len(rows))
	for i, r := range rows {
		out[i] = spread(cabinFields(r), "id", uuid.NewAt(now), "sailing_id", sailingID, "updated_at", stamp)
	}
	if err := e.db.upsertCabinPrices(ctx, out); err != nil {
		return fmt.Errorf("cabin price upsert failed: %w", err)
	}
	return nil
}

// upsert writes reference rows (cruise_line, cruise_ship, cruise_port) on their natural key,
// after dropping in-batch duplicates and reusing the ids the stored rows already hold.
func (e *engine) upsert(ctx context.Context, table string, rows []js.Ordered, onConflict string) (int64, error) {
	deduped := dedupeByConflictKey(rows, onConflict)
	if len(deduped) == 0 {
		return 0, nil
	}
	prepared, err := e.withExistingIDs(ctx, table, deduped, onConflict)
	if err != nil {
		return 0, err
	}
	if err := e.db.upsert(ctx, table, prepared, onConflict); err != nil {
		return 0, fmt.Errorf("%s upsert failed: %w", table, err)
	}
	return int64(len(prepared)), nil
}

func conflictColumns(onConflict string) []string {
	var cols []string
	for _, c := range strings.Split(onConflict, ",") {
		if c = strings.TrimSpace(c); c != "" {
			cols = append(cols, c)
		}
	}
	return cols
}

// keyValue is one key column's value as JSON would read it (`row[c] ?? null`).
func keyValue(v any) js.Value {
	switch t := v.(type) {
	case nil:
		return js.NullValue()
	case string:
		return js.StringValue(t)
	case *string:
		if t == nil {
			return js.NullValue()
		}
		return js.StringValue(*t)
	case js.Value:
		if t.IsUndefined() {
			return js.NullValue()
		}
		return t
	default:
		b, err := js.Marshal(t)
		if err != nil {
			return js.NullValue()
		}
		parsed, err := js.Parse(b)
		if err != nil {
			return js.NullValue()
		}
		return parsed
	}
}

// keyOf is `JSON.stringify(columns.map((c) => row[c] ?? null))`: null and the string "null"
// stay distinguishable, and a separator inside a port name cannot collide.
func keyOf(row js.Ordered, cols []string) string {
	vals := make([]js.Value, len(cols))
	for i, c := range cols {
		v, _ := field(row, c)
		vals[i] = keyValue(v)
	}
	b, _ := js.ArrayValue(vals...).MarshalJSON()
	return string(b)
}

func keyOfStored(row js.Value, cols []string) string {
	vals := make([]js.Value, len(cols))
	for i, c := range cols {
		vals[i] = keyValue(row.Get(c))
	}
	b, _ := js.ArrayValue(vals...).MarshalJSON()
	return string(b)
}

// dedupeByConflictKey drops rows repeating a conflict key WITHIN one batch, keeping the last
// (at the first one's position, as a Map does). Postgres refuses an INSERT ... ON CONFLICT DO
// UPDATE that names the same target twice ("cannot affect row a second time", 21000), and
// refuses the WHOLE statement: the live /filter-options response repeats port names, and it
// took down the first real reference sync.
func dedupeByConflictKey(rows []js.Ordered, onConflict string) []js.Ordered {
	cols := conflictColumns(onConflict)
	if len(cols) == 0 {
		return rows
	}
	var order []string
	byKey := map[string]js.Ordered{}
	for _, row := range rows {
		k := keyOf(row, cols)
		if _, seen := byKey[k]; !seen {
			order = append(order, k)
		}
		byKey[k] = row
	}
	out := make([]js.Ordered, 0, len(order))
	for _, k := range order {
		out = append(out, byKey[k])
	}
	return out
}

// keyPageSize pages the reference tables' (id + key) columns.
const keyPageSize = 1000

// withExistingIDs replaces each row's freshly minted `id` with the id the stored row already
// has.
//
// WITHOUT THIS, EVERY RE-SYNC SILENTLY REWRITES PRIMARY KEYS: PostgREST's upsert compiles to
// ON CONFLICT (...) DO UPDATE SET over every column in the payload, `id` included. Invisible
// until anything references the id; then 23503 on cruise_port_call's foreign key, and it never
// recovers, because a scope that throws never advances its cursor.
//
// The whole table's (id + key) columns are paged rather than filtered by the batch's keys: one
// /filter-options response carries 4,566 ports, a URL PostgREST rejects. Paged because
// PostgREST silently caps an unbounded select, and a cap would look exactly like "no existing
// row", the bug this exists to prevent.
func (e *engine) withExistingIDs(ctx context.Context, table string, rows []js.Ordered, onConflict string) ([]js.Ordered, error) {
	cols := conflictColumns(onConflict)
	if len(cols) == 0 {
		return rows, nil
	}
	existing := map[string]string{}
	columns := strings.Join(append([]string{"id"}, cols...), ",")
	for from := 0; ; from += keyPageSize {
		page, err := e.db.keyPage(ctx, table, columns, from, from+keyPageSize-1)
		if err != nil {
			return nil, fmt.Errorf("%s id lookup failed: %w", table, err)
		}
		for _, raw := range page {
			row, err := js.Parse(raw)
			if err != nil {
				continue
			}
			if id, ok := row.Get("id").Str(); ok {
				existing[keyOfStored(row, cols)] = id
			}
		}
		if len(page) < keyPageSize {
			break
		}
	}
	out := make([]js.Ordered, len(rows))
	for i, row := range rows {
		if id, ok := existing[keyOf(row, cols)]; ok {
			out[i] = spread(row, "id", id)
		} else {
			out[i] = row
		}
	}
	return out, nil
}

// archive soft-archives rows this provider stopped returning. Only ever called after a
// COMPLETE pass, and only for rows this provider owns: a curated row (null provider) is
// nobody's to archive.
func (e *engine) archive(ctx context.Context, table, stamp string) (int64, error) {
	n, err := e.db.archiveMissing(ctx, table, stamp)
	if err != nil {
		return 0, fmt.Errorf("%s archive failed: %w", table, err)
	}
	return n, nil
}

// resolveLineID is provider company -> our cruise_line id. Deliberately not cached: an id is
// exactly what can go stale between runs.
func (e *engine) resolveLineID(ctx context.Context, company string) (*string, error) {
	id, err := e.db.lineIDBySlug(ctx, cruise.CompanyToSlug(company))
	if err != nil {
		return nil, fmt.Errorf("cruise_line lookup failed: %w", err)
	}
	return id, nil
}

// resolveShipID is ship name -> id, creating a stub row when the ship catalogue has not been
// synced (the /ships scope is off on the free tier). A later /ships pass fills in the counts
// by upserting the same natural key.
func (e *engine) resolveShipID(ctx context.Context, lineID, company, shipName string, now time.Time) (*string, error) {
	id, err := e.db.shipID(ctx, lineID, shipName)
	if err != nil {
		return nil, fmt.Errorf("cruise_ship lookup failed: %w", err)
	}
	if truthy(id) {
		return id, nil
	}
	stamp := js.ISOString(now)
	created, err := e.db.createShip(ctx, js.O(
		"id", uuid.NewAt(now),
		"cruise_line_id", lineID,
		"name", shipName,
		"slug", nil,
		"provider", cruise.Provider,
		// The PROVIDER's identifier, not the line uuid, so /ships can upsert onto this row.
		"provider_key", cruise.ShipProviderKey(company, shipName),
		"synced_at", stamp,
		"last_seen_at", stamp,
		"updated_at", stamp,
	))
	if err != nil {
		return nil, fmt.Errorf("cruise_ship create failed: %w", err)
	}
	return created, nil
}

// resolvePortIDs is port name -> id, creating the ports an itinerary names before any /ports
// pass has (sailing_count stays unset: we did not measure it).
func (e *engine) resolvePortIDs(ctx context.Context, names []string, now time.Time) (map[string]string, error) {
	unique := orderedSet{}
	for _, n := range names {
		unique.add(n)
	}
	found := map[string]string{}
	if len(unique.items) == 0 {
		return found, nil
	}
	rows, err := e.db.portsByName(ctx, unique.items)
	if err != nil {
		return nil, fmt.Errorf("cruise_port lookup failed: %w", err)
	}
	for _, r := range rows {
		found[r.Name] = r.ID
	}
	var missingRows []js.Ordered
	stamp := js.ISOString(now)
	for _, n := range unique.items {
		if _, ok := found[n]; ok {
			continue
		}
		missingRows = append(missingRows, spread(portFields(cruise.MapPort(n, js.UndefinedValue())),
			"id", uuid.NewAt(now),
			"synced_at", stamp,
			"last_seen_at", stamp,
			"updated_at", stamp,
		))
	}
	if len(missingRows) == 0 {
		return found, nil
	}
	created, err := e.db.createPorts(ctx, missingRows)
	if err != nil {
		return nil, fmt.Errorf("cruise_port create failed: %w", err)
	}
	for _, r := range created {
		found[r.Name] = r.ID
	}
	return found, nil
}

// ---- refetch ----

// refetchResult is RefetchResult, the reply of the demand-driven branch.
type refetchResult struct {
	SailingID          string
	CruiseID           *string
	Company            *string
	CabinPricesWritten int
	PortCallsWritten   int
	LeadPriceCents     *int64
	Currency           *string
	Budget             Budget
	// Skipped is set when no request was spent (or the market differed), with the reason.
	Skipped *string
}

func (r refetchResult) object() js.Ordered {
	o := js.O(
		"sailingId", r.SailingID,
		"cruiseId", r.CruiseID,
		"company", r.Company,
		"cabinPricesWritten", r.CabinPricesWritten,
		"portCallsWritten", r.PortCallsWritten,
		"leadPriceCents", r.LeadPriceCents,
		"currency", r.Currency,
		"budget", r.Budget,
	)
	if r.Skipped != nil {
		o = append(o, js.Field{Key: "skipped", Value: *r.Skipped})
	}
	return o
}

// refetchSailing refetches one sailing from GET /cruises/{id} and stores what only that
// endpoint returns: `cabin_prices_per_person`.
//
// NOT A SCOPE. Demand-driven: a client pointed at a sailing and asked to be quoted, and the
// ~10 requests the ceiling holds back are held for exactly this. Its ledger row has a NULL
// run_id (it belongs to no run), and month-to-date counts it.
//
// REFUSES RATHER THAN OVERSPENDS: with the budget gone it returns `skipped` and spends
// nothing, and the caller falls back on the mirrored row.
func (e *engine) refetchSailing(ctx context.Context, sailingID string, now time.Time) (refetchResult, error) {
	sailing, err := e.db.sailingByID(ctx, sailingID)
	if err != nil {
		return refetchResult{}, fmt.Errorf("cruise_sailing lookup failed: %w", err)
	}
	if sailing == nil {
		return refetchResult{}, problem.NotFound("No such sailing.")
	}

	// The provider's own company slug, which /cruises/{id} needs to disambiguate an id
	// (Princess and Holland America share the Y731 voyage-code format).
	company, err := e.db.lineProviderKey(ctx, sailing.CruiseLineID)
	if err != nil {
		return refetchResult{}, fmt.Errorf("cruise_line lookup failed: %w", err)
	}
	budget, err := e.readBudget(ctx)
	if err != nil {
		return refetchResult{}, err
	}

	if !truthy(company) {
		// A curated line has no provider company, so there is nothing to refetch against.
		skipped := "the sailing's line has no provider coverage"
		return refetchResult{SailingID: sailingID, CruiseID: sailing.ProviderKey, Budget: budget, Skipped: &skipped}, nil
	}
	if budget.Allowance <= 0 {
		skipped := exhaustionReason(budget)
		return refetchResult{SailingID: sailingID, CruiseID: sailing.ProviderKey, Company: company, Budget: budget, Skipped: &skipped}, nil
	}

	// run_id null: this request belongs to no sync run.
	record := e.recorder(nil)
	client, err := e.newClient(record)
	if err != nil {
		return refetchResult{}, err
	}
	item, err := client.Cruise(ctx, jsString(sailing.ProviderKey), *company)
	if err != nil {
		return refetchResult{}, err
	}
	afterQuota := applyQuota(budget, item.Quota)
	detail := item.Data

	mapped := cruise.MapSailing(detail)
	if mapped == nil {
		return refetchResult{}, fmt.Errorf("provider returned an unusable sailing for %s/%s", *company, jsString(sailing.ProviderKey))
	}

	stamp := js.ISOString(now)
	var shipID *string
	if mapped.ShipName != nil {
		id, err := e.resolveShipID(ctx, sailing.CruiseLineID, *company, *mapped.ShipName, now)
		if err != nil {
			return refetchResult{}, err
		}
		shipID = id
	}

	// THE LOCALE TRAP. GET /cruises/{id} takes NO `locale`, so it answers in whatever market
	// the provider defaults to (an en_US/USD sailing came back de_DE/EUR). Writing that back
	// would replace a US fare with a European one and rewrite `provider_locale`, part of the
	// natural key, so the next sync would insert a SECOND row. So `provider_locale` is never
	// written here, and the market-dependent fields only when the market is the same.
	sameMarket := sailing.ProviderLocale != nil && *sailing.ProviderLocale == mapped.ProviderLocale

	// Keyed on the id we already hold; `id` is not in the payload (rewriting the key would
	// break its port calls), and `provider_locale` is absent for the reason above.
	patch := js.O(
		"ship_id", shipID,
		"title", mapped.Title,
		"departure_date", mapped.DepartureDate,
		"duration_nights", mapped.DurationNights,
		"destinations", mapped.Destinations,
		"itinerary_url", mapped.ItineraryURL,
		"provider_updated_at", mapped.ProviderUpdatedAt,
		"provider_payload", detail.Raw,
		"synced_at", stamp,
		"last_seen_at", stamp,
		"updated_at", stamp,
	)
	if sameMarket {
		patch = append(patch, js.O(
			"lead_price_cents", mapped.LeadPriceCents,
			"currency", mapped.Currency,
			"lead_price_eur_cents", mapped.LeadPriceEurCents,
		)...)
	}
	if err := e.db.updateSailing(ctx, sailingID, patch); err != nil {
		return refetchResult{}, fmt.Errorf("cruise_sailing refresh failed: %w", err)
	}

	// The detail endpoint carries the full ordered itinerary; refreshing costs nothing now the
	// request is spent.
	if err := e.replacePortCalls(ctx, sailingID, detail.PortsList, now); err != nil {
		return refetchResult{}, err
	}

	// Cabin prices ARE stored even when the market differs, labelled with the locale they came
	// back in: the detail endpoint always answers de_DE/EUR, so "same market only" would mean
	// an empty table forever for a US advisory. The absolute figure comes from InteleTravel at
	// quote time regardless (BRD §10.5: nothing here is ever charged).
	cabinRows := cruise.ToCabinPrices(detail.CabinPricesPerPerson, deref(mapped.Currency), mapped.ProviderLocale)
	if err := e.replaceCabinPrices(ctx, sailingID, detail.CabinPricesPerPerson, mapped.Currency, mapped.ProviderLocale, now); err != nil {
		return refetchResult{}, err
	}

	r := refetchResult{
		SailingID:          sailingID,
		CruiseID:           sailing.ProviderKey,
		Company:            company,
		CabinPricesWritten: len(cabinRows),
		PortCallsWritten:   len(cruise.ToPortCalls(detail.PortsList)),
		Budget:             afterQuota,
	}
	if sameMarket {
		r.LeadPriceCents = mapped.LeadPriceCents
		r.Currency = mapped.Currency
	} else {
		skipped := "provider answered in " + mapped.ProviderLocale + ", not the row's " + jsString(sailing.ProviderLocale) +
			" \U00002014 the sailing's own lead fare was left untouched. Cabin prices were stored, tagged " +
			mapped.ProviderLocale + ". The detail endpoint takes no locale parameter and ignores one."
		r.Skipped = &skipped
	}
	return r, nil
}

// ---- small helpers ----

// isoDateAfter is isoDate(new Date(now + days * 86_400_000)): the UTC calendar date, or
// JavaScript's RangeError past the Date range (±8.64e15 ms).
func isoDateAfter(now time.Time, days int64) (string, error) {
	ms := now.UnixMilli() + days*86_400_000
	if ms > 8_640_000_000_000_000 || ms < -8_640_000_000_000_000 {
		// V8's RangeError text, kept: describe() stores it in the run's error_detail.
		//lint:ignore ST1005 the stored sentence is Deno's, byte for byte
		return "", errors.New("Invalid time value")
	}
	t := time.UnixMilli(ms).UTC()
	if y := t.Year(); y < 0 || y > 9999 {
		// toISOString's expanded years: "+010000-01-01T..." sliced to ten characters.
		sign := "+"
		if y < 0 {
			sign, y = "-", -y
		}
		return (sign + fmt.Sprintf("%06d", y) + t.Format("-01-02"))[:10], nil
	}
	return t.Format("2006-01-02"), nil
}

// truthy is a JavaScript truthiness test on a nullable string.
func truthy(p *string) bool { return p != nil && *p != "" }

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// jsString is `${value}` for a nullable string: null prints as "null".
func jsString(p *string) string {
	if p == nil {
		return "null"
	}
	return *p
}

// orderedSet is a Set<string>: insertion order, no repeats.
type orderedSet struct {
	items []string
	seen  map[string]bool
}

func (s *orderedSet) add(v string) {
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	if !s.seen[v] {
		s.seen[v] = true
		s.items = append(s.items, v)
	}
}

func (s *orderedSet) join(sep string) string { return strings.Join(s.items, sep) }
