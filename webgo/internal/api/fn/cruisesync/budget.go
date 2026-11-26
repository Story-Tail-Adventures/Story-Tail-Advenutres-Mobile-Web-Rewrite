package cruisesync

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/cruise"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Request accounting for the cruise sync (budget.ts, Data-Model §24.9).
//
// The provider's free tier is 100 requests a month; overspend and the catalogue stops
// refreshing until the cycle turns, with no way to buy the month back.
//
// TWO CLOCKS, AND THEY DO NOT AGREE. Our ledger counts calendar months (the only boundary a
// SQL query can see); RapidAPI counts the subscription billing cycle. So OUR COUNT IS A
// PRE-FLIGHT GUARD, THE HEADER IS THE TRUTH: whenever x-ratelimit-requests-remaining is lower
// than our ledger implies, the header wins, the drift is recorded, and the run stops.
//
// The ceiling is deliberately below the plan limit. The reserve is for the quote-time detail
// fetch, which must not find the tank empty because a background job drank it.

// DefaultMonthlyCeiling is 90 of the free tier's 100, leaving 10 for quote-time detail
// fetches and manual runs. CRUISE_SYNC_MONTHLY_CEILING overrides it when the plan changes.
const DefaultMonthlyCeiling = 90

// monthlyCeiling is `Number.parseInt(raw, 10)` when finite and positive, else the default.
// (A ceiling past 2^53 is clamped there; JavaScript would have carried an inexact float.)
func monthlyCeiling(raw string) int64 {
	if raw == "" {
		return DefaultMonthlyCeiling
	}
	n, ok := parseIntJS(raw)
	if !ok || n <= 0 {
		return DefaultMonthlyCeiling
	}
	return n
}

// parseIntJS is Number.parseInt(s, 10): leading JavaScript whitespace, an optional sign, then
// the digits up to the first non-digit. No digits is NaN (false).
func parseIntJS(s string) (int64, bool) {
	s = js.TrimStart(s)
	neg := false
	if s != "" && (s[0] == '+' || s[0] == '-') {
		neg = s[0] == '-'
		s = s[1:]
	}
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0, false
	}
	f, _ := strconv.ParseFloat(s[:end], 64)
	if f > js.MaxSafeInteger {
		f = js.MaxSafeInteger
	}
	if neg {
		f = -f
	}
	return int64(f), true
}

// Budget is budget.ts's Budget. Its JSON is the object refetchSailing's reply carries, keys in
// the order the Deno object had them.
type Budget struct {
	// LedgerSpent is our own count for the current calendar month. A guard, not the truth.
	LedgerSpent int64 `json:"ledgerSpent"`
	Ceiling     int64 `json:"ceiling"`
	// QuotaRemaining is the most recent x-ratelimit-requests-remaining we have seen.
	QuotaRemaining *int64 `json:"quotaRemaining"`
	QuotaLimit     *int64 `json:"quotaLimit"`
	// Allowance is the requests this run may still make: the smaller of what our ceiling
	// allows and what the relay says is left.
	Allowance int64 `json:"allowance"`
	// Drift is (limit - remaining) - ledgerSpent. Positive means quota was spent that our
	// ledger never saw: another environment sharing the key, or the cycle not lining up.
	Drift *int64 `json:"drift"`
}

// monthStart is the UTC first of the month. The ledger index is on created_at, so this is a
// range scan.
func monthStart(now time.Time) string {
	u := now.UTC()
	return js.ISOString(time.Date(u.Year(), u.Month(), 1, 0, 0, 0, 0, time.UTC))
}

// readBudget is the pre-flight read: what this calendar month has cost, and what the relay
// last said. The stored quota figure is only trusted within the current month; past that it
// describes a cycle that has certainly turned over.
func (e *engine) readBudget(ctx context.Context) (Budget, error) {
	since := monthStart(e.clock())
	count, err := e.db.countRequestsSince(ctx, since)
	if err != nil {
		return Budget{}, fmt.Errorf("cruise budget read failed: %w", err)
	}
	latest, err := e.db.latestQuotaSince(ctx, since)
	if err != nil {
		return Budget{}, fmt.Errorf("cruise quota read failed: %w", err)
	}
	b := Budget{LedgerSpent: count, Ceiling: e.ceiling}
	if latest != nil {
		b.QuotaRemaining = latest.QuotaRemaining
		b.QuotaLimit = latest.QuotaLimit
	}
	return finalise(b), nil
}

// applyQuota folds a fresh response's headers into the budget. Called after every request,
// so the run reacts to the relay's own number rather than to its own counting.
func applyQuota(b Budget, q cruise.QuotaSnapshot) Budget {
	b.LedgerSpent++
	if q.Remaining != nil {
		b.QuotaRemaining = q.Remaining
	}
	if q.Limit != nil {
		b.QuotaLimit = q.Limit
	}
	return finalise(b)
}

func finalise(b Budget) Budget {
	byCeiling := max(0, b.Ceiling-b.LedgerSpent)
	// The header wins whenever it is stricter. It is never used to grant MORE than the
	// ceiling: the reserve for quote-time fetches has to survive a generous-looking header.
	b.Allowance = byCeiling
	if b.QuotaRemaining != nil {
		b.Allowance = max(0, min(byCeiling, *b.QuotaRemaining))
	}
	b.Drift = nil
	if b.QuotaLimit != nil && b.QuotaRemaining != nil {
		d := (*b.QuotaLimit - *b.QuotaRemaining) - b.LedgerSpent
		b.Drift = &d
	}
	return b
}

// exhaustionReason is the human-readable reason a run stopped or was skipped.
func exhaustionReason(b Budget) string {
	if b.QuotaRemaining != nil && *b.QuotaRemaining <= 0 {
		return "provider reports no requests remaining on the plan"
	}
	if b.LedgerSpent >= b.Ceiling {
		return fmt.Sprintf("monthly ceiling reached (%d/%d this month)", b.LedgerSpent, b.Ceiling)
	}
	remaining := "unknown"
	if b.QuotaRemaining != nil {
		remaining = strconv.FormatInt(*b.QuotaRemaining, 10)
	}
	return fmt.Sprintf("no allowance left (ceiling %d, relay remaining %s)", b.Ceiling, remaining)
}

// recorder is makeRecorder: one ledger row per attempt, for the client's OnRequest.
//
// It deliberately swallows its own write errors. Losing a whole sync run because an
// observability insert failed is the wrong trade, and the request it describes has already
// been spent either way. It logs instead (the endpoint and the error's label, never a body).
func (e *engine) recorder(runID *string) func(ctx context.Context, r cruise.RequestRecord) {
	return func(ctx context.Context, r cruise.RequestRecord) {
		row := js.O(
			"id", uuid.NewAt(e.clock()),
			"run_id", runID,
			"endpoint", string(r.Endpoint),
			"path", r.Path,
			"query", r.Query,
			"status_code", r.StatusCode,
			"rows_returned", r.RowsReturned,
			"duration_ms", r.DurationMs,
			"provider_request_id", r.ProviderRequestID,
			"quota_limit", r.Quota.Limit,
			"quota_remaining", r.Quota.Remaining,
			"quota_reset_seconds", r.Quota.ResetSeconds,
			"error_code", r.ErrorCode,
			"error_detail", r.ErrorDetail,
		)
		if err := e.db.insertRequest(ctx, row); err != nil {
			e.warn("cruise_api_request insert failed for "+string(r.Endpoint), err)
		}
	}
}
