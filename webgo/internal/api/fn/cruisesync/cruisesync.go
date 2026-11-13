// Package cruisesync ports supabase/functions/cruise-sync and its engine,
// _shared/cruise/sync.ts and budget.ts: the job that refreshes the cruise catalog from
// track.cruises (P2). It writes cruise_line, cruise_ship, cruise_port, cruise_sailing,
// cruise_port_call and cruise_sailing_cabin_price, and reads what it may fetch from
// cruise_sync_scope.
//
// THIS FUNCTION HAS NO HUMAN CALLER. pg_cron invokes it through public.cruise_sync_tick(). In
// Deno the gate was requireServiceRole (the token's role claim had to be service_role); in Go
// it is the registry's GateCron, STA_CRON_SECRET in constant time, checked before this code
// runs (ruling 13). A logged-in traveler must not be able to spend a metered monthly budget by
// curling a URL.
//
// THE BUDGET IS THE POINT. The provider's free tier is 100 requests a MONTH, and an overspent
// month cannot be bought back: the ledger in cruise_api_request, the per-request re-check, the
// ceiling below the plan limit and trusting the relay's header over our own count all exist
// for that (budget.go, §24.9). A run that does nothing because the budget is gone is 200 with
// status "skipped": late in a month on the free tier that is the expected outcome.
//
// THE PROVIDER IS NEVER CALLED BY A TEST. The transport is injected (Options.HTTP), and the
// tests use fakes, as the Deno tests stubbed fetch.
package cruisesync

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/cruise"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	// runTimeout bounds one run (Go only). The tick's pg_net call gives up after 10 seconds
	// and a run can take longer, so the run does NOT follow the request's context (a hang-up
	// would otherwise abandon it mid-scope with its row at `running`); it gets its own,
	// bounded, and always closes its row. Inside the 10-minute overlap window and well short
	// of the watchdog's 30-minute stranded sweep.
	runTimeout = 5 * time.Minute
	// closeTimeout bounds the writes that must land even after the run's own time is up: the
	// run row's close and the audit row.
	closeTimeout = 30 * time.Second
)

// Options configures New.
type Options struct {
	// HTTP is the transport to track.cruises. Nil gets a dedicated client (never
	// http.DefaultClient); either way the cruise client copies it and never follows
	// redirects. Each attempt is bounded by the cruise client's own 15-second timeout.
	HTTP *http.Client
}

// Func is the function, with the production transport.
var Func = New(Options{})

// New builds the function around a transport.
func New(o Options) edge.Func {
	hc := o.HTTP
	if hc == nil {
		hc = &http.Client{}
	}
	return func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
		e := &engine{db: dbStore{d.DB}, http: hc, clock: d.Now, log: d.Log, env: d.Env}
		return e.handle(r)
	}
}

// handle is the Deno handler after its gate (requireServiceRole is the registry's GateCron):
// the method, the body, the key, in that order, then the run or the refetch.
func (e *engine) handle(r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		// GET is refused rather than treated as a dry run: a sync is a mutation that spends
		// money, and a link-preview crawler must not be able to trigger one.
		return nil, problem.Forbidden("Use POST to run the cruise sync.")
	}
	in, err := readBody(r)
	if err != nil {
		return nil, err
	}
	e.apiKey = e.env("TRACK_CRUISES_API_KEY")
	if e.apiKey == "" {
		// Distinguished from a budget skip on purpose: "nobody configured this" and "the
		// month is spent" need different responses from whoever reads the log.
		return nil, problem.Forbidden("TRACK_CRUISES_API_KEY is not set in the function environment. " +
			"See supabase/README.md.")
	}
	e.ceiling = monthlyCeiling(e.env("CRUISE_SYNC_MONTHLY_CEILING"))
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), runTimeout)
	defer cancel()
	return e.serve(ctx, in)
}

// input is readBody's result.
type input struct {
	trigger string // "cron" unless the caller says "manual"
	// scope narrows a manual run to one cruise_sync_scope label: the unit of cost is one
	// HTTP request, and verifying one scope should not spend the others'. "" for none.
	scope string
	// sailingID asks for the demand-driven refetch of one sailing. "" for none.
	sailingID string
}

// readBody: `cron` unless the caller says otherwise, because pg_cron is the normal path and
// its body is {"trigger":"cron"}. A malformed or absent body is not worth failing a run over.
func readBody(r *http.Request) (input, error) {
	in := input{trigger: "cron"}
	b, err := edge.Body(r)
	if err != nil {
		return in, nil
	}
	body, err := js.Parse(b)
	if err != nil {
		return in, nil
	}
	if s, ok := body.Get("trigger").Str(); ok && s == "manual" {
		in.trigger = "manual"
	}
	if s, ok := body.Get("scope").Str(); ok && js.Trim(s) != "" {
		in.scope = js.Trim(s)
	}
	if v := body.Get("sailingId"); !v.IsUndefined() {
		// Validated here rather than deeper: a malformed id must not reach a query, and it
		// must never reach the provider (a wasted request cannot be refunded).
		s, ok := v.Str()
		if !ok || !uuid.IsUUID(s) {
			return input{}, problem.BadRequest("sailingId must be a UUID.")
		}
		in.sailingID = s
	}
	return in, nil
}

// engine is one invocation's dependencies.
type engine struct {
	db     store
	apiKey string
	http   *http.Client
	// clock is `new Date()` (the budget month, the run row's close, ledger ids); a run's own
	// `now` is passed in.
	clock   func() time.Time
	log     *slog.Logger
	env     func(string) string
	ceiling int64
	// sleep overrides the cruise client's backoff wait (tests). Nil is the real wait.
	sleep func(ctx context.Context, d time.Duration) error
}

func (e *engine) serve(ctx context.Context, in input) (*edge.Reply, error) {
	now := e.clock()

	// Demand-driven branch: refetch ONE sailing rather than run the schedule. GET
	// /cruises/{id} is the only place cabin prices exist, so this is what a quote request
	// needs. It spends from the ~10 requests the ceiling holds back, writes a ledger row with
	// a null run_id, and refuses rather than overspends.
	if in.sailingID != "" {
		result, err := e.refetchSailing(ctx, in.sailingID, now)
		if err != nil {
			return nil, err
		}
		var skipped any
		if result.Skipped != nil {
			skipped = *result.Skipped
		}
		if err := e.writeAudit(ctx, audit.Spec{
			EventType:    "cruise_sailing.refetched",
			TargetEntity: "cruise_sailing",
			TargetID:     in.sailingID,
			Metadata: js.O(
				"cruiseId", result.CruiseID,
				"company", result.Company,
				"cabinPricesWritten", result.CabinPricesWritten,
				"portCallsWritten", result.PortCallsWritten,
				"skipped", skipped,
				"monthToDateSpend", result.Budget.LedgerSpent,
				"quotaRemaining", result.Budget.QuotaRemaining,
			),
		}); err != nil {
			return nil, err
		}
		return edge.OK(result.object())
	}

	out, err := e.runSync(ctx, syncOptions{trigger: in.trigger, onlyLabel: in.scope, now: now})
	if err != nil {
		return nil, err
	}

	// One audit row per RUN, with counts in metadata, never one per sailing: the cruise tables
	// are not on rule 3's sensitive list, and cruise_sync_run holds the detail.
	scope := any(js.Undef)
	if in.scope != "" {
		scope = in.scope
	}
	if err := e.writeAudit(ctx, audit.Spec{
		EventType:    "cruise.synced",
		TargetEntity: "cruise_sync_run",
		TargetID:     out.RunID,
		Metadata: js.O(
			"trigger", in.trigger,
			"scope", scope,
			"status", out.Status,
			"scopesRun", out.ScopesRun,
			"requestsSpent", out.RequestsSpent,
			"rowsUpserted", out.RowsUpserted,
			"rowsArchived", out.RowsArchived,
			"monthToDateSpend", out.Budget.LedgerSpent,
			"ceiling", out.Budget.Ceiling,
			"quotaRemaining", out.Budget.QuotaRemaining,
			// Positive means quota was spent that our ledger never saw: another environment
			// sharing the key, or the billing cycle not matching the calendar month.
			"quotaDrift", out.Budget.Drift,
			"notes", out.Notes,
		),
	}); err != nil {
		return nil, err
	}

	return edge.OK(js.O(
		"runId", out.RunID,
		"status", out.Status,
		"scopesRun", out.ScopesRun,
		"requestsSpent", out.RequestsSpent,
		"rowsUpserted", out.RowsUpserted,
		"rowsArchived", out.RowsArchived,
		"budget", js.O(
			"monthToDateSpend", out.Budget.LedgerSpent,
			"ceiling", out.Budget.Ceiling,
			"allowanceRemaining", out.Budget.Allowance,
			"providerRemaining", out.Budget.QuotaRemaining,
			"drift", out.Budget.Drift,
		),
		"notes", out.Notes,
	))
}

// writeAudit is writeSystemAuditEvent (no actor: the caller is a machine). Its error fails
// the request, as the Deno throw did. On a context of its own, like the run row's close.
func (e *engine) writeAudit(ctx context.Context, spec audit.Spec) error {
	actx, cancel := context.WithTimeout(context.WithoutCancel(ctx), closeTimeout)
	defer cancel()
	return audit.WriteSystem(actx, e.db, spec)
}

// newClient builds the track.cruises client for one run (or one refetch), with onRequest
// called for every attempt.
func (e *engine) newClient(onRequest func(ctx context.Context, r cruise.RequestRecord)) (*cruise.Client, error) {
	return cruise.NewClient(cruise.ClientOptions{
		APIKey: e.apiKey,
		HTTP:   e.http,
		Sleep:  e.sleep,
		OnRequest: func(ctx context.Context, r cruise.RequestRecord) error {
			onRequest(ctx, r)
			return redirectStop(r)
		},
	})
}

// redirectStop ends a request the provider answered with a redirect.
//
// DECISION (Track B, 2026-11-07): the Go client never follows a redirect, and a 3xx from the
// provider is PERMANENT for the run: the request is not retried, and the run stops after the
// scope that got it. A followed redirect would carry the RapidAPI key to whatever host the
// Location names; a retry would spend the monthly budget on an answer a retry cannot change.
// The cruise client reports a 3xx as `http_3xx` but treats it as transient (it retries), so
// the stop is made here: an error from the OnRequest hook ends the request at once, after the
// ledger row is written. (Deno's fetch followed redirects, so Deno has no such path.)
func redirectStop(r cruise.RequestRecord) error {
	if r.StatusCode == nil || *r.StatusCode < 300 || *r.StatusCode > 399 {
		return nil
	}
	te := &cruise.TrackCruisesError{
		Status:            r.StatusCode,
		Code:              "http_" + js.NumberString(float64(*r.StatusCode)),
		Detail:            "HTTP " + js.NumberString(float64(*r.StatusCode)),
		Permanent:         true,
		ProviderRequestID: r.ProviderRequestID,
		Quota:             r.Quota,
	}
	if r.ErrorCode != nil {
		te.Code = *r.ErrorCode
	}
	if r.ErrorDetail != nil {
		te.Detail = *r.ErrorDetail // already redacted by the client
	}
	return te
}

// warn logs a swallowed write failure: the message and the error's label (the text before
// its first ": ", plus the database code), never a body or a value.
func (e *engine) warn(msg string, err error) {
	if e.log == nil {
		return
	}
	label, _, _ := strings.Cut(err.Error(), ": ")
	args := []any{"function", "cruise-sync", "error", label}
	var se *service.Error
	if errors.As(err, &se) {
		args = append(args, "db_code", se.Code, "db_status", se.Status)
	}
	e.log.Warn(msg, args...)
}

// discardLog is a logger for engines built without one.
var discardLog = slog.New(slog.NewTextHandler(io.Discard, nil))
