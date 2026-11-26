// Package cruise ports the pure parts of supabase/functions/_shared/cruise/: the track.cruises
// response shapes (types.ts -> types.go), its HTTP client (client.ts -> client.go) and the
// provider-payload-to-row mapping (map.ts -> map.go, with slugtable.go).
//
// Not ported here (needs the database / network; ported with its function):
//   - cruise/budget.ts: the request ledger and the quota pre-flight, both on Db.
//   - cruise/public.ts: the public search reads, on Db.
//   - cruise/sync.ts: the sync scopes, which read and upsert through Db.
//
// The client's network access is injected: it takes an *http.Client, so its tests run against
// a fake transport over the committed fixtures (testdata/provider.json), exactly as the Deno
// tests stub fetch.
package cruise

import (
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// track.cruises HTTP client (Free-Travel-APIs §4.8).
//
// Everything odd about this file traces to one fact: the free tier is 100 requests a MONTH,
// and the month does not roll over early because we were careless. So the client is built to
// (a) never spend a request it did not mean to, (b) report what every request cost, and
// (c) fail permanently rather than retry when a retry cannot possibly succeed.
//
// THE RELAY IS NOT THE BACKEND, AND THAT SHOWS UP IN THE ERRORS. All tiers route through
// RapidAPI (`cruise-pricing-api1.p.rapidapi.com`); there is no direct subscription. So:
//   - Errors come in TWO shapes. Their backend returns RFC 9457 problem+json with `code` and
//     `request_id`; the relay, when its own throttle trips or the key is bad, returns
//     `{"message": "..."}` with neither. Both are handled.
//   - `/coverage` is documented "Public, no auth required", true of their backend but NOT of
//     the relay in front of it. It 401s without a key and counts against the quota like
//     everything else. There is no free probe.
//
// THE RELAY CACHES, AND CACHING DOES NOT REFUND. Two identical requests seconds apart come
// back byte-identical (same `request_id` and all) while STILL decrementing the quota. So a
// duplicate `provider_request_id` in the ledger is the relay serving a cached body, and
// re-running to "get fresher data" buys nothing but spends real budget.
//
// THE RELAY ALSO TELLS THE TRUTH ABOUT THE BUDGET, on every response:
// x-ratelimit-requests-limit / -remaining / -reset. That is more trustworthy than any count
// we keep, because quota gets spent from other places. So every response's headers are
// captured and handed to the caller; budget.ts treats them as authoritative and our own
// ledger as a pre-flight guard. See §24.9.

// TrackCruisesHost is the RapidAPI relay's host.
const TrackCruisesHost = "cruise-pricing-api1.p.rapidapi.com"

const baseURL = "https://" + TrackCruisesHost

// SyncEndpoint mirrors the cruise_sync_endpoint enum, so a ledger row is one lookup away.
type SyncEndpoint string

// The endpoints.
const (
	EndpointCruiseLines   SyncEndpoint = "cruise_lines"
	EndpointFilterOptions SyncEndpoint = "filter_options"
	EndpointCoverage      SyncEndpoint = "coverage"
	EndpointShips         SyncEndpoint = "ships"
	EndpointPorts         SyncEndpoint = "ports"
	EndpointCruises       SyncEndpoint = "cruises"
	EndpointCruiseDetail  SyncEndpoint = "cruise_detail"
)

// QuotaSnapshot is the relay's budget headers. Nil is absent (or not a number).
type QuotaSnapshot struct {
	// Limit is x-ratelimit-requests-limit, the plan's monthly cap (100 on BASIC).
	Limit *int64 `json:"limit"`
	// Remaining is x-ratelimit-requests-remaining, authoritative. See budget.ts.
	Remaining *int64 `json:"remaining"`
	// ResetSeconds is x-ratelimit-requests-reset, seconds until the quota resets.
	ResetSeconds *int64 `json:"resetSeconds"`
}

// QueryParam is one request parameter.
type QueryParam struct {
	Key   string
	Value string
}

// Query is the request's parameters in the order they were set. It marshals as the JSON
// object the Deno record carried.
type Query []QueryParam

// Get returns a parameter's value.
func (q Query) Get(key string) (string, bool) {
	for _, p := range q {
		if p.Key == key {
			return p.Value, true
		}
	}
	return "", false
}

// MarshalJSON writes the parameters as one object, keys in order.
func (q Query) MarshalJSON() ([]byte, error) {
	o := make(js.Ordered, 0, len(q))
	for _, p := range q {
		o = append(o, js.Field{Key: p.Key, Value: p.Value})
	}
	return o.MarshalJSON()
}

// RequestRecord is one ledger row's worth of fact, handed to the recorder for EVERY attempt.
type RequestRecord struct {
	Endpoint SyncEndpoint
	Path     string
	// Query is sanitised: request parameters only, never headers, never the key.
	Query             Query
	StatusCode        *int
	RowsReturned      *int
	DurationMs        int64
	ProviderRequestID *string
	Quota             QuotaSnapshot
	ErrorCode         *string
	ErrorDetail       *string
}

// RequestRecorder is called for every attempt, before success or failure is decided. An
// error it returns ends the request with that error.
type RequestRecorder func(ctx context.Context, record RequestRecord) error

// TrackCruisesError is a failed request.
type TrackCruisesError struct {
	// Status is nil when the request never completed (timeout, DNS, reset).
	Status *int
	Code   string
	// Detail is ALREADY REDACTED, at construction rather than at the one call site that
	// writes a ledger row, because it does not stop there: it also reaches
	// cruise_sync_scope.last_error, cruise_sync_run.error_detail, audit_event.metadata.notes
	// and the function's own HTTP response body. Redacting at one of five readers protects one
	// of five.
	Detail string
	// Permanent is true when retrying cannot succeed: bad key, bad request, tier gate.
	Permanent         bool
	RetryAfterSeconds *float64
	RequiredTier      *string
	ProviderRequestID *string
	// Quota is the quota the relay reported on the response that failed. Carried on the
	// error because otherwise it is lost precisely when it matters most: a 429 whose headers
	// say "0 remaining" is the most useful budget signal there is. budget.ts's whole
	// invariant is that the header wins; an error path that drops it breaks that.
	Quota QuotaSnapshot
}

func (e *TrackCruisesError) Error() string { return e.Code + ": " + e.Detail }

// ClientOptions configures NewClient.
type ClientOptions struct {
	APIKey string
	// HTTP is the transport, required, and never http.DefaultClient. The client uses a copy
	// that does not follow redirects (a 3xx comes back as an error, http_3xx), so the key in
	// its header can only ever go to TrackCruisesHost. Its own Timeout, if set, applies too.
	HTTP *http.Client
	// OnRequest is called for every attempt, before success or failure is decided.
	OnRequest RequestRecorder
	// MaxRetries is retries for transient failures only. Nil means 2, i.e. 3 attempts.
	MaxRetries *int
	// Sleep is overridable so tests do not actually wait. It returns the context's error
	// when the wait was cut short.
	Sleep func(ctx context.Context, d time.Duration) error
	// Timeout bounds each attempt (fetch's AbortSignal.timeout). Zero means 15 seconds.
	Timeout time.Duration
	// Now is the clock DurationMs is measured with. Nil means time.Now.
	Now func() time.Time
}

// Client is createTrackCruisesClient's result.
type Client struct {
	apiKey     string
	http       *http.Client
	onRequest  RequestRecorder
	maxRetries int
	sleep      func(context.Context, time.Duration) error
	timeout    time.Duration
	now        func() time.Time
}

// ErrNoHTTPClient is NewClient refusing to fall back to a default transport.
var ErrNoHTTPClient = errors.New("cruise: ClientOptions.HTTP is required, and may not be http.DefaultClient")

// NewClient is createTrackCruisesClient.
func NewClient(opts ClientOptions) (*Client, error) {
	if opts.HTTP == nil || opts.HTTP == http.DefaultClient {
		return nil, ErrNoHTTPClient
	}
	hc := *opts.HTTP
	hc.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	c := &Client{
		apiKey:     opts.APIKey,
		http:       &hc,
		onRequest:  opts.OnRequest,
		maxRetries: 2,
		sleep:      opts.Sleep,
		timeout:    opts.Timeout,
		now:        opts.Now,
	}
	if opts.MaxRetries != nil {
		c.maxRetries = *opts.MaxRetries
	}
	if c.sleep == nil {
		c.sleep = sleepContext
	}
	if c.timeout == 0 {
		c.timeout = 15 * time.Second
	}
	if c.now == nil {
		c.now = time.Now
	}
	return c, nil
}

func sleepContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Page is one page of a list endpoint.
type Page[T any] struct {
	Data    []T
	HasMore bool
	// NextCursor goes back unchanged as StartingAfter. Nil when HasMore is false.
	NextCursor *string
	Quota      QuotaSnapshot
}

// Item is a single-object answer and the quota it cost.
type Item[T any] struct {
	Data  T
	Quota QuotaSnapshot
}

// ListParams are the list endpoints' shared parameters. "" is unset.
type ListParams struct {
	Limit *int
	// StartingAfter is an opaque cursor from a previous page's NextCursor. Their pagination
	// is cursor-only: there is deliberately no page or offset here because there is none
	// there, and passing one is silently ignored, which reads as a stuck loop paying for page
	// one forever.
	StartingAfter string
	Company       string
	Locale        string
}

// CruiseSortOrder is a sort their spec allows. Two of the four matter to us (see
// syncCruises() for which job each does); the bare `departure_date` / `updated_at` forms are
// omitted because they are these same orders spelled shorter.
type CruiseSortOrder string

// The sort orders.
const (
	SortDepartureAsc  CruiseSortOrder = "departure_date:asc"
	SortDepartureDesc CruiseSortOrder = "departure_date:desc"
	SortUpdatedAsc    CruiseSortOrder = "updated_at:asc"
	SortUpdatedDesc   CruiseSortOrder = "updated_at:desc"
)

// CruiseListParams are GET /cruises's parameters. "" is unset.
type CruiseListParams struct {
	ListParams
	Sort            CruiseSortOrder
	DepartureAfter  string
	DepartureBefore string
	Destination     string
	Ship            string
	Port            string
}

func (p ListParams) query() Query {
	limit := ""
	if p.Limit != nil {
		limit = strconv.Itoa(*p.Limit)
	}
	return Query{
		{"limit", limit},
		{"starting_after", p.StartingAfter},
		{"company", p.Company},
		{"locale", p.Locale},
	}
}

// CruiseLines is all ten lines in ONE request. No `limit` parameter, so the tier row-cap does
// not apply; cruise_api_request.rows_returned would reveal it if it silently did.
func (c *Client) CruiseLines(ctx context.Context) (Page[ProviderCruiseLine], error) {
	return listPage(ctx, c, EndpointCruiseLines, "/cruise-lines", nil, DecodeCruiseLine)
}

// FilterOptions is companies, locales, destinations, ship names and ports in one request:
// the cheap route to the vocabularies /ships and /ports charge 10 rows at a time for.
func (c *Client) FilterOptions(ctx context.Context, company string) (Item[ProviderFilterOptions], error) {
	body, quota, err := c.request(ctx, EndpointFilterOptions, "/filter-options", Query{{"company", company}})
	if err != nil {
		return Item[ProviderFilterOptions]{}, err
	}
	// Their spec does not pin whether this endpoint wraps in `data`. Accept both rather than
	// spend a request finding out, then losing it to a shape assumption.
	data := body.Get("data")
	if data.IsNullish() {
		data = body
	}
	return Item[ProviderFilterOptions]{Data: DecodeFilterOptions(data), Quota: quota}, nil
}

// Coverage is GET /coverage.
func (c *Client) Coverage(ctx context.Context, company string) (Page[ProviderCoverage], error) {
	return listPage(ctx, c, EndpointCoverage, "/coverage", Query{{"company", company}}, DecodeCoverage)
}

// Ships is GET /ships.
func (c *Client) Ships(ctx context.Context, params ListParams) (Page[ProviderShip], error) {
	return listPage(ctx, c, EndpointShips, "/ships", params.query(), DecodeShip)
}

// Ports is GET /ports.
func (c *Client) Ports(ctx context.Context, params ListParams) (Page[ProviderPort], error) {
	return listPage(ctx, c, EndpointPorts, "/ports", params.query(), DecodePort)
}

// Cruises is GET /cruises.
func (c *Client) Cruises(ctx context.Context, params CruiseListParams) (Page[ProviderCruise], error) {
	q := append(params.ListParams.query(),
		QueryParam{"sort", string(params.Sort)},
		QueryParam{"departure_after", params.DepartureAfter},
		QueryParam{"departure_before", params.DepartureBefore},
		QueryParam{"destination", params.Destination},
		QueryParam{"ship", params.Ship},
		QueryParam{"port", params.Port},
	)
	return listPage(ctx, c, EndpointCruises, "/cruises", q, DecodeCruise)
}

// Cruise is one sailing, with the `cabin_prices_per_person` the list endpoint omits.
//
// `company` is not optional in practice even though their spec allows omitting it: cruise
// ids are unique only per line, and Princess and Holland America share the `Y731`
// voyage-code format. Omitting it is how you fetch the wrong ship's prices.
func (c *Client) Cruise(ctx context.Context, cruiseID, company string) (Item[ProviderCruise], error) {
	body, quota, err := c.request(ctx, EndpointCruiseDetail, "/cruises/"+encodeURIComponent(cruiseID), Query{{"company", company}})
	if err != nil {
		return Item[ProviderCruise]{}, err
	}
	return Item[ProviderCruise]{Data: DecodeCruise(body.Get("data")), Quota: quota}, nil
}

func listPage[T any](ctx context.Context, c *Client, endpoint SyncEndpoint, path string, q Query, decode func(js.Value) T) (Page[T], error) {
	body, quota, err := c.request(ctx, endpoint, path, q)
	if err != nil {
		return Page[T]{}, err
	}
	items, _ := body.Get("data").Array()
	page := Page[T]{Data: make([]T, 0, len(items)), HasMore: body.Get("has_more").IsTrue(), Quota: quota}
	for _, item := range items {
		page.Data = append(page.Data, decode(item))
	}
	if s, ok := body.Get("next_cursor").Str(); ok {
		page.NextCursor = &s
	}
	return page, nil
}

// timeoutMessage is what Deno's fetch rejects with when AbortSignal.timeout fires (a
// TimeoutError DOMException, Deno 2.9.6). Any other network failure carries Go's own error
// text where Deno carried its runtime's; neither is a sentence anyone reads but the ledger.
const timeoutMessage = "The operation was aborted due to timeout"

func (c *Client) request(ctx context.Context, endpoint SyncEndpoint, path string, query Query) (js.Value, QuotaSnapshot, error) {
	clean := Query{}
	for _, p := range query {
		if p.Value != "" {
			clean = append(clean, p)
		}
	}
	url := baseURL + resolveDots(path)
	if len(clean) > 0 {
		pairs := make([]string, len(clean))
		for i, p := range clean {
			pairs[i] = formEncode(p.Key) + "=" + formEncode(p.Value)
		}
		url += "?" + strings.Join(pairs, "&")
	}

	for attempt := 0; ; attempt++ {
		started := c.now()
		var (
			statusCode        *int
			quota             QuotaSnapshot
			providerRequestID *string
			rowsReturned      *int
			failure           *TrackCruisesError
			body              js.Value
		)

		func() {
			actx, cancel := context.WithTimeout(ctx, c.timeout)
			defer cancel()
			networkError := func(err error) *TrackCruisesError {
				msg := err.Error()
				if errors.Is(err, context.DeadlineExceeded) && actx.Err() != nil && ctx.Err() == nil {
					msg = timeoutMessage
				}
				return &TrackCruisesError{Code: "network_error", Detail: redact(msg, c.apiKey)}
			}
			req, err := http.NewRequestWithContext(actx, http.MethodGet, url, nil)
			if err != nil {
				failure = networkError(err)
				return
			}
			// RapidAPI's two required headers. The key is never logged, never persisted, and
			// never placed in a URL: a query-string key ends up in every access log between
			// here and there.
			req.Header.Set("X-RapidAPI-Key", c.apiKey)
			req.Header.Set("X-RapidAPI-Host", TrackCruisesHost)
			req.Header.Set("Accept", "application/json")
			resp, err := c.http.Do(req)
			if err != nil {
				// Network-level: timeout, DNS, abort. statusCode stays nil, which is exactly
				// what "the request never completed" means in the ledger.
				failure = networkError(err)
				return
			}
			defer resp.Body.Close()
			status := resp.StatusCode
			statusCode = &status
			quota = readQuota(resp.Header)
			raw, err := io.ReadAll(resp.Body)
			if err != nil {
				failure = networkError(err)
				return
			}
			text := decodeText(raw)
			parsed := safeJSONParse(text)
			if status < 200 || status > 299 {
				failure = toError(status, resp.Header, parsed, text, quota, c.apiKey)
				providerRequestID = failure.ProviderRequestID
				return
			}
			body = parsed
			if body.IsNullish() {
				body = js.ObjectValue()
			}
			providerRequestID = extractRequestID(parsed)
			rowsReturned = countRows(parsed)
		}()

		// Record BEFORE judging. A rejected request has usually still been counted by the
		// relay, so a ledger that only wrote successes would drift optimistic in precisely
		// the situation where the number matters. See cruise_api_request.status_code.
		if c.onRequest != nil {
			record := RequestRecord{
				Endpoint:          endpoint,
				Path:              path,
				Query:             clean,
				StatusCode:        statusCode,
				RowsReturned:      rowsReturned,
				DurationMs:        c.now().UnixMilli() - started.UnixMilli(),
				ProviderRequestID: providerRequestID,
				Quota:             quota,
			}
			if failure != nil {
				record.ErrorCode = &failure.Code
				record.ErrorDetail = &failure.Detail
			}
			if err := c.onRequest(ctx, record); err != nil {
				return js.Value{}, QuotaSnapshot{}, err
			}
		}

		if failure == nil {
			return body, quota, nil
		}
		if failure.Permanent || attempt >= c.maxRetries {
			return js.Value{}, QuotaSnapshot{}, failure
		}

		// Honour the server's own number when it gave one; otherwise back off. Capped,
		// because an Edge Function had 150s total (Tech-Recommendations §7) and a 429 that
		// resets next month is not something to wait out inside a request.
		var waitMs float64
		if failure.RetryAfterSeconds != nil {
			waitMs = math.Min(*failure.RetryAfterSeconds*1000, 30_000)
		} else {
			waitMs = math.Min(500*math.Pow(2, float64(attempt)), 8_000)
		}
		if err := c.sleep(ctx, time.Duration(waitMs*float64(time.Millisecond))); err != nil {
			return js.Value{}, QuotaSnapshot{}, err
		}
	}
}

func readQuota(h http.Header) QuotaSnapshot {
	return QuotaSnapshot{
		Limit:        intHeader(h, "x-ratelimit-requests-limit"),
		Remaining:    intHeader(h, "x-ratelimit-requests-remaining"),
		ResetSeconds: intHeader(h, "x-ratelimit-requests-reset"),
	}
}

// intHeader is `Number.parseInt(raw, 10)` when finite: leading JavaScript whitespace and a
// sign allowed, digits up to the first non-digit ("12abc" is 12, "1e3" is 1). Headers.get
// joins repeated headers with ", ", so the first one's digits win, as here. A value past
// 2^63 is nil; Deno carried the float on to an integer column that refused it.
func intHeader(h http.Header, name string) *int64 {
	values, ok := h[http.CanonicalHeaderKey(name)]
	if !ok {
		return nil
	}
	s := js.TrimStart(strings.Join(values, ", "))
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
		return nil
	}
	f, _ := strconv.ParseFloat(s[:end], 64)
	if neg {
		f = -f
	}
	return int64OrNil(f)
}

// decodeText is response.text(): UTF-8 with one leading byte-order mark removed, and each
// maximal invalid sequence replaced by U+FFFD as the WHATWG decoder does (strings.ToValidUTF8
// would fold a whole run of bad bytes into one).
func decodeText(b []byte) string {
	if len(b) >= 3 && b[0] == 0xef && b[1] == 0xbb && b[2] == 0xbf {
		b = b[3:]
	}
	if utf8.Valid(b) {
		return string(b)
	}
	var out strings.Builder
	for i := 0; i < len(b); {
		r, size := utf8.DecodeRune(b[i:])
		if r != utf8.RuneError || size > 1 {
			out.Write(b[i : i+size])
			i += size
			continue
		}
		out.WriteString("\U0000FFFD")
		i += maximalSubpart(b[i:])
	}
	return out.String()
}

// maximalSubpart is how many bytes one U+FFFD replaces: a lead byte plus whatever
// continuation bytes are still possible after it.
func maximalSubpart(b []byte) int {
	c := b[0]
	var need int
	lo, hi := byte(0x80), byte(0xbf)
	switch {
	case c >= 0xc2 && c <= 0xdf:
		need = 1
	case c == 0xe0:
		need, lo = 2, 0xa0
	case c >= 0xe1 && c <= 0xec, c == 0xee, c == 0xef:
		need = 2
	case c == 0xed:
		need, hi = 2, 0x9f
	case c == 0xf0:
		need, lo = 3, 0x90
	case c >= 0xf1 && c <= 0xf3:
		need = 3
	case c == 0xf4:
		need, hi = 3, 0x8f
	default:
		return 1
	}
	n := 1
	for ; n <= need && n < len(b); n++ {
		if b[n] < lo || b[n] > hi {
			break
		}
		lo, hi = 0x80, 0xbf
	}
	return n
}

// safeJSONParse is the Deno helper: null for an empty or unparsable body. (text() already
// removed one byte-order mark; JSON.parse refuses a second, which js.Parse would skip.)
func safeJSONParse(text string) js.Value {
	if text == "" || strings.HasPrefix(text, "\U0000FEFF") {
		return js.NullValue()
	}
	v, err := js.Parse([]byte(text))
	if err != nil {
		return js.NullValue()
	}
	return v
}

func extractRequestID(parsed js.Value) *string {
	if s, ok := parsed.Get("request_id").Str(); ok {
		return &s
	}
	return nil
}

// countRows is the rows in the response, for the ledger. It detects a silent tier clamp: the
// provider clamps an over-tier `limit` down to the cap and still answers 200, so a run that
// asks for 100 and is quietly handed 10 looks perfectly healthy without this.
func countRows(parsed js.Value) *int {
	data := parsed.Get("data")
	if items, ok := data.Array(); ok {
		n := len(items)
		return &n
	}
	if data.IsPlainObject() {
		one := 1
		return &one
	}
	return nil
}

// toError is both error shapes, into one error.
//
// Retryability is decided here and only here, because getting it wrong is expensive in both
// directions: retrying a 401 burns three requests to learn the key is still bad, and not
// retrying a 503 loses a run to a blip.
func toError(status int, header http.Header, parsed js.Value, rawText string, quota QuotaSnapshot, apiKey string) *TrackCruisesError {
	// Shape 1: their backend, RFC 9457. Shape 2: the relay, `{"message": "..."}` with no code
	// and no request_id. (A field of the wrong type reads as absent; see types.go.)
	code := relayCode(status)
	if s, ok := parsed.Get("code").Str(); ok {
		code = s
	}
	var retryAfter *float64
	if n, ok := parsed.Get("retry_after_seconds").Num(); ok {
		retryAfter = &n
	} else if h := intHeader(header, "retry-after"); h != nil {
		f := float64(*h)
		retryAfter = &f
	}

	detail := js.Slice(rawText, 0, 300)
	if detail == "" {
		detail = "HTTP " + strconv.Itoa(status)
	}
	for _, key := range []string{"title", "message", "detail"} { // last found wins: detail ?? message ?? title
		if s, ok := parsed.Get(key).Str(); ok {
			detail = s
		}
	}

	// 401: the key is wrong or unsubscribed. 403: a tier gate (price-history on BASIC); their
	// spec sets `required_tier` on these. 400/404: our bug or a real absence. Every one is
	// permanent: a retry cannot change the answer and each attempt is metered.
	//
	// A 429 WITH NO Retry-After IS ALSO PERMANENT FOR THIS RUN, the non-obvious one. Their
	// backend sends `retry_after_seconds`, and those waits are short and worth honouring. The
	// RapidAPI relay's own per-minute throttle sends neither header nor field, and the window
	// it wants is ~60s against a backoff of hundreds of milliseconds: retrying fails again,
	// twice, three metered requests to learn nothing (measured: 6 requests on a scope budgeted
	// for 4). Giving up costs nothing, because the scope's cursor persists and the next run
	// continues from the same page.
	throttledWithoutGuidance := status == 429 && retryAfter == nil
	permanent := status == 400 || status == 401 || status == 403 || status == 404 || throttledWithoutGuidance

	return &TrackCruisesError{
		Status:            &status,
		Code:              code,
		Detail:            redact(detail, apiKey),
		Permanent:         permanent,
		RetryAfterSeconds: retryAfter,
		RequiredTier:      optString(parsed.Get("required_tier")),
		ProviderRequestID: optString(parsed.Get("request_id")),
		Quota:             quota,
	}
}

func relayCode(status int) string {
	switch {
	case status == 401:
		return "unauthorized"
	case status == 403:
		return "tier_insufficient"
	case status == 404:
		return "not_found"
	case status == 429:
		return "rate_limit_exceeded"
	case status >= 500:
		return "upstream_error"
	}
	return "http_" + strconv.Itoa(status)
}

// redact is the last line of defence before an error string is persisted or logged. The key
// should never reach here (it lives only in a header), but `error_detail` outlives the
// incident, and a credential in a table is worse than the failure that put it there.
func redact(text, apiKey string) string {
	if apiKey == "" {
		return text
	}
	return strings.ReplaceAll(text, apiKey, "[redacted]")
}

// encodeURIComponent escapes everything but A-Z a-z 0-9 - _ . ! ~ * ' ( ).
func encodeURIComponent(s string) string {
	return escape(s, "-_.!~*'()")
}

// formEncode is URLSearchParams' serialization: A-Z a-z 0-9 * - . _ as they are, a space as
// "+", everything else percent-encoded. (url.QueryEscape differs on "*" and "~".)
func formEncode(s string) string {
	return strings.ReplaceAll(escape(s, "*-._ "), " ", "+")
}

func escape(s, keep string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.IndexByte(keep, c) >= 0 {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hex[c>>4])
		b.WriteByte(hex[c&0xf])
	}
	return b.String()
}

// resolveDots is what `new URL()` does to the path's "." and ".." segments. Only a cruise id
// of "." or ".." can produce one ("/cruises/.." is "/"), since encodeURIComponent escapes
// "/" and "%".
func resolveDots(path string) string {
	segs := strings.Split(path[1:], "/")
	var out []string
	for i, seg := range segs {
		last := i == len(segs)-1
		switch seg {
		case "..":
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
			if last {
				out = append(out, "")
			}
		case ".":
			if last {
				out = append(out, "")
			}
		default:
			out = append(out, seg)
		}
	}
	return "/" + strings.Join(out, "/")
}
